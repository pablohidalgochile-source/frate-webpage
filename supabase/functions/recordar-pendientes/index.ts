// ============================================================
// FRATE — Edge Function: recordar-pendientes
// Recupera carritos: envía UN correo (nunca más de uno por orden)
// a quienes reservaron y no pagaron, con botón "Pagar ahora".
//
// Reglas: pedidos 'pendiente' o 'expirado', creados hace entre
// 45 minutos y 24 horas, sin recordatorio previo. Máx 20 por
// corrida. La llama el cron cada hora y el botón del admin.
// Pública pero auto-limitada (recordatorio_at evita duplicados).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { tokenPedido } from '../_shared/guard.ts';

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
    const RESEND = Deno.env.get('RESEND_API_KEY');
    if (!RESEND) return new Response(JSON.stringify({ ok: true, enviados: 0, nota: 'RESEND_API_KEY no configurada' }), { headers: cors });
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();   // no más viejos de 24 h
    const hasta = new Date(Date.now() - 45 * 60 * 1000).toISOString();     // al menos 45 min de espera

    const { data: pendientes, error: ePend } = await sb.from('pedidos')
      .select('id, nombre_cliente, email_cliente, total_pagado, total, created_at, items_pedido(nombre_evento, nombre_ticket, cantidad, producto_tipo)')
      .in('estado', ['pendiente', 'expirado'])
      // 🎂 Un cobro de cumpleaños/reserva (origen 'crm') no es un carrito: este
      //    correo le promete «tus entradas» y un link para retomar una compra que
      //    no existe. Ese cobro se sigue desde la ficha en el admin.
      .neq('origen', 'crm')
      .is('recordatorio_at', null)
      .gt('created_at', desde)
      .lt('created_at', hasta)
      .not('email_cliente', 'is', null)
      .limit(20);
    // ⚠️ Si la consulta falla (p. ej. falta la columna `origen` porque el SQL 01a
    //    no se ha corrido), se responde 500. Antes salía 200 con 0 enviados y nadie
    //    se enteraba: el 500 queda en la respuesta del cron y en el botón del admin.
    if (ePend) {
      console.error('[recordar-pendientes] consulta:', ePend.message);
      return new Response(JSON.stringify({ error: ePend.message }), { status: 500, headers: cors });
    }

    let enviados = 0;
    for (const p of (pendientes || [])) {
      const items = (p.items_pedido || [])
        .map((i: any) => `${i.cantidad}× ${i.nombre_evento || i.nombre_ticket || 'Producto'}`)
        .join(' · ') || 'Tus entradas';
      const monto = (p.total_pagado || p.total || 0).toLocaleString('es-CL');
      // token: permite retomar la compra desde el correo sin exponer datos ni dejar
      //        que un tercero enumere órdenes ajenas (ver reanudar-pago)
      const link = `https://www.frate.cl/?reanudar=${p.id}&t=${await tokenPedido(p.id, p.created_at)}`;
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Frate Tickets <tickets@frate.cl>',
            to: [p.email_cliente],
            subject: `🎟️ ${p.nombre_cliente ? p.nombre_cliente.split(' ')[0] + ', tus' : 'Tus'} entradas te están esperando`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0A0A0B;color:#f0ede8;padding:28px;border-radius:14px;">
              <h2 style="margin:0 0 6px;">FRATE</h2>
              <p style="color:#a1a1aa;margin:0 0 18px;">Fraternidad Campus Central · Bellavista</p>
              <p>¡Hola ${p.nombre_cliente || ''}! Dejaste tu compra a medio camino y <b>tus entradas siguen reservadas por poco tiempo</b>:</p>
              <p style="background:#141415;border:1px solid #2a2a2c;border-radius:10px;padding:14px;">${items}<br/><b style="color:#D4A832;">Total: $${monto}</b></p>
              <p style="text-align:center;margin:24px 0;">
                <a href="${link}" style="background:#E8363D;color:#fff;text-decoration:none;font-weight:800;padding:14px 30px;border-radius:8px;display:inline-block;">💳 COMPLETAR MI COMPRA</a>
              </p>
              <p style="color:#71717a;font-size:12px;">Si ya no quieres ir, ignora este correo y la reserva se libera sola. Orden FCC-${String(p.id).padStart(6, '0')}.</p>
            </div>`,
          }),
        });
        if (r.ok) {
          await sb.from('pedidos').update({ recordatorio_at: new Date().toISOString() }).eq('id', p.id);
          enviados++;
        }
      } catch (e) { console.error('[recordar-pendientes] mail:', e); }
    }

    return new Response(JSON.stringify({ ok: true, enviados, candidatos: (pendientes || []).length }), { headers: cors });

  } catch (err) {
    console.error('[recordar-pendientes]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
