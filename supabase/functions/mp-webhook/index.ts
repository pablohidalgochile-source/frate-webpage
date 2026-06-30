// ============================================================
// FRATE — Edge Function: mp-webhook
// Recibe la notificación de MercadoPago cuando hay un pago.
// VERIFICA el pago contra la API de MP (no confía en el aviso).
// Si está aprobado: marca el pedido 'pagado' (dispara el trigger de
// stock) y envía el comprobante con QRs por email.
// Idempotente: si el pedido ya está pagado, no hace nada.
//
// IMPORTANTE: esta función debe deployarse SIN verificación de JWT
// (verify_jwt = false en config.toml), porque MercadoPago no envía
// el apikey de Supabase.
//
// Secrets requeridos:
//   MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // MP espera SIEMPRE un 200, si no reintenta. Capturamos todo y
  // respondemos 200 salvo errores que valga la pena reintentar.
  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) { console.error('[mp-webhook] sin MP_ACCESS_TOKEN'); return ok(); }

    // El payment id puede venir por query (?type=payment&data.id=) o por body.
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const topic   = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!paymentId) {
      try {
        const body = await req.json();
        paymentId = body?.data?.id || body?.id || null;
      } catch { /* sin body */ }
    }

    // Solo nos interesan notificaciones de pago
    if (topic && topic !== 'payment') return ok();
    if (!paymentId) return ok();

    // ── Verificar el pago contra la API de MercadoPago ───────────
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (!payRes.ok) { console.error('[mp-webhook] no se pudo leer el pago', paymentId); return ok(); }
    const pago = await payRes.json();

    const pedidoId = Number(pago.external_reference);
    if (!pedidoId) { console.error('[mp-webhook] pago sin external_reference'); return ok(); }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotencia: si ya está pagado, no reprocesar
    const { data: pedido } = await sb.from('pedidos')
      .select('*, items_pedido(*)').eq('id', pedidoId).single();
    if (!pedido) { console.error('[mp-webhook] pedido no encontrado', pedidoId); return ok(); }
    if (pedido.estado === 'pagado') return ok();

    // Solo procesar pagos aprobados
    if (pago.status !== 'approved') {
      // registrar el estado para visibilidad (rechazado / pendiente)
      await sb.from('pedidos').update({
        referencia_pago: `MP-${paymentId}-${pago.status}`,
      }).eq('id', pedidoId);
      return ok();
    }

    // ── Marcar pagado → dispara el trigger de descuento de stock ──
    const { error: upErr } = await sb.from('pedidos').update({
      estado:          'pagado',
      referencia_pago: `MP-${paymentId}`,
      fecha_pago:      new Date().toISOString(),
    }).eq('id', pedidoId).eq('estado', 'pendiente'); // condición evita doble proceso

    if (upErr) {
      // El trigger lanza excepción SIN_STOCK si el cupo se agotó entre medio.
      // En ese caso el pago está aprobado pero no hay stock → marcar para
      // reembolso manual (no entregamos ticket inválido).
      console.error('[mp-webhook] error al marcar pagado:', upErr.message);
      await sb.from('pedidos').update({
        estado:          'requiere_reembolso',
        referencia_pago: `MP-${paymentId}-SINSTOCK`,
      }).eq('id', pedidoId);
      return ok();
    }

    // Incrementar uso del código (solo en pagos confirmados)
    if (pedido.codigo_id) {
      try { await sb.rpc('incrementar_uso_codigo', { p_codigo_id: pedido.codigo_id }); }
      catch (e) { console.error('[mp-webhook] incrementar_uso_codigo:', e); }
    }

    // Otorgar PUNTOS al cliente (tasa configurable: pesos por punto)
    if (pedido.cliente_id) {
      try {
        const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'puntos_pesos_por_punto').maybeSingle();
        const pesosPorPunto = Math.max(1, parseInt(cfg?.valor || '100'));
        const puntos = Math.floor((pedido.total_pagado || 0) / pesosPorPunto);
        if (puntos > 0) {
          const { data: cli } = await sb.from('clientes').select('puntos').eq('id', pedido.cliente_id).maybeSingle();
          await sb.from('clientes').update({ puntos: (cli?.puntos || 0) + puntos }).eq('id', pedido.cliente_id);
          await sb.from('movimientos').insert({ cliente_id: pedido.cliente_id, tipo: 'puntos', monto: puntos, concepto: 'Compra FCC-' + String(pedido.id).padStart(6, '0'), pedido_id: pedido.id });
        }
      } catch (e) { console.error('[mp-webhook] puntos:', e); }
    }

    // ── REFERIDOS: recompensa al primer pago del invitado ────────
    if (pedido.cliente_id) {
      try {
        const { data: buyer } = await sb.from('clientes')
          .select('id, username, referido_por_codigo, referido_recompensado').eq('id', pedido.cliente_id).maybeSingle();
        if (buyer && buyer.referido_por_codigo && !buyer.referido_recompensado) {
          const { data: ref } = await sb.from('clientes')
            .select('id, credito, username').eq('username', String(buyer.referido_por_codigo).toLowerCase()).maybeSingle();
          if (ref && ref.id !== buyer.id) {
            const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'referido_monto').maybeSingle();
            const monto = Math.max(0, parseInt(cfg?.valor || '1000'));
            if (monto > 0) {
              const { data: bc } = await sb.from('clientes').select('credito').eq('id', buyer.id).maybeSingle();
              await sb.from('clientes').update({ credito: (bc?.credito || 0) + monto, referido_recompensado: true }).eq('id', buyer.id);
              await sb.from('movimientos').insert({ cliente_id: buyer.id, tipo: 'credito', monto, concepto: 'Te invitó @' + ref.username });
              await sb.from('clientes').update({ credito: (ref.credito || 0) + monto }).eq('id', ref.id);
              await sb.from('movimientos').insert({ cliente_id: ref.id, tipo: 'credito', monto, concepto: 'Referiste a @' + (buyer.username || 'un amig@') });
            }
          } else {
            await sb.from('clientes').update({ referido_recompensado: true }).eq('id', buyer.id); // código inválido/propio
          }
        }
      } catch (e) { console.error('[mp-webhook] referido:', e); }
    }

    // ── MEMBRESÍA: si el pedido es la compra de un pase, activarla ──
    if (pedido.membresia_id) {
      try {
        const { data: mem } = await sb.from('membresias').select('*').eq('id', pedido.membresia_id).maybeSingle();
        if (mem && pedido.cliente_id) {
          const hasta = new Date(Date.now() + (mem.duracion_dias || 60) * 24 * 60 * 60 * 1000).toISOString();
          await sb.from('clientes').update({
            membresia_id:     mem.id,
            membresia_nombre: mem.nombre,
            membresia_hasta:  hasta,
          }).eq('id', pedido.cliente_id);
        }
      } catch (e) { console.error('[mp-webhook] membresia:', e); }
      return ok(); // membresía no lleva QRs; terminamos aquí
    }

    // ── Construir orden y enviar comprobantes ────────────────────
    const order = buildOrder(pedido);
    const buyerEmail = (pedido.email_cliente || '').toLowerCase();

    // 1) Email al COMPRADOR con TODOS los QRs
    await sendReceipt({ order });

    // 2) Email INDIVIDUAL a cada invitado (persona con email propio,
    //    distinto al del comprador) — solo su propio QR.
    for (const item of order.items as any[]) {
      const personas = Array.isArray(item.personas) ? item.personas : [];
      const qrIds    = Array.isArray(item.qr_ids)   ? item.qr_ids   : [];
      for (let p = 0; p < personas.length; p++) {
        const persona = personas[p];
        const email   = (persona?.email || '').trim();
        if (!email) continue;
        if (email.toLowerCase() === buyerEmail) continue; // el comprador ya recibió todos
        const guestOrder = {
          id:        order.id,
          pedidoId:  order.pedidoId,
          items:     [{ ...item, cantidad: 1, personas: [persona], _qrOverride: qrIds[p] || undefined }],
          comprador: { nombre: persona.nombre || 'Invitado', email },
          total:     item.precio,
          fecha:     order.fecha,
        };
        await sendReceipt({ order: guestOrder });
      }
    }

    return ok();
  } catch (err) {
    console.error('[mp-webhook]', err);
    return ok(); // siempre 200 para que MP no reintente en loop
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// Llama a send-receipt. No lanza error (un email fallido no debe romper el webhook).
async function sendReceipt(payload: any) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[mp-webhook] send-receipt falló (pago OK):', e);
  }
}

// Reconstruye el objeto `order` que espera send-receipt desde el pedido en DB.
function buildOrder(pedido: any) {
  const items = (pedido.items_pedido || []).map((ip: any) => ({
    tipo:       ip.producto_tipo === 'ticket' ? (ip.nombre_ticket || 'TICKET') : ip.producto_tipo,
    nombre:     ip.nombre_evento || ip.nombre_ticket || 'Producto',
    precio:     ip.precio_unitario,
    cantidad:   ip.cantidad,
    detalle:    ip.detalle || '',
    productoId: ip.producto_id || undefined,
    ttId:       ip.tipo_ticket_id || undefined,
    eventoId:   ip.evento_id || undefined,
    personas:   Array.isArray(ip.personas) ? ip.personas : [],
    qr_ids:     Array.isArray(ip.qr_ids) ? ip.qr_ids : [],
  }));
  return {
    id:        'FCC-' + String(pedido.id).padStart(6, '0'),
    pedidoId:  pedido.id,
    items,
    comprador: { nombre: pedido.nombre_cliente, email: pedido.email_cliente },
    total:     pedido.total,
    fecha:     pedido.fecha_pago || pedido.created_at || new Date().toISOString(),
  };
}
