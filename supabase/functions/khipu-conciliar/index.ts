// ============================================================
// FRATE — Edge Function: khipu-conciliar
// La "caja" de las transferencias (Khipu), hermana de mp-pagos.
//
// Khipu NO tiene un endpoint para "listar todos los pagos" (a
// diferencia de MercadoPago). Por eso partimos desde las ÓRDENES
// locales pagadas/creadas por transferencia y, para cada una,
// consultamos su estado REAL en Khipu (GET /v3/payments/{id}).
//
//  • accion 'listar'      → cruza las órdenes Khipu con su estado real
//                            y marca las que quedaron colgadas.
//  • accion 'sincronizar' → rescata una orden cuyo pago en Khipu está
//                            'done' pero acá quedó pendiente/expirada:
//                            la marca pagada y reenvía el QR. Mismo
//                            cinturón de seguridad que el webhook.
//
// Solo ADMIN. Secrets: KHIPU_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const KHIPU_API = 'https://payment-api.khipu.com/v3/payments';

// Saca el payment_id de Khipu de la referencia_pago ('KHIPU-<id>' o 'KHIPU-<id>-<sufijo>')
function khipuPaymentId(ref: string): string | null {
  const r = String(ref || '');
  if (!/^KHIPU-/i.test(r)) return null;
  const id = r.replace(/^KHIPU-/i, '').split('-')[0].trim();
  return id || null;
}

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
    const KHIPU_KEY = Deno.env.get('KHIPU_API_KEY');
    if (!KHIPU_KEY) throw new Error('KHIPU_API_KEY no configurada');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Solo admin
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: cors });
    const { data: perfil } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    if (perfil?.rol !== 'admin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403, headers: cors });

    const { accion, pedidoId, limit } = await req.json().catch(() => ({})) as { accion?: string; pedidoId?: number; limit?: number };

    const khipuGet = async (pid: string) => {
      const r = await fetch(`${KHIPU_API}/${pid}`, { headers: { 'x-api-key': KHIPU_KEY } });
      if (!r.ok) return null;
      return await r.json();
    };

    // ── SINCRONIZAR: rescatar una transferencia 'done' que quedó colgada ──
    if (accion === 'sincronizar') {
      if (!pedidoId) throw new Error('Falta pedidoId');
      const { data: pedido } = await admin.from('pedidos').select('*, items_pedido(*)').eq('id', pedidoId).single();
      if (!pedido) return new Response(JSON.stringify({ error: 'La orden no existe acá.' }), { status: 404, headers: cors });
      if (pedido.estado === 'pagado') return new Response(JSON.stringify({ ok: true, nota: 'La orden ya estaba pagada.' }), { headers: cors });

      const pid = khipuPaymentId(pedido.referencia_pago);
      if (!pid) return new Response(JSON.stringify({ error: 'La orden no tiene un pago de Khipu para consultar.' }), { status: 409, headers: cors });
      const pago = await khipuGet(pid);
      if (!pago) return new Response(JSON.stringify({ error: 'Khipu no devolvió ese pago (¿id inválido?).' }), { status: 502, headers: cors });
      if (pago.status !== 'done') return new Response(JSON.stringify({ error: `El pago está "${pago.status}" en Khipu — solo se rescatan los 'done'.` }), { status: 409, headers: cors });

      // Cinturón: el monto pagado debe cubrir el total
      const montoPagado   = Number(pago.amount) || 0;
      const montoEsperado = Number(pedido.total_pagado ?? pedido.total) || 0;
      if (montoEsperado > 0 && montoPagado + 1 < montoEsperado) {
        return new Response(JSON.stringify({ error: `Monto insuficiente en Khipu: $${montoPagado.toLocaleString('es-CL')} de $${montoEsperado.toLocaleString('es-CL')}.` }), { status: 409, headers: cors });
      }

      // Marcar pagado (solo si estaba pendiente/expirado) → dispara stock por trigger
      const { data: upRows, error: upErr } = await admin.from('pedidos').update({
        estado: 'pagado', metodo_pago: 'khipu',
        referencia_pago: `KHIPU-${pid}`, fecha_pago: pago.updated_at || new Date().toISOString(),
      }).eq('id', pedidoId).in('estado', ['pendiente', 'expirado']).select('id');

      if (upErr) {
        await admin.from('pedidos').update({ estado: 'requiere_reembolso', referencia_pago: `KHIPU-${pid}-SINSTOCK` }).eq('id', pedidoId);
        return new Response(JSON.stringify({ error: 'Se cobró pero ya no hay cupo — la orden quedó marcada para reembolso.' }), { status: 409, headers: cors });
      }
      if (!upRows || upRows.length === 0) {
        return new Response(JSON.stringify({ ok: true, nota: 'La orden ya no estaba pendiente (otra vía la resolvió).' }), { headers: cors });
      }

      // Reenviar comprobante con QRs (mejor esfuerzo)
      try {
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
      } catch (e) { console.error('[khipu-conciliar] receipt:', e); }

      return new Response(JSON.stringify({ ok: true, sincronizada: pedidoId, monto: montoPagado }), { headers: cors });
    }

    // ── LISTAR: cruzar las órdenes Khipu locales con su estado real en Khipu ──
    const want = Math.min(Number(limit) || 60, 200);
    const { data: pedidos } = await admin.from('pedidos')
      .select('id, estado, total, total_pagado, nombre_cliente, email_cliente, referencia_pago, metodo_pago, fecha_pago, created_at')
      .or('metodo_pago.eq.khipu,referencia_pago.ilike.KHIPU%')
      .order('id', { ascending: false })
      .limit(want);

    const hoyCL = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    let totalHoy = 0, totalPagado = 0, colgados = 0;

    // Consultar Khipu en tandas chicas para no saturar
    const lista = pedidos || [];
    const pagos: any[] = [];
    for (let i = 0; i < lista.length; i += 6) {
      const chunk = lista.slice(i, i + 6);
      const parte = await Promise.all(chunk.map(async (ped: any) => {
        const pid = khipuPaymentId(ped.referencia_pago);
        const kh = pid ? await khipuGet(pid) : null;
        const khStatus = kh?.status || null;              // 'done' | 'pending' | 'verifying' | 'expired' | ...
        const khMonto  = kh ? (Number(kh.amount) || 0) : null;
        const localPagado = ped.estado === 'pagado';
        const esperado = Number(ped.total_pagado ?? ped.total) || 0;

        let flag = 'revisar';
        if (ped.estado === 'reembolsado')             flag = 'devuelto';
        else if (khStatus === 'done' && localPagado)  flag = 'ok';                 // ✅ calza
        else if (khStatus === 'done' && !localPagado) { flag = 'colgado'; colgados++; }  // ⚠️ pagó y no figura → rescatar
        else if (khStatus && khStatus !== 'done')     flag = 'pendiente';          // aún no transfiere / verificando
        else if (!kh && localPagado)                  flag = 'ok_sin_verificar';   // pagado local, Khipu no devolvió (id viejo) → confiamos en lo local
        else if (!kh)                                 flag = 'sin_dato';

        if (localPagado) {
          totalPagado += esperado;
          const fechaCL = ped.fecha_pago ? new Date(ped.fecha_pago).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) : '';
          if (fechaCL === hoyCL) totalHoy += esperado;
        }
        return {
          id: ped.id, nombre: ped.nombre_cliente || ped.email_cliente || '—',
          estadoLocal: ped.estado, montoLocal: esperado,
          khStatus, khMonto, paymentId: pid,
          fecha: ped.fecha_pago || ped.created_at, flag,
        };
      }));
      pagos.push(...parte);
    }

    return new Response(JSON.stringify({
      ok: true, pagos,
      resumen: { total: lista.length, pagadas: pagos.filter(p => p.estadoLocal === 'pagado').length, colgados, totalPagado, totalHoy },
      hoy: hoyCL,
    }), { headers: cors });

  } catch (err) {
    console.error('[khipu-conciliar]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});

async function sendReceipt(payload: any) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.error('[khipu-conciliar] send-receipt falló (pago OK):', e); }
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
