// ============================================================
// FRATE — Edge Function: khipu-webhook
// Recibe la notificación de Khipu cuando un pago por transferencia
// se concreta. VERIFICA el pago contra la API de Khipu (no confía en
// el aviso), marca el pedido 'pagado' y emite el QR por correo.
// Idempotente. Mismo patrón seguro que mp-webhook.
//
// verify_jwt = false (Khipu no manda apikey de Supabase).
// Secrets: KHIPU_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

// Versión FIJA y no `@2`: el 2026-08-04 `@2` empezó a resolver a la 2.112.1,
// que esm.sh no puede servir (su submódulo auth-js devuelve 404) y el deploy
// de CUALQUIER función fallaba. Con la versión clavada esto no vuelve a pasar
// por un cambio de terceros.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { avisarStaff } from '../_shared/avisar.ts';

const KHIPU_API = 'https://payment-api.khipu.com/v3/payments';

Deno.serve(async (req: Request) => {
  try {
    const KHIPU_KEY = Deno.env.get('KHIPU_API_KEY');
    if (!KHIPU_KEY) { console.error('[khipu-webhook] sin KHIPU_API_KEY'); return ok(); }

    // El payment_id puede venir por body (JSON) o por query.
    const url = new URL(req.url);
    let paymentId: string | null = url.searchParams.get('payment_id');
    let body: any = null;
    try { body = await req.json(); } catch { /* sin body */ }
    paymentId = paymentId || body?.payment_id || body?.id || null;
    if (!paymentId) { console.error('[khipu-webhook] sin payment_id'); return ok(); }

    // ── Verificar el pago contra la API de Khipu ─────────────────
    const payRes = await fetch(`${KHIPU_API}/${paymentId}`, {
      headers: { 'x-api-key': KHIPU_KEY },
    });
    if (!payRes.ok) { console.error('[khipu-webhook] no se pudo leer el pago', paymentId); return ok(); }
    const pago = await payRes.json();

    const pedidoId = Number(pago.transaction_id);
    if (!pedidoId) { console.error('[khipu-webhook] pago sin transaction_id'); return ok(); }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotencia
    const { data: pedido } = await sb.from('pedidos')
      .select('*, items_pedido(*)').eq('id', pedidoId).single();
    if (!pedido) { console.error('[khipu-webhook] pedido no encontrado', pedidoId); return ok(); }
    if (pedido.estado === 'pagado') return ok();

    // Solo pagos conciliados por Khipu ('done')
    if (pago.status !== 'done') {
      await sb.from('pedidos').update({ referencia_pago: `KHIPU-${paymentId}-${pago.status}` }).eq('id', pedidoId);
      return ok();
    }

    // Cinturón: el monto pagado debe cubrir el total del pedido
    const montoPagado   = Number(pago.amount) || 0;
    const montoEsperado = Number(pedido.total_pagado ?? pedido.total) || 0;
    if (montoEsperado > 0 && montoPagado + 1 < montoEsperado) {
      console.error(`[khipu-webhook] monto insuficiente: ${montoPagado} de ${montoEsperado} (pedido ${pedidoId})`);
      await sb.from('pedidos').update({ referencia_pago: `KHIPU-${paymentId}-MONTO-${montoPagado}` }).eq('id', pedidoId);
      return ok();
    }

    // ── Marcar pagado (pendiente O expirado) → dispara stock ──────
    const { data: upRows, error: upErr } = await sb.from('pedidos').update({
      estado: 'pagado', metodo_pago: 'khipu',
      referencia_pago: `KHIPU-${paymentId}`, fecha_pago: new Date().toISOString(),
    }).eq('id', pedidoId).in('estado', ['pendiente', 'expirado']).select('id');

    if (upErr) {
      // Trigger SIN_STOCK → cobro sin cupo → reembolso manual
      console.error('[khipu-webhook] error al marcar pagado:', upErr.message);
      await sb.from('pedidos').update({ estado: 'requiere_reembolso', referencia_pago: `KHIPU-${paymentId}-SINSTOCK` }).eq('id', pedidoId);
      try {
        const { data: pd } = await sb.from('pedidos').select('nombre_cliente,email_cliente,total_pagado,total').eq('id', pedidoId).maybeSingle();
        await avisarStaff(sb, {
          titulo: '🚨 PAGÓ Y NO HABÍA CUPO — orden FCC-' + String(pedidoId).padStart(6, '0'),
          detalle: `${pd?.nombre_cliente || 'Cliente'} pagó $${Number(pd?.total_pagado || pd?.total || 0).toLocaleString('es-CL')} por transferencia y NO tiene entrada.\n${pd?.email_cliente || ''}\n\nAdmin → Órdenes → ⚠️ Reembolsar → "➕ Dar cupo".`,
        });
      } catch (_) { /* nunca romper el webhook */ }
      return ok();
    }
    if (!upRows || upRows.length === 0) {
      console.warn('[khipu-webhook] pago done pero el pedido no estaba pendiente/expirado', pedidoId, 'estado:', pedido.estado);
      return ok();
    }

    // Incrementar uso del código (si aplica)
    if (pedido.codigo_id) {
      try { await sb.rpc('incrementar_uso_codigo', { p_codigo_id: pedido.codigo_id }); }
      catch (e) { console.error('[khipu-webhook] incrementar_uso_codigo:', e); }
    }

    // Puntos al cliente
    if (pedido.cliente_id) {
      try {
        // El interruptor maestro de Puntos & Premios. Sin esto, apagarlo en el
        // admin no serviría de nada: los puntos se otorgan acá, en el servidor,
        // sin pasar por ninguna pantalla. Sin fila = apagado, nunca al revés.
        const { data: _on } = await sb.from('config_valores').select('valor').eq('clave', 'lealtad_on').maybeSingle();
        const lealtadOn = ['true','1','si','sí','on'].includes(String(_on?.valor || '').trim().toLowerCase());
        const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'puntos_pesos_por_punto').maybeSingle();
        const pesosPorPunto = Math.max(1, parseInt(cfg?.valor || '100'));
        const puntos = lealtadOn ? Math.floor((pedido.total_pagado || 0) / pesosPorPunto) : 0;
        if (puntos > 0) {
          const { data: cli } = await sb.from('clientes').select('puntos').eq('id', pedido.cliente_id).maybeSingle();
          await sb.from('clientes').update({ puntos: (cli?.puntos || 0) + puntos }).eq('id', pedido.cliente_id);
          await sb.from('movimientos').insert({ cliente_id: pedido.cliente_id, tipo: 'puntos', monto: puntos, concepto: 'Compra FCC-' + String(pedido.id).padStart(6, '0'), pedido_id: pedido.id });
        }
      } catch (e) { console.error('[khipu-webhook] puntos:', e); }
    }

    // Membresía (si el pedido es un pase) → activar y terminar
    if (pedido.membresia_id) {
      try {
        const { data: mem } = await sb.from('membresias').select('*').eq('id', pedido.membresia_id).maybeSingle();
        if (mem && pedido.cliente_id) {
          const hasta = new Date(Date.now() + (mem.duracion_dias || 60) * 24 * 60 * 60 * 1000).toISOString();
          await sb.from('clientes').update({ membresia_id: mem.id, membresia_nombre: mem.nombre, membresia_hasta: hasta }).eq('id', pedido.cliente_id);
        }
      } catch (e) { console.error('[khipu-webhook] membresia:', e); }
      return ok();
    }

    // ── Enviar comprobantes con QR (comprador + invitados) ───────
    const order = buildOrder(pedido);
    const buyerEmail = (pedido.email_cliente || '').toLowerCase();
    await sendReceipt({ order });
    for (const item of order.items as any[]) {
      const personas = Array.isArray(item.personas) ? item.personas : [];
      const qrIds    = Array.isArray(item.qr_ids)   ? item.qr_ids   : [];
      for (let p = 0; p < personas.length; p++) {
        const persona = personas[p];
        const email = (persona?.email || '').trim();
        if (!email || email.toLowerCase() === buyerEmail) continue;
        await sendReceipt({ order: {
          id: order.id, pedidoId: order.pedidoId,
          items: [{ ...item, cantidad: 1, personas: [persona], _qrOverride: qrIds[p] || undefined }],
          comprador: { nombre: persona.nombre || 'Invitado', email }, total: item.precio, fecha: order.fecha,
        } });
      }
    }

    return ok();
  } catch (err) {
    console.error('[khipu-webhook]', err);
    return ok();
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

async function sendReceipt(payload: any) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.error('[khipu-webhook] send-receipt falló (pago OK):', e); }
}

function buildOrder(pedido: any) {
  const items = (pedido.items_pedido || []).map((ip: any) => ({
    tipo:       ip.producto_tipo === 'ticket' ? (ip.nombre_ticket || 'TICKET') : ip.producto_tipo,
    nombre:     ip.nombre_evento || ip.nombre_ticket || 'Producto',
    precio:     ip.precio_unitario, cantidad: ip.cantidad, detalle: ip.detalle || '',
    productoId: ip.producto_id || undefined, ttId: ip.tipo_ticket_id || undefined, eventoId: ip.evento_id || undefined,
    personas:   Array.isArray(ip.personas) ? ip.personas : [], qr_ids: Array.isArray(ip.qr_ids) ? ip.qr_ids : [],
  }));
  return {
    id: 'FCC-' + String(pedido.id).padStart(6, '0'), pedidoId: pedido.id, items,
    comprador: { nombre: pedido.nombre_cliente, email: pedido.email_cliente },
    total: pedido.total, fecha: pedido.fecha_pago || pedido.created_at || new Date().toISOString(),
  };
}
