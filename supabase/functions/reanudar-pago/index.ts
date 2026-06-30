// ============================================================
// FRATE — Edge Function: reanudar-pago
// Retoma un pedido PENDIENTE (o EXPIRADO) y genera un nuevo link
// de pago en MercadoPago para el MISMO pedido. Permite que el
// usuario complete una compra que abandonó, sin crear un pedido
// nuevo ni duplicar stock.
//
// Re-valida el stock antes de generar el link (si el cupo se agotó
// entre medio, no deja pagar).
//
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { pedidoId } = await req.json() as { pedidoId: number };
    if (!pedidoId) throw new Error('Falta el pedido a pagar.');

    // Cargar pedido + items
    const { data: pedido, error: e0 } = await sb.from('pedidos')
      .select('*, items_pedido(*)').eq('id', pedidoId).single();
    if (e0 || !pedido) throw new Error('Pedido no encontrado.');

    if (pedido.estado === 'pagado')    throw new Error('Este pedido ya está pagado.');
    if (pedido.estado === 'cancelado') throw new Error('Este pedido fue cancelado.');
    // Solo se puede retomar pendiente o expirado
    if (!['pendiente', 'expirado'].includes(pedido.estado)) {
      throw new Error('Este pedido no se puede pagar.');
    }

    // Re-validar stock de los tickets del pedido
    const ticketItems = (pedido.items_pedido || []).filter((ip: any) => ip.tipo_ticket_id);
    if (ticketItems.length) {
      const ttIds = [...new Set(ticketItems.map((ip: any) => ip.tipo_ticket_id))];
      const { data: tts } = await sb.from('tipos_ticket')
        .select('id,nombre,disponible,estado').in('id', ttIds);
      const ttMap = new Map((tts || []).map((t: any) => [t.id, t]));
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

    // Si estaba expirado, revivirlo a pendiente
    if (pedido.estado === 'expirado') {
      await sb.from('pedidos').update({ estado: 'pendiente' }).eq('id', pedidoId);
    }

    const totalPagado = pedido.total_pagado || (pedido.total + (pedido.fee_servicio || 0));

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
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: cors });
  }
});
