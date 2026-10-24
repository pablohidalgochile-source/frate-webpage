// ============================================================
// FRATE — Edge Function: solicitar-devolucion
// El CLIENTE pide la devolución de una compra desde su cuenta.
// NO devuelve nada automáticamente: marca la solicitud, deja los
// QRs válidos y le avisa al admin por correo. El admin decide en
// Admin → Devoluciones (aprobar ejecuta devolver-pago / rechazar).
//
// Reglas:
//  · Solo el dueño del pedido puede pedirla.
//  · Solo pedidos 'pagado' sin solicitud previa.
//  · Nunca un cobro de servicio (origen 'crm'): esos los resuelve una persona.
//  · Si TODOS los QRs del pedido ya fueron quemados → no procede
//    (para el caso "quemado pero no entró" existe la incidencia
//    que marca el portero en /validacion).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Usuario autenticado (dueño del pedido)
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'Inicia sesión para solicitar una devolución.' }), { status: 401, headers: cors });

    const { pedidoId, motivo, comentario, opcion } = await req.json() as { pedidoId: number; motivo?: string; comentario?: string; opcion?: string };
    if (!pedidoId) throw new Error('Falta pedidoId');
    const opcionFinal = opcion === 'dinero' ? 'dinero' : 'credito';  // por defecto crédito (reactivación)

    const { data: pedido } = await admin.from('pedidos').select('*, items_pedido(qr_ids, evento_id)').eq('id', pedidoId).single();
    if (!pedido) throw new Error('Pedido no encontrado');
    if (pedido.cliente_id !== uid) return new Response(JSON.stringify({ error: 'Este pedido no es tuyo.' }), { status: 403, headers: cors });

    // 🎂 Un cobro de servicio (cumpleaños/reserva, origen 'crm') NO se devuelve desde acá: no
    //    tiene entradas adentro y esa plata la resuelve una persona en Admin → Órdenes, donde
    //    sí se puede devolver a medias. Va después del chequeo de dueño para no delatar qué
    //    órdenes son cobros. De refuerzo se mira crm_pagos, igual que devolver-pago: un cobro
    //    viejo pudo quedar con origen 'web' (01b sin correr o link del crm-pago viejo).
    let esCobro = (pedido as any).origen === 'crm';
    if (!esCobro) {
      const { data: cps } = await admin.from('crm_pagos').select('id').eq('pedido_id', pedidoId).limit(1);
      esCobro = !!(cps && cps.length);
    }
    if (esCobro) {
      return new Response(JSON.stringify({
        error: 'Este es un pago de un servicio: escríbenos y lo vemos contigo.',
        code: 'ES_COBRO_SERVICIO',
      }), { status: 409, headers: cors });
    }
    if (pedido.estado !== 'pagado') return new Response(JSON.stringify({ error: 'Solo se pueden devolver compras pagadas.' }), { status: 409, headers: cors });
    if (pedido.dev_estado) return new Response(JSON.stringify({ error: 'Ya existe una solicitud para esta compra (' + pedido.dev_estado + ').' }), { status: 409, headers: cors });

    // ¿Todos los QRs quemados? → no procede por esta vía
    const todosQR: string[] = (pedido.items_pedido || []).flatMap((ip: any) => Array.isArray(ip.qr_ids) ? ip.qr_ids : []);
    if (todosQR.length) {
      const { count: usados } = await admin.from('qr_usados').select('*', { count: 'exact', head: true }).in('qr_id', todosQR);
      if ((usados || 0) >= todosQR.length) {
        return new Response(JSON.stringify({ error: 'Tus entradas ya fueron usadas en la puerta, no es posible solicitar devolución por aquí. Si tuviste un problema en el ingreso, escríbenos por WhatsApp.' }), { status: 409, headers: cors });
      }
    }

    // Si el evento YA terminó → esto es una REACTIVACIÓN de ticket no
    // usado: solo dentro de la ventana configurable (48 h por defecto)
    // y siempre como crédito (no dinero post-evento).
    const evIds = [...new Set((pedido.items_pedido || []).map((ip: any) => ip.evento_id).filter(Boolean))];
    if (evIds.length) {
      const { data: evs } = await admin.from('eventos').select('id, fecha, hora_termino').in('id', evIds);
      const nowCL = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
      const finDe = (fecha: string, hora: string) => {
        const [y, m, d] = String(fecha).split('-').map(Number);
        const [hh, mm] = String(hora || '05:00').split(':').map(Number);
        const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
        if ((hh || 0) < 12) dt.setDate(dt.getDate() + 1);
        return dt;
      };
      const fines = (evs || []).filter((e: any) => e.fecha).map((e: any) => finDe(e.fecha, e.hora_termino));
      const todosTerminados = fines.length && fines.every((f: Date) => nowCL > f);
      if (todosTerminados) {
        const { data: cfgH } = await admin.from('config_valores').select('valor').eq('clave', 'reactivacion_horas').maybeSingle();
        const ventana = parseInt(cfgH?.valor || '48') || 48;
        const ultimoFin = new Date(Math.max(...fines.map((f: Date) => f.getTime())));
        const horas = (nowCL.getTime() - ultimoFin.getTime()) / 3600000;
        if (horas > ventana) {
          return new Response(JSON.stringify({ error: `El plazo para reactivar tu entrada venció (${ventana} horas después del evento).` }), { status: 409, headers: cors });
        }
        if (opcionFinal === 'dinero') {
          return new Response(JSON.stringify({ error: 'Después del evento, las entradas no usadas solo se pueden reactivar como crédito FRATE.' }), { status: 409, headers: cors });
        }
      }
    }

    const motivoFinal = [motivo || 'Sin motivo', comentario || ''].filter(Boolean).join(' — ');
    await admin.from('pedidos').update({
      dev_estado: 'pendiente',
      dev_opcion: opcionFinal,
      dev_motivo: motivoFinal,
      dev_solicitada_at: new Date().toISOString(),
    }).eq('id', pedidoId);

    // Notificar al admin por correo (si Resend está configurado)
    try {
      const key = Deno.env.get('RESEND_API_KEY');
      if (key) {
        const { data: cfgMail } = await admin.from('config_valores').select('valor').eq('clave', 'contacto_email').maybeSingle();
        const to = cfgMail?.valor || 'hola@frate.cl';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Frate Tickets <tickets@frate.cl>',
            to: [to],
            subject: `🔔 ${opcionFinal === 'credito' ? 'Reactivación (crédito)' : 'Devolución de DINERO'} — FCC-${String(pedido.id).padStart(6, '0')} ($${(pedido.total_pagado || pedido.total || 0).toLocaleString('es-CL')})`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
              <h2>Nueva solicitud de devolución</h2>
              <p><b>Orden:</b> FCC-${String(pedido.id).padStart(6, '0')}<br/>
              <b>Cliente:</b> ${pedido.nombre_cliente || ''} (${pedido.email_cliente || ''})<br/>
              <b>Monto:</b> $${(pedido.total_pagado || pedido.total || 0).toLocaleString('es-CL')}<br/>
              <b>Pide:</b> ${opcionFinal === 'credito' ? '♻️ Crédito / reactivación (no sale plata)' : '💸 Devolución del dinero'}<br/>
              <b>Motivo:</b> ${motivoFinal}</p>
              <p>Resuélvela en <a href="https://frate.cl/admin">frate.cl/admin</a> → Devoluciones.</p>
            </div>`,
          }),
        });
      }
    } catch (e) { console.error('[solicitar-devolucion] mail:', e); }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });

  } catch (err) {
    console.error('[solicitar-devolucion]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
