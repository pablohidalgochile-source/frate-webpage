// ============================================================
// FRATE — devolucion-buscar (PÚBLICA): valida correo + N° de orden
// y devuelve SOLO los tickets de esa orden (para pedir la devolución).
// No expone nada más. verify_jwt=false. Service role interno.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

import { rateOk, demasiados } from '../_shared/rate.ts';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
// Refuerzo por crm_pagos, igual que devolver-pago: un cobro viejo pudo quedar con origen 'web'.
const esCobro = async (sb: any, pedidoId: number) => {
  const { data } = await sb.from('crm_pagos').select('id').eq('pedido_id', pedidoId).limit(1);
  return !!(data && data.length);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { email, orden } = await req.json().catch(() => ({}));
    if (!email || !orden) return j({ error: 'Escribe tu correo y el N° de orden.' }, 400);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!(await rateOk(sb, req, 'devbuscar', 10, 300))) return demasiados(cors);

    // Gatillo: apagado por defecto. Si no está activo, no se atiende (anti-reclamo/anti-abuso).
    const { data: cfgs } = await sb.from('config_valores').select('clave,valor').in('clave', ['devoluciones_activo', 'devolucion_retencion_pct', 'devoluciones_politica']);
    const cm = new Map((cfgs || []).map((c: any) => [c.clave, c.valor]));
    if (String(cm.get('devoluciones_activo') || '').toLowerCase() !== 'true')
      return j({ error: 'Las devoluciones por el sitio no están habilitadas ahora. Escríbenos por WhatsApp/Instagram.', no_activo: true }, 403);
    const retencion = (cm.get('devolucion_retencion_pct') != null && cm.get('devolucion_retencion_pct') !== '') ? parseInt(cm.get('devolucion_retencion_pct')) : 10;
    const politica = String(cm.get('devoluciones_politica') || '').replace(/\{RETENCION\}/g, String(retencion));

    const idNum = parseInt(String(orden).replace(/\D/g, '')) || 0;
    if (!idNum) return j({ error: 'Ese N° de orden no es válido.' }, 400);

    // Igual que en devolucion-solicitar: un error de consulta no puede disfrazarse de
    // «no encontramos esa orden», o una columna que falte apaga las devoluciones en silencio.
    const { data: ped, error: ePed } = await sb.from('pedidos')
      .select('id,nombre_cliente,email_cliente,estado,origen')
      .eq('id', idNum).maybeSingle();
    if (ePed) { console.error('[devolucion-buscar] pedidos:', ePed.message); return j({ error: 'No pudimos revisar esa orden. Intenta de nuevo o escríbenos.' }, 500); }
    if (!ped) return j({ error: 'No encontramos esa orden. Revisa el número.' }, 404);
    if (String(ped.email_cliente || '').trim().toLowerCase() !== String(email).trim().toLowerCase())
      return j({ error: 'El correo no coincide con esa orden.' }, 403);
    if (ped.estado !== 'pagado')
      return j({ error: 'Esa orden no está pagada; no se puede devolver.' }, 400);
    // 🎂 Cobro de servicio (cumpleaños/reserva): no tiene entradas que elegir. Se corta acá
    //    con un mensaje de verdad, en vez de mostrar una lista vacía.
    if (ped.origen === 'crm' || (await esCobro(sb, idNum)))
      return j({ error: 'Este es un pago de un servicio: escríbenos y lo vemos contigo.', code: 'ES_COBRO_SERVICIO' }, 409);

    const { data: items } = await sb.from('items_pedido')
      .select('nombre_ticket,precio_unitario,qr_ids,personas').eq('pedido_id', idNum);

    const allQrs = (items || []).flatMap((i: any) => Array.isArray(i.qr_ids) ? i.qr_ids : []);
    const usados = new Set<string>();
    for (let c = 0; c < allQrs.length; c += 200) {
      const { data: uu } = await sb.from('qr_usados').select('qr_id').in('qr_id', allQrs.slice(c, c + 200));
      (uu || []).forEach((u: any) => usados.add(u.qr_id));
    }
    const { data: prev } = await sb.from('solicitudes_devolucion').select('qr_ids,estado').eq('pedido_id', idNum);
    const yaSolic = new Set<string>();
    (prev || []).forEach((s: any) => { if (['pendiente', 'aprobada', 'procesada'].includes(s.estado)) (Array.isArray(s.qr_ids) ? s.qr_ids : []).forEach((q: string) => yaSolic.add(q)); });

    let evNombre = '', evFecha = '';
    // El evento NO es una columna de pedidos (nunca lo fue): vive en cada línea del
    // pedido. Antes se pedía `pedidos.evento_id` y PostgREST rechazaba la consulta
    // entera, así que esta pantalla respondía «no encontramos esa orden» SIEMPRE.
    let _evId: number | null = null;
    {
      const { data: _it } = await sb.from('items_pedido').select('evento_id')
        .eq('pedido_id', ped.id).not('evento_id', 'is', null).limit(1).maybeSingle();
      _evId = (_it as any)?.evento_id ?? null;
    }
    if (_evId) { const { data: ev } = await sb.from('eventos').select('nombre,fecha').eq('id', _evId).maybeSingle(); evNombre = ev?.nombre || ''; evFecha = ev?.fecha || ''; }

    const tickets: any[] = [];
    (items || []).forEach((it: any) => {
      const qrs = Array.isArray(it.qr_ids) ? it.qr_ids : [];
      const pers = Array.isArray(it.personas) ? it.personas : [];
      qrs.forEach((qr: string, idx: number) => {
        if (!qr) return; const p = pers[idx] || {};
        tickets.push({
          qr, nombre_ticket: it.nombre_ticket || 'Entrada',
          persona: p.nombre || ped.nombre_cliente || '',
          monto: typeof it.precio_unitario === 'number' ? it.precio_unitario : 0,
          usado: usados.has(qr), solicitado: yaSolic.has(qr),
        });
      });
    });

    return j({
      ok: true, pedido_id: idNum, orden: 'FCC-' + String(idNum).padStart(6, '0'),
      nombre: ped.nombre_cliente || '', telefono: '',
      evento_id: _evId, evento_nombre: evNombre, evento_fecha: evFecha,
      retencion, politica, tickets,
    });
  } catch (e) { return j({ error: String((e as any)?.message || e) }, 500); }
});
