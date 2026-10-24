// ============================================================
// FRATE — Edge Function: reanudar-pago
// Retoma un pedido PENDIENTE (o EXPIRADO) y genera un nuevo link
// de pago en MercadoPago para el MISMO pedido. Permite que el
// usuario complete una compra que abandonó, sin crear un pedido
// nuevo ni duplicar stock.
//
// Re-valida el stock antes de generar el link (si el cupo se agotó
// entre medio, no deja pagar), que el tramo de preventa siga abierto
// (venta_desde / venta_hasta) y que el pedido no sea un fósil
// (HORAS_PARA_RETOMAR). Nunca re-precia: si algo cambió, rechaza.
//
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { uidDelToken, emailDelToken, tokenPedido } from '../_shared/guard.ts';
import { rateOk, demasiados } from '../_shared/rate.ts';

const SITE_URL = 'https://frate.cl';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurada');

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { pedidoId, medio, email, t } = await req.json() as { pedidoId: number; medio?: string; email?: string; t?: string };
    if (!pedidoId) throw new Error('Falta el pedido a pagar.');
    if (!(await rateOk(sb, req, 'reanudar', 10, 300))) return demasiados(cors);

    // Cargar pedido + items
    const { data: pedido, error: e0 } = await sb.from('pedidos')
      .select('*, items_pedido(*)').eq('id', pedidoId).single();
    if (e0 || !pedido) throw new Error('Pedido no encontrado.');

    // 🔒 Antes bastaba con el número de orden (correlativo): se podían recorrer
    //    todas las órdenes ajenas, ver sus totales y pisarles la referencia de pago.
    //    Ahora hay que demostrar que la orden es tuya, de una de estas tres formas.
    {
      const propioUid = await uidDelToken(req);
      const propioMail = (await emailDelToken(req) || '').toLowerCase();
      const mailPedido = String(pedido.email_cliente || '').trim().toLowerCase();
      const esDuenio =
        (propioUid && pedido.cliente_id && String(pedido.cliente_id) === String(propioUid)) ||
        (propioMail && mailPedido && propioMail === mailPedido) ||
        (email && mailPedido && String(email).trim().toLowerCase() === mailPedido) ||
        (t && t === await tokenPedido(pedido.id, pedido.created_at));
      if (!esDuenio) {
        return new Response(JSON.stringify({ error: 'Para retomar esta compra confirma el correo con el que la hiciste.', necesita_verificacion: true }), { status: 403, headers: cors });
      }
    }

    // 🎂 Un cobro de cumpleaños/reserva (origen 'crm') NO se retoma desde acá.
    //    Su link lo maneja crm-pago: si lo anularon o lo reemplazaron, el pedido
    //    queda 'expirado' a propósito, y revivirlo con un link nuevo abriría la
    //    puerta a pagar un cobro muerto (o pagar dos veces la misma ficha).
    //    Va después de la verificación de dueño para no delatar qué órdenes son cobros.
    if (pedido.origen === 'crm') {
      return new Response(JSON.stringify({ error: 'Este pago es de un cumpleaños o reserva y no se retoma desde acá. Usa el link que te mandamos o escríbenos por WhatsApp.', code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
    }

    if (pedido.estado === 'pagado')    throw new Error('Este pedido ya está pagado.');
    if (pedido.estado === 'cancelado') throw new Error('Este pedido fue cancelado.');
    // Solo se puede retomar pendiente o expirado
    if (!['pendiente', 'expirado'].includes(pedido.estado)) {
      throw new Error('Este pedido no se puede pagar.');
    }

    // ⏰ TOPE DE ANTIGÜEDAD. El token del link es un SHA-256 estable de `id:created_at:llave`
    //    (_shared/guard.ts) y NO VENCE NUNCA: hasta hoy un link guardado o reenviado por
    //    WhatsApp servía para siempre, así que un carrito de hace semanas se pagaba al precio
    //    de entonces. 72 h es el número, y sale de dos hechos:
    //    · el único camino automático a este link es el correo de recordatorio, que sale UNA
    //      vez y solo para pedidos de entre 45 min y 24 h de edad (recordar-pendientes) →
    //      quedan dos días completos de margen para abrirlo y pagar. Nadie legítimo se queda
    //      afuera, y el que se queda afuera vuelve a comprar: no se pierde la venta.
    //    · pasadas las 72 h el carrito es un fósil: al expirar ya se le devolvió el cupo
    //      (crear-pago lo suelta con liberar_cupo) y acá NO se vuelve a tomar, así que lo más
    //      probable es que ese asiento ya se haya vendido de nuevo.
    //    Si la fecha no se puede leer, se rechaza (en el camino de la plata se falla cerrado:
    //    el costo es que la persona arme la compra de nuevo, no un cobro mal hecho).
    const HORAS_PARA_RETOMAR = 72;
    const edadHoras = (Date.now() - new Date(pedido.created_at).getTime()) / 3600000;
    if (!(edadHoras >= 0) || edadHoras > HORAS_PARA_RETOMAR) {
      return new Response(JSON.stringify({ error: 'Este link de pago es muy antiguo. Vuelve al evento y arma tu compra de nuevo.', code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
    }

    // Re-validar stock de los tickets del pedido
    const ticketItems = (pedido.items_pedido || []).filter((ip: any) => ip.tipo_ticket_id);
    if (ticketItems.length) {
      const ttIds = [...new Set(ticketItems.map((ip: any) => ip.tipo_ticket_id))];
      const { data: tts } = await sb.from('tipos_ticket')
        .select('*').in('id', ttIds);
      const ttMap = new Map((tts || []).map((t: any) => [t.id, t]));
      // Entradas personales (de miembros o una por persona) que vencieron no se
      // reviven: al vencer se soltó el candado y alguien más pudo tomarla.
      const especial = (tts || []).some((t: any) => t.solo_miembros || t.uno_por_persona);
      if (especial && pedido.estado === 'expirado') {
        return new Response(JSON.stringify({ error: 'Esta reserva era personal y venció. Vuelve a reservarla desde el evento.', code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
      }

      // ⏳ VENTANA DE VENTA (tramos de preventa). venta_desde / venta_hasta son instantes
      //    ABSOLUTOS (timestamptz con offset), así que se comparan contra `new Date()` y no
      //    contra ningún marco local: acá no existe el equivalente de `nowCL` y no debe
      //    existir. Si el tramo cerró, este pedido NO se retoma.
      //    Y NO se re-precia: reescribir items_pedido y el total de una orden que puede tener
      //    una preferencia de MercadoPago viva es la receta del cobro doble y del descuadre
      //    del webhook. Se rechaza con NO_REANUDABLE (el front ya lo maneja) y la persona
      //    vuelve al evento a comprar con el precio vigente.
      //    Si las columnas todavía no existen, llegan undefined y no se chequea nada: igual
      //    que hoy.
      const ahora = new Date();
      for (const t of (tts || [])) {
        const desde = (t as any).venta_desde ? new Date((t as any).venta_desde) : null;
        const hasta = (t as any).venta_hasta ? new Date((t as any).venta_hasta) : null;
        if (desde && !isNaN(+desde) && ahora < desde) {
          return new Response(JSON.stringify({ error: `"${t.nombre}": aún no está a la venta. Vuelve al evento cuando abra.`, code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
        }
        if (hasta && !isNaN(+hasta) && ahora >= hasta) {
          return new Response(JSON.stringify({ error: `"${t.nombre}": esta preventa ya cerró. Vuelve al evento y arma tu compra de nuevo.`, code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
        }
      }

      const errores: string[] = [];
      // sumar cantidades por tipo de ticket
      const necesidad = new Map<number, number>();
      for (const ip of ticketItems) {
        necesidad.set(ip.tipo_ticket_id, (necesidad.get(ip.tipo_ticket_id) || 0) + ip.cantidad);
      }
      for (const [ttId, cant] of necesidad) {
        const tt: any = ttMap.get(ttId);
        if (!tt) { errores.push('Un ticket ya no está disponible.'); continue; }
        if (tt.estado === 'Agotado' || tt.estado === 'Cerrado') { errores.push(`"${tt.nombre}": ${tt.estado.toLowerCase()}.`); continue; }
        if (tt.disponible < cant) { errores.push(`"${tt.nombre}": solo quedan ${tt.disponible}.`); }
      }
      if (errores.length) {
        return new Response(JSON.stringify({ error: errores.join(' · ') }), { status: 409, headers: cors });
      }
    }

    // Un pedido de $0 no tiene nada que pagar: se corta ANTES de revivirlo.
    const _totalAntes = pedido.total_pagado || (pedido.total + (pedido.fee_servicio || 0));
    if (!(Number(_totalAntes) > 0)) {
      return new Response(JSON.stringify({ error: 'Esta reserva no tiene nada que pagar. Revisa tu correo o Mi cuenta.', code: 'NO_REANUDABLE' }), { status: 409, headers: cors });
    }

    // Si estaba expirado, revivirlo a pendiente
    if (pedido.estado === 'expirado') {
      await sb.from('pedidos').update({ estado: 'pendiente' }).eq('id', pedidoId);
    }

    const totalPagado = pedido.total_pagado || (pedido.total + (pedido.fee_servicio || 0));

    // ── KHIPU (transferencia) para el MISMO pedido ──
    if (medio === 'khipu') {
      const KHIPU_KEY = Deno.env.get('KHIPU_API_KEY');
      if (!KHIPU_KEY) throw new Error('Khipu no está configurado (falta KHIPU_API_KEY).');
      const khRes = await fetch('https://payment-api.khipu.com/v3/payments', {
        method: 'POST',
        headers: { 'x-api-key': KHIPU_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPagado, currency: 'CLP',
          subject: `Entradas Frate — Orden #${pedido.id}`,
          transaction_id: String(pedido.id),
          return_url: `${SITE_URL}/pago-exitoso.html`,
          cancel_url: `${SITE_URL}/pago-error.html`,
          notify_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/khipu-webhook`,
          notify_api_version: '3.0',
        }),
      });
      const khData = await khRes.json();
      if (!khRes.ok || !khData?.payment_url) throw new Error(khData?.message || khData?.detail || 'Error creando el pago en Khipu');
      await sb.from('pedidos').update({ metodo_pago: 'khipu', referencia_pago: `KHIPU-${khData.payment_id}` }).eq('id', pedido.id);
      return new Response(JSON.stringify({ ok: true, pedidoId: pedido.id, initPoint: khData.payment_url, total: totalPagado }), { headers: cors });
    }

    // Crear nueva preferencia MercadoPago para el MISMO pedido
    const pref = {
      items: [{
        id:          String(pedido.id),
        title:       `Entradas Frate — Orden #${pedido.id}`,
        quantity:    1,
        currency_id: 'CLP',
        unit_price:  totalPagado,
      }],
      payer: { name: pedido.nombre_cliente, email: pedido.email_cliente },
      external_reference: String(pedido.id),
      back_urls: {
        success: `${SITE_URL}/pago-exitoso.html`,
        pending: `${SITE_URL}/pago-pendiente.html`,
        failure: `${SITE_URL}/pago-error.html`,
      },
      auto_return: 'approved',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      statement_descriptor: 'FRATE',
      // El link retomado vence igual que el original (30 min + 2 de gracia).
      // Si no, retomar sería la puerta de atrás para pagar un cupo ya liberado.
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 32 * 60 * 1000).toISOString(),
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) throw new Error(mpData.message || 'Error creando preferencia MercadoPago');

    await sb.from('pedidos').update({ referencia_pago: `PREF-${mpData.id}` }).eq('id', pedido.id);

    return new Response(JSON.stringify({
      ok: true, pedidoId: pedido.id, initPoint: mpData.init_point, total: totalPagado,
    }), { headers: cors });

  } catch (err) {
    console.error('[reanudar-pago]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
