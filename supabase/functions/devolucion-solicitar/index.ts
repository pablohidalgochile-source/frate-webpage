// ============================================================
// FRATE — devolucion-solicitar (PÚBLICA): guarda la SOLICITUD de
// devolución (no devuelve plata — el equipo aprueba en Órdenes).
// Re-valida correo + orden + tickets (no usados / no ya-solicitados).
// Avisa best-effort: correo (Resend) + WhatsApp a staff.
// verify_jwt=false. Service role interno.
// Secrets: SUPABASE_URL, SERVICE_ROLE_KEY, RESEND_API_KEY,
//          WHATSAPP_PHONE_ID, WHATSAPP_TOKEN.
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
const FROM = 'Frate Tickets <tickets@frate.cl>';
const esCobro = async (sb: any, pedidoId: number) => {
  const { data } = await sb.from('crm_pagos').select('id').eq('pedido_id', pedidoId).limit(1);
  return !!(data && data.length);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { email, orden, qrs, preferencia, motivo, comentario, acepto } = await req.json().catch(() => ({}));
    if (!email || !orden || !Array.isArray(qrs) || !qrs.length) return j({ error: 'Elige al menos un ticket para devolver.' }, 400);
    if (acepto !== true) return j({ error: 'Debes leer y aceptar las condiciones de devolución.' }, 400);
    const pref = ['dinero', 'credito', 'cambio_dia'].includes(preferencia) ? preferencia : 'dinero';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!(await rateOk(sb, req, 'devsolic', 5, 900))) return demasiados(cors);

    // Gatillo: apagado por defecto.
    const { data: cfgA } = await sb.from('config_valores').select('clave,valor').in('clave', ['devoluciones_activo', 'devoluciones_politica']);
    const cmA = new Map((cfgA || []).map((c: any) => [c.clave, c.valor]));
    if (String(cmA.get('devoluciones_activo') || '').toLowerCase() !== 'true')
      return j({ error: 'Las devoluciones por el sitio no están habilitadas ahora.', no_activo: true }, 403);

    const idNum = parseInt(String(orden).replace(/\D/g, '')) || 0;
    if (!idNum) return j({ error: 'Orden inválida.' }, 400);

    // Si la consulta falla (p. ej. la columna `origen` todavía no existe), NO se puede
    // decir «orden no encontrada»: eso dejaría a todo el mundo sin devoluciones sin que
    // nadie se entere. Se responde error de servidor y queda en el log.
    const { data: ped, error: ePed } = await sb.from('pedidos')
      .select('id,nombre_cliente,email_cliente,estado,origen')
      .eq('id', idNum).maybeSingle();
    if (ePed) { console.error('[devolucion-solicitar] pedidos:', ePed.message); return j({ error: 'No pudimos revisar tu orden. Intenta de nuevo o escríbenos.' }, 500); }
    if (!ped) return j({ error: 'Orden no encontrada.' }, 404);
    if (String(ped.email_cliente || '').trim().toLowerCase() !== String(email).trim().toLowerCase())
      return j({ error: 'El correo no coincide con esa orden.' }, 403);
    if (ped.estado !== 'pagado') return j({ error: 'Esa orden no está pagada.' }, 400);
    // 🎂 Cobro de servicio: esa plata la devuelve una persona en Admin → Órdenes (y ahí sí
    //    se puede devolver a medias). Refuerzo por crm_pagos, igual que devolver-pago.
    if (ped.origen === 'crm' || (await esCobro(sb, idNum)))
      return j({ error: 'Este es un pago de un servicio: escríbenos y lo vemos contigo.', code: 'ES_COBRO_SERVICIO' }, 409);

    const { data: items } = await sb.from('items_pedido').select('nombre_ticket,precio_unitario,qr_ids,personas').eq('pedido_id', idNum);
    const infoQr: Record<string, any> = {};
    (items || []).forEach((it: any) => {
      const qq = Array.isArray(it.qr_ids) ? it.qr_ids : [];
      const pp = Array.isArray(it.personas) ? it.personas : [];
      qq.forEach((qr: string, idx: number) => { if (qr) infoQr[qr] = { nombre_ticket: it.nombre_ticket || 'Entrada', persona: (pp[idx] || {}).nombre || ped.nombre_cliente || '', monto: typeof it.precio_unitario === 'number' ? it.precio_unitario : 0 }; });
    });
    const pedidoQrs = Object.keys(infoQr);
    const usados = new Set<string>();
    for (let c = 0; c < pedidoQrs.length; c += 200) {
      const { data: uu } = await sb.from('qr_usados').select('qr_id').in('qr_id', pedidoQrs.slice(c, c + 200));
      (uu || []).forEach((u: any) => usados.add(u.qr_id));
    }
    const { data: prev } = await sb.from('solicitudes_devolucion').select('qr_ids,estado').eq('pedido_id', idNum);
    const yaSolic = new Set<string>();
    (prev || []).forEach((s: any) => { if (['pendiente', 'aprobada', 'procesada'].includes(s.estado)) (Array.isArray(s.qr_ids) ? s.qr_ids : []).forEach((q: string) => yaSolic.add(q)); });

    const validQrs = (qrs as string[]).filter((q) => infoQr[q] && !usados.has(q) && !yaSolic.has(q));
    if (!validQrs.length) return j({ error: 'Esos tickets no se pueden devolver (usados o ya solicitados).' }, 400);

    const itemsSel = validQrs.map((q) => ({ qr: q, ...infoQr[q] }));
    const montoTotal = itemsSel.reduce((s: number, x: any) => s + (x.monto || 0), 0);
    const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'devolucion_retencion_pct').maybeSingle();
    const retencion = (cfg?.valor != null && cfg.valor !== '') ? parseInt(cfg.valor) : 10;
    const montoDevolver = pref === 'dinero' ? Math.round(montoTotal * (100 - retencion) / 100) : montoTotal;
    const politicaTxt = String(cmA.get('devoluciones_politica') || '').replace(/\{RETENCION\}/g, String(retencion));

    let evNombre = '';
    // El evento NO es una columna de pedidos (nunca lo fue): vive en cada línea del
    // pedido. Antes se pedía `pedidos.evento_id` y PostgREST rechazaba la consulta
    // entera, así que esta pantalla respondía «no encontramos esa orden» SIEMPRE.
    let _evId: number | null = null;
    {
      const { data: _it } = await sb.from('items_pedido').select('evento_id')
        .eq('pedido_id', ped.id).not('evento_id', 'is', null).limit(1).maybeSingle();
      _evId = (_it as any)?.evento_id ?? null;
    }
    if (_evId) { const { data: ev } = await sb.from('eventos').select('nombre').eq('id', _evId).maybeSingle(); evNombre = ev?.nombre || ''; }

    const { data: ins, error: insErr } = await sb.from('solicitudes_devolucion').insert({
      pedido_id: idNum, orden_ref: 'FCC-' + String(idNum).padStart(6, '0'),
      email: String(email).trim().toLowerCase(), nombre: ped.nombre_cliente || '', telefono: '',
      evento_id: _evId, evento_nombre: evNombre,
      items: itemsSel, qr_ids: validQrs, monto_total: montoTotal, monto_devolver: montoDevolver,
      preferencia: pref, motivo: motivo || null, comentario: comentario || null,
      acepto_politica: true, politica_texto: politicaTxt, estado: 'pendiente', canal: 'web',
    }).select('id').single();
    if (insErr) return j({ error: 'No se pudo guardar la solicitud: ' + insErr.message }, 500);
    const folio = 'DEV-' + ins.id;

    // ── Avisos best-effort (nunca bloquean la respuesta al cliente) ──
    const prefTxt = pref === 'dinero' ? '💵 dinero' : pref === 'credito' ? '🎟️ crédito FRATE' : '🔄 cambio de día';
    const resumen = `${folio} · ${ped.nombre_cliente || ''} · ${evNombre} · ${validQrs.length} ticket(s) · ${prefTxt}${pref === 'dinero' ? ` · $${montoDevolver.toLocaleString('es-CL')}` : ''} · motivo: ${motivo || '—'}`;
    try {
      const { data: bccC } = await sb.from('config_valores').select('valor').eq('clave', 'admin_bcc_email').maybeSingle();
      const to = String(bccC?.valor || '').trim();
      const RESEND = Deno.env.get('RESEND_API_KEY');
      if (to && RESEND) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [to], subject: `↩️ Nueva solicitud de devolución ${folio}`, html: `<h2>Nueva solicitud de devolución</h2><p><b>${resumen}</b></p><p>Correo: ${email}${comentario ? '<br>Comentario: ' + String(comentario).replace(/</g, '&lt;') : ''}</p><p>Revísala en <b>Órdenes → ↩️ Devoluciones</b>.</p>` }),
        });
      }
    } catch (_) { /* best-effort */ }
    try {
      const { data: wC } = await sb.from('config_valores').select('valor').eq('clave', 'devoluciones_wsp').maybeSingle();
      let num = String(wC?.valor || '').replace(/\D/g, ''); if (num.length === 9 && num[0] === '9') num = '56' + num; if (num.length === 8) num = '569' + num;
      const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID'), TOKEN = Deno.env.get('WHATSAPP_TOKEN');
      if (num && PHONE_ID && TOKEN) {
        await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
          method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: `↩️ Devolución nueva\n${resumen}` } }),
        });
      }
    } catch (_) { /* best-effort (ventana 24h/plantilla de Meta) */ }

    return j({ ok: true, folio, monto_devolver: montoDevolver, preferencia: pref });
  } catch (e) { return j({ error: String((e as any)?.message || e) }, 500); }
});
