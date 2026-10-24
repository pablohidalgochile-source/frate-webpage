// ============================================================
// FRATE — Edge Function: api-crm (puerta dedicada del ERP)
// Contrato: ARQUITECTURA-CRM-WEB.md + RESPUESTAS-CRM-ERP.md.
// Auth: x-api-key == secret ERP_API_KEY (la llave EXISTENTE que
// el ERP guarda como WEB_API_KEY). Idempotente por (tipo, web_id).
//
// POST {accion, payload} u array (lote máx 500) — 11 acciones.
// GET  ?desde=ISO | ?catalogo=rrpp | ?checkins&fecha=YYYY-MM-DD | ?historial=ID[&solo=mesa]
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { formularioAPayloadERP } from '../_shared/crm.ts';
import { registrarPagoManual } from '../_shared/cobros.ts';

const QR_IMG = (id: string) => `https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/qr?s=300&d=${encodeURIComponent(id)}`;

// Rate limit defensivo (mejor esfuerzo por instancia): ~60 req/min
const ventana: number[] = [];
function rateLimitOk(): boolean {
  const ahora = Date.now();
  while (ventana.length && ahora - ventana[0] > 60000) ventana.shift();
  if (ventana.length >= 60) return false;
  ventana.push(ahora);
  return true;
}

async function mail(to: string, asunto: string, cuerpoHtml: string) {
  try {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key || !to) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Frate Tickets <tickets@frate.cl>', to: [to], subject: asunto, html: cuerpoHtml }),
    });
  } catch (e) { console.error('[api-crm] mail:', e); }
}
const plantilla = (titulo: string, cuerpo: string) =>
  `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0A0A0B;color:#f0ede8;padding:28px;border-radius:14px;">
    <h2 style="margin:0 0 4px;">FRATE</h2><p style="color:#a1a1aa;margin:0 0 16px;">Fraternidad Campus Central · Bellavista</p>
    <h3 style="margin:0 0 10px;">${titulo}</h3>${cuerpo}
    <p style="color:#71717a;font-size:12px;margin-top:20px;">Cualquier duda, escríbenos por WhatsApp al +56 9 8131 1548.</p></div>`;

// Genera la cortesía nominativa (pedido $0 + QRs) para UNA persona.
// Devuelve los qr_ids. Requiere nombre + rut (regla de negocio).
async function generarCortesia(sb: any, opts: { nombre: string; rut: string; email?: string; eventoId?: number | null; fecha: string; etiqueta: string; cantidad?: number; condiciones?: any }) {
  const cantidad = Math.max(1, Math.min(10, opts.cantidad || 1));
  let nombreEvento = opts.etiqueta;
  let evHora = '23:00', evHoraFin = '';
  if (opts.eventoId) {
    const { data: ev } = await sb.from('eventos').select('nombre,hora,hora_termino').eq('id', opts.eventoId).maybeSingle();
    if (ev?.nombre) nombreEvento = ev.nombre;
    if (ev?.hora) evHora = ev.hora;
    if (ev?.hora_termino) evHoraFin = ev.hora_termino;
  }
  const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
    cliente_id: null, nombre_cliente: opts.nombre, email_cliente: opts.email || null,
    estado: 'pagado', total: 0, fee_servicio: 0, total_pagado: 0,
    metodo_pago: 'cortesia', referencia_pago: 'CRM-ERP', fecha_pago: new Date().toISOString(),
  }).select('id').single();
  if (e1) throw e1;
  const personas = Array.from({ length: cantidad }, (_, i) => (i === 0 ? { nombre: opts.nombre, rut: opts.rut } : { nombre: opts.nombre + ' +' + i, rut: '' }));
  const _rnd = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const qrIds = Array.from({ length: cantidad }, (_, i) => `FCC-${pedido.id}-CRM-0-${i}-${_rnd()}`);
  const { error: e2 } = await sb.from('items_pedido').insert({
    pedido_id: pedido.id, producto_tipo: 'ticket', evento_id: opts.eventoId || null,
    nombre_evento: nombreEvento, nombre_ticket: (opts.condiciones?.titulo) || opts.etiqueta, detalle: 'Fecha: ' + opts.fecha,
    cantidad, precio_unitario: 0, personas, qr_ids: qrIds, condiciones: opts.condiciones || null,
    nombre_asistente: opts.nombre, rut_asistente: opts.rut,
  });
  if (e2) { await sb.from('pedidos').delete().eq('id', pedido.id); throw e2; }
  // Correo con QRs (mejor esfuerzo, reusa send-receipt)
  if (opts.email) {
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ order: {
          id: 'FCC-' + String(pedido.id).padStart(6, '0'), pedidoId: pedido.id,
          items: [{ tipo: opts.etiqueta, nombre: nombreEvento, precio: 0, cantidad, personas, qr_ids: qrIds, fecha: opts.fecha, hora: evHora, horaTermino: evHoraFin || undefined, eventoId: opts.eventoId || undefined }],
          comprador: { nombre: opts.nombre, email: opts.email }, total: 0, fecha: new Date().toISOString(),
        } }),
      });
    } catch (e) { console.error('[api-crm] receipt:', e); }
  }
  return { pedidoId: pedido.id, qrIds };
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const KEY = Deno.env.get('ERP_API_KEY');
    const sent = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('api_key') || '';
    if (!KEY) return new Response(JSON.stringify({ error: 'ERP_API_KEY no configurada' }), { status: 503, headers: cors });

    // Dos puertas, no una. La llave del ERP es la de siempre. La segunda es la
    // sesión de un ADMIN del panel — la necesita el botón «descargar ficha»,
    // porque mandarle la llave del ERP al navegador la dejaría a la vista de
    // cualquiera que abra el admin. Solo abre lecturas de una ficha (GET);
    // todo lo que escribe sigue siendo exclusivo de la llave.
    let esAdmin = false;
    if (sent !== KEY) {
      const auth = req.headers.get('Authorization') || '';
      const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
      if (!jwt) return new Response(JSON.stringify({ error: 'x-api-key inválida' }), { status: 401, headers: cors });
      const sbUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } });
      const { data: u } = await sbUser.auth.getUser();
      if (!u?.user?.id) return new Response(JSON.stringify({ error: 'x-api-key inválida' }), { status: 401, headers: cors });
      const sbSvc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: c } = await sbSvc.from('clientes').select('rol').eq('id', u.user.id).maybeSingle();
      // `rol` puede venir null: comparar contra null en vez de con coalesce
      // dejaría pasar el caso "sin rol". Se compara sobre string vacío.
      if (String(c?.rol || '') !== 'admin') {
        return new Response(JSON.stringify({ error: 'Solo un admin' }), { status: 403, headers: cors });
      }
      if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Con sesión de admin solo se puede leer' }), { status: 403, headers: cors });
      }
      esAdmin = true;
    }
    void esAdmin;
    if (!rateLimitOk()) return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429, headers: cors });

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const url = new URL(req.url);

    // ══ GET: lecturas ═══════════════════════════════════════
    if (req.method === 'GET') {
      // ── La ficha COMPLETA de una solicitud, para descargar ──
      // GET ?ficha=290
      // Devuelve todo lo que sabemos de esa ficha en un solo archivo: los datos
      // del formulario, la gestión, la plata y el historial. Y adentro va
      // `erp`, que es el MISMO payload que le mandamos al ERP por el webhook
      // —construido con formularioAPayloadERP, no con una copia— así lo que
      // descargas es exactamente lo que el ERP recibiría.
      if (url.searchParams.get('ficha')) {
        const fid = parseInt(url.searchParams.get('ficha') || '') || 0;
        if (!fid) return new Response(JSON.stringify({ error: 'ficha debe ser un id' }), { status: 400, headers: cors });
        const { data: f } = await sb.from('formularios').select('*').eq('id', fid).maybeSingle();
        if (!f) return new Response(JSON.stringify({ error: 'no_existe' }), { status: 404, headers: cors });
        const g: any = f.gestion || {};
        const acordado = Number(g.monto_total) || 0;
        const pagado   = Number(g.monto) || 0;
        // 🎂 Los cobros de esa ficha (links de pago y pagos manuales), del más
        // nuevo al más viejo. Columnas explícitas: nada de uuid del staff ni
        // datos del pedido. Si la tabla falla, la ficha se descarga igual.
        const { data: cobros, error: eCobros } = await sb.from('crm_pagos')
          .select('id, folio, tipo, ref_id, servicio, tabla, pedido_id, monto, concepto, estado, medio, link, preferencia_id, creado_por_nombre, enviado_at, envios, enviado_canal, mp_payment_id, monto_pagado, pagado_via, cotejo, cotejo_detalle, pagos_extra, reemplazado_por, anulado_at, anulado_motivo, devuelto_at, devuelto_monto, paid_at, created_at')
          .eq('tipo', 'formulario').eq('ref_id', fid).order('created_at', { ascending: false });
        if (eCobros) console.error('[api-crm] cobros de la ficha:', eCobros.message);
        return new Response(JSON.stringify({
          ok: true,
          generado_at: new Date().toISOString(),
          ficha: f,
          // La plata desglosada, ya calculada: el pendiente no se guarda en
          // ninguna parte a propósito (un solo dueño del número), así que si
          // no lo pongo acá el que lea el archivo lo calcula mal.
          pagos: {
            acordado, pagado,
            pendiente: Math.max(acordado - pagado, 0),
            a_favor:   Math.max(pagado - acordado, 0),
            estado: g.pago || null,
            sugerido_por_la_receta: Number(g.monto_sugerido) || null,
            diferencia_vs_sugerido: (Number(g.monto_sugerido) || 0) ? acordado - Number(g.monto_sugerido) : null,
          },
          receta: Array.isArray(g.receta) ? g.receta : [],
          extras: g.extras || {},
          historial: Array.isArray(f.historial) ? f.historial : [],
          cobros: cobros || [],
          ...(eCobros ? { cobros_error: eCobros.message } : {}),
          erp: formularioAPayloadERP(f),
        }, null, 2), { headers: cors });
      }

      // ── Historial de una ficha ──────────────────────────────
      // Lo pidió el ERP: los 4 campos de mesa guardan solo el ÚLTIMO cambio,
      // así que si la mesa se mueve tres veces en una noche se pierden las dos
      // del medio. El historial reconstruye la noche completa.
      //   GET ?historial=290           → una ficha
      //   GET ?historial=290&solo=mesa → solo los movimientos de mesa
      if (url.searchParams.get('historial')) {
        const hid = parseInt(url.searchParams.get('historial') || '') || 0;
        if (!hid) return new Response(JSON.stringify({ error: 'historial debe ser un id' }), { status: 400, headers: cors });
        const { data: f } = await sb.from('formularios')
          .select('id,tipo,nombre,gestion,historial,updated_at').eq('id', hid).maybeSingle();
        if (!f) return new Response(JSON.stringify({ error: 'no_existe' }), { status: 404, headers: cors });
        let h = Array.isArray(f.historial) ? f.historial : [];
        if (url.searchParams.get('solo') === 'mesa') h = h.filter((x: any) => String(x?.ev || '').includes('🪑'));
        const g: any = f.gestion || {};
        return new Response(JSON.stringify({
          ok: true, web_id: f.id, tipo: f.tipo, nombre: f.nombre,
          // El estado actual, para que no tengan que deducirlo del historial.
          mesa_asignada: g.mesa || g.zona || null,
          mesa_origen: g.mesa_origen || null,
          mesa_cambiada_at: g.mesa_cambiada_at || null,
          mesa_anterior: g.mesa_anterior ?? null,
          mesa_motivo: g.mesa_motivo || null,
          mesa_por: g.mesa_por || null,
          // Y la noche completa, del más viejo al más nuevo.
          historial: h,
        }), { headers: cors });
      }

      // Catálogo de PAQUETES (Fase 3): fuente única del dueño, con fotos
      if (url.searchParams.get('catalogo') === 'paquetes') {
        const { data: paquetes } = await sb.from('paquetes')
          .select('id, categoria, nombre, descripcion, incluye, precio, foto_url, orden, condiciones')
          .eq('activo', true).order('categoria').order('orden');
        return new Response(JSON.stringify({ paquetes: paquetes || [] }), { headers: cors });
      }

      // Catálogo RRPP (decisión 7)
      if (url.searchParams.has('catalogo')) {
        const { data: rrpps } = await sb.from('clientes').select('id, nombres, apellidos, username').eq('rol', 'rrpp');
        const { data: cods } = await sb.from('codigos').select('id, codigo, evento_id, activo, usos, duenio_id').not('duenio_id', 'is', null);
        const out = (rrpps || []).map((r: any) => ({
          duenio_id: r.id,
          nombre: ((r.nombres || '') + ' ' + (r.apellidos || '')).trim().toUpperCase(),
          username: r.username ? '@' + r.username : '',
          activo: true,
          codigos: (cods || []).filter((c: any) => c.duenio_id === r.id).map((c: any) => ({ codigo: c.codigo, codigo_id: c.id, evento_id: c.evento_id, activo: c.activo, usos: c.usos })),
        }));
        return new Response(JSON.stringify(out), { headers: cors });
      }

      // Check-ins por fecha de la noche (decisión 6, ventana 05:00 Chile)
      if (url.searchParams.has('checkins')) {
        const fecha = url.searchParams.get('fecha') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Response(JSON.stringify({ error: 'fecha YYYY-MM-DD requerida' }), { status: 400, headers: cors });
        // Rango: fecha 12:00 → día siguiente 11:59 (hora Chile ≈ UTC-3/-4; usamos margen amplio en UTC)
        const ini = new Date(fecha + 'T12:00:00-03:00').toISOString();
        const fin = new Date(new Date(fecha + 'T12:00:00-03:00').getTime() + 24 * 3600 * 1000).toISOString();
        const { data: usados } = await sb.from('qr_usados').select('qr_id, pedido_id, created_at, escaneado_por, incidencia').gte('created_at', ini).lt('created_at', fin).limit(2000);
        const pedidoIds = [...new Set((usados || []).map((u: any) => u.pedido_id))];
        const { data: peds } = pedidoIds.length ? await sb.from('pedidos').select('id, metodo_pago, nombre_cliente, items_pedido(qr_ids, personas, nombre_ticket, evento_id)').in('id', pedidoIds) : { data: [] };
        const pedMap = new Map((peds || []).map((p: any) => [p.id, p]));
        // Vincular cortesías CRM a su origen
        const { data: liOrig } = await sb.from('lista_inscritos').select('id, lista_id, pedido_cortesia_id').not('pedido_cortesia_id', 'is', null);
        const { data: invOrig } = await sb.from('invitaciones_rrpp').select('id, pedido_cortesia_id').not('pedido_cortesia_id', 'is', null);
        const origenPorPedido = new Map<number, any>();
        (liOrig || []).forEach((x: any) => origenPorPedido.set(x.pedido_cortesia_id, { tipo_origen: 'lista', web_id_origen: x.id, lista_web_id: x.lista_id }));
        (invOrig || []).forEach((x: any) => origenPorPedido.set(x.pedido_cortesia_id, { tipo_origen: 'invitacion_rrpp', web_id_origen: x.id, lista_web_id: null }));
        const filas = (usados || []).map((u: any) => {
          const ped: any = pedMap.get(u.pedido_id);
          let nombre = ped?.nombre_cliente || '', rut = '';
          for (const ip of (ped?.items_pedido || [])) {
            const idx = (ip.qr_ids || []).indexOf(u.qr_id);
            if (idx >= 0) { const per = (ip.personas || [])[idx]; if (per?.nombre) nombre = per.nombre; rut = per?.rut || ''; break; }
          }
          const orig = origenPorPedido.get(u.pedido_id) || { tipo_origen: null, web_id_origen: null, lista_web_id: null };
          return { qr_id: u.qr_id, nombre, rut, hora_ingreso: u.created_at, escaneado_por: u.escaneado_por, incidencia: u.incidencia, origen: ped?.metodo_pago === 'cortesia' ? 'cortesia' : 'venta', ...orig };
        });
        return new Response(JSON.stringify({ fecha, checkins: filas }), { headers: cors });
      }

      // Snapshot de QR de la noche (PUERTA OFFLINE del ERP): la puerta lo baja al
      // abrir y lo cachea local; así valida sin depender de internet en vivo.
      if (url.searchParams.has('snapshot_qr')) {
        const fecha = url.searchParams.get('fecha') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return new Response(JSON.stringify({ error: 'fecha YYYY-MM-DD requerida' }), { status: 400, headers: cors });
        const { data: evs } = await sb.from('eventos').select('id, nombre').eq('fecha', fecha);
        const evIds = (evs || []).map((e: any) => e.id);
        if (!evIds.length) return new Response(JSON.stringify({ fecha, count: 0, generado_ts: new Date().toISOString(), qrs: [] }), { headers: cors });
        // Items PAGADOS de esos eventos (con su pedido para nombre/estado/tipo)
        const { data: items } = await sb.from('items_pedido')
          .select('qr_ids, personas, nombre_ticket, condiciones, pedido_id, pedidos(estado, metodo_pago, nombre_cliente)')
          .in('evento_id', evIds).limit(5000);
        // QRs ya quemados de la ventana de esa noche (para que la puerta arranque sabiendo)
        const ini = new Date(fecha + 'T12:00:00-03:00').toISOString();
        const fin = new Date(new Date(fecha + 'T12:00:00-03:00').getTime() + 24 * 3600 * 1000).toISOString();
        const { data: usados } = await sb.from('qr_usados').select('qr_id, created_at').gte('created_at', ini).lt('created_at', fin).limit(5000);
        const usadoMap = new Map((usados || []).map((u: any) => [u.qr_id, u.created_at]));
        const qrs: any[] = [];
        for (const it of (items || [])) {
          const ped: any = (it as any).pedidos;
          if (!ped || ped.estado !== 'pagado') continue;
          const ids = Array.isArray(it.qr_ids) ? it.qr_ids : [];
          ids.forEach((token: string, idx: number) => {
            const per: any = (it.personas || [])[idx] || {};
            qrs.push({
              qr_token: token,
              nombre: per.nombre || ped.nombre_cliente || '',
              rut: per.rut || '',
              tipo: ped.metodo_pago === 'cortesia' ? 'cortesia' : 'venta',
              nombre_ticket: it.nombre_ticket || '',
              condiciones: it.condiciones || null,
              ya_usado: usadoMap.has(token),
              usado_ts: usadoMap.get(token) || null,
            });
          });
        }
        return new Response(JSON.stringify({ fecha, count: qrs.length, generado_ts: new Date().toISOString(), qrs }), { headers: cors });
      }

      // Loyalty (Fase 5b): el ERP consulta las visitas/nivel de un cliente por RUT
      if (url.searchParams.has('loyalty')) {
        const rut = url.searchParams.get('rut') || '';
        const { data } = await sb.rpc('loyalty_de_rut', { p_rut: rut });
        return new Response(JSON.stringify(data || { visitas: 0, nivel: 'nuevo' }), { headers: cors });
      }

      // Chats del Anfitrión (Fase 4): el ERP los lee para su inbox
      if (url.searchParams.has('chats')) {
        const desde = url.searchParams.get('desde') || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: convs } = await sb.from('conversaciones').select('*').gte('ultimo_ts', desde).order('ultimo_ts', { ascending: false }).limit(200);
        const ids = (convs || []).map((c: any) => c.id);
        const { data: msgs } = ids.length
          ? await sb.from('mensajes').select('conversacion_id, rol, texto, ts').in('conversacion_id', ids).gte('ts', desde).order('ts')
          : { data: [] };
        return new Response(JSON.stringify({ desde, conversaciones: convs || [], mensajes: msgs || [] }), { headers: cors });
      }

      // Reconciliación ?desde=
      const desde = url.searchParams.get('desde') || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [{ data: rs }, { data: lis }, { data: invs }, { data: listasNv }] = await Promise.all([
        sb.from('reservas').select('*').in('tipo', ['reserva', 'cumpleanos']).or(`created_at.gte.${desde},updated_at.gte.${desde}`).limit(500),
        sb.from('lista_inscritos').select('*, listas(nombre, fecha, evento_id)').or(`created_at.gte.${desde},updated_at.gte.${desde}`).limit(500),
        sb.from('invitaciones_rrpp').select('*').or(`created_at.gte.${desde},updated_at.gte.${desde}`).limit(500),
        sb.from('listas').select('*').or(`created_at.gte.${desde},updated_at.gte.${desde}`).limit(200),
      ]);
      const solicitudes = [
        ...(rs || []).map((r: any) => ({
          tipo: r.tipo, web_id: r.id, cliente_id: r.cliente_id, nombre: r.nombre, rut: r.rut || '', telefono: r.telefono || '',
          email: r.email || '', instagram: r.instagram || '', fecha: r.fecha, evento_web_id: r.evento_id,
          personas: r.personas, invitados: r.invitados || [], zona_preferida: r.zona_preferida || '',
          presupuesto: r.presupuesto, quiere_botellas: r.quiere_botellas, quiere_decoracion: r.quiere_decoracion,
          quiere_mesa: r.quiere_mesa, fecha_nacimiento: r.fecha_nacimiento, comentario: r.comentario || '',
          estado: r.estado, creado_at: r.created_at, actualizado_at: r.updated_at,
        })),
        ...(lis || []).map((i: any) => ({
          tipo: 'lista', web_id: i.id, lista_web_id: i.lista_id, lista_nombre: i.listas?.nombre || '',
          evento_web_id: i.listas?.evento_id || null, fecha: i.listas?.fecha || null,
          nombre: i.nombre, rut: i.rut || '', telefono: i.telefono || '', email: i.email || '', instagram: i.instagram || '',
          acompanantes: i.acompanantes || 0, estado: i.estado, creado_at: i.created_at, actualizado_at: i.updated_at,
        })),
        ...(invs || []).map((i: any) => ({
          tipo: 'invitacion_rrpp', web_id: i.id, codigo: i.codigo || '', rrpp_duenio_id: i.duenio_id,
          evento_web_id: i.evento_id, fecha: i.fecha, nombre: i.nombre, rut: i.rut || '', telefono: i.telefono || '',
          email: i.email || '', instagram: i.instagram || '', personas: i.personas || 1,
          estado: i.estado, creado_at: i.created_at, actualizado_at: i.updated_at,
        })),
      ];
      return new Response(JSON.stringify({ desde, solicitudes, listas: listasNv || [] }), { headers: cors });
    }

    // ══ POST: acciones del ERP (objeto o lote ≤ 500) ═════════
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método no soportado' }), { status: 405, headers: cors });
    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ error: 'JSON malformado' }), { status: 400, headers: cors });
    const items = Array.isArray(body) ? body : [body];
    if (items.length > 500) return new Response(JSON.stringify({ error: 'Lote máximo: 500' }), { status: 400, headers: cors });

    const resultados: any[] = [];
    for (const item of items) {
      const accion = String(item?.accion || '');
      const p = item?.payload || {};
      try {
        // ── Pago informado por el ERP sobre una ficha de FORMULARIOS ──
        // Solo si viene `tabla: 'formularios'` explícito, `web_id` es un formulario
        // (NO una reserva). `web_tipo` solo NO alcanza: 'reserva'/'cumpleanos' existen
        // en las dos tablas con ids que chocan, y el pago terminaría en otra ficha: se registra como pago manual con el mismo
        // helper que la acción 'manual' de crm-pago (crea el cobro pagado con
        // folio CUM-M…/RES-M…, suma a la ficha, recalcula el estado y reenvía la
        // ficha al ERP). Acá `monto` es lo que se pagó AHORA (se suma), no el total.
        // Sin `tabla: 'formularios'` sigue el camino de siempre (reservas, más abajo).
        if (accion === 'marcar_pagado' && String(p.tabla || '').trim() === 'formularios') {
          const webId = parseInt(p.web_id);
          const tabla = String(p.tabla || '').trim();
          const webTipo = String(p.web_tipo || '').trim();
          if (!webId) { resultados.push({ ok: false, web_id: null, error: 'datos_invalidos', detalle: 'Falta web_id.' }); continue; }
          const { data: fForm, error: eForm } = await sb.from('formularios').select('id,tipo').eq('id', webId).maybeSingle();
          if (eForm) throw new Error('formularios: ' + eForm.message);
          if (!fForm) { resultados.push({ ok: false, web_id: webId, error: 'no_encontrada' }); continue; }
          // web_tipo tiene que calzar con la ficha: si no calza, lo más probable es
          // que el id sea de otra tabla, y la plata terminaría en otra persona.
          const tipoFicha = fForm.tipo === 'cumple' ? 'cumpleanos' : fForm.tipo === 'reserva' ? 'reserva' : String(fForm.tipo || '');
          if (webTipo && webTipo !== tipoFicha) {
            resultados.push({ ok: false, web_id: webId, error: 'tipo_no_coincide', detalle: `web_tipo "${webTipo.slice(0, 30)}" y la ficha es "${tipoFicha}".` });
            continue;
          }
          // Reintento del ERP: si manda erp_pago_id, un mismo pago no entra dos veces.
          const llave = String(p.erp_pago_id ?? p.idempotency_key ?? '').trim().slice(0, 60);
          if (llave) {
            const { data: previos, error: ePrev } = await sb.from('crm_pagos').select('id,folio,concepto')
              .eq('tipo', 'formulario').eq('ref_id', webId).eq('pagado_via', 'erp');
            if (ePrev) throw new Error('crm_pagos: ' + ePrev.message);
            const ya = (previos || []).find((c: any) => String(c.concepto || '').includes(`[erp:${llave}]`));
            if (ya) { resultados.push({ ok: true, web_id: webId, folio: ya.folio, cobro_id: ya.id, idempotente: true }); continue; }
          }
          // El medio viene en texto libre desde el ERP: se lleva a los tres que acepta el helper.
          const medioTxt = String(p.medio || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          // Lo que no calce (p. ej. 'mercadopago') lo rechaza el helper con datos_invalidos.
          const medio = /efectivo|cash/.test(medioTxt) ? 'efectivo'
                      : /transf|deposito/.test(medioTxt) ? 'transferencia'
                      : /tarjeta|debito|credito|redcompra/.test(medioTxt) ? 'tarjeta' : medioTxt;
          const notaBase = String(p.nota || p.concepto || '').trim() || (llave ? 'Pago informado por el ERP' : '');
          const nota = llave ? `${notaBase.slice(0, 200 - llave.length - 8)} [erp:${llave}]`.trim() : notaBase;
          const rm = await registrarPagoManual(sb, {
            tipo: 'formulario', refId: webId, monto: parseInt(p.monto) || 0, medio, nota,
            via: 'erp', creadoPorNombre: String(p.por || '').slice(0, 80) || 'ERP',
          });
          if (!rm.ok) {
            resultados.push({
              ok: false, web_id: webId,
              error: rm.code === 'NO_EXISTE_FICHA' ? 'no_encontrada' : rm.code === 'DATOS' ? 'datos_invalidos' : 'error',
              detalle: rm.error || null,
            });
            continue;
          }
          resultados.push({
            ok: true, web_id: webId, tabla: 'formularios', folio: rm.folio, cobro_id: rm.cobro?.id ?? null,
            monto_pagado_total: rm.ficha?.montoPagadoTotal ?? null, monto_total: rm.ficha?.montoTotal ?? null,
            estado_pago: rm.ficha?.pago ?? null, ...(rm.aviso ? { aviso: rm.aviso } : {}),
          });
          continue;
        }

        // ── Reservas / cumpleaños ──
        if (['confirmar_reserva', 'rechazar_reserva', 'confirmar_cumpleanos', 'rechazar_cumpleanos', 'marcar_pagado'].includes(accion)) {
          const webId = parseInt(p.web_id);
          const { data: r } = await sb.from('reservas').select('*').eq('id', webId).maybeSingle();
          if (!r) { resultados.push({ ok: false, web_id: webId, error: 'no_encontrada' }); continue; }
          // ── mover_mesa (el ERP mueve una mesa en la noche) ──────
          // Acordado con el ERP el 2026-08-01: la mesa NACE en la web, pero el
          // local la mueve de verdad — alguien llega con más gente, una mesa
          // se cae, se reubica un cumpleaños. Los dos escriben.
          // ⚠️ Lo que NO puede pasar es que el cambio sea silencioso. Por eso
          //    viaja con autor, hora y valor anterior, y queda en el historial.
          //    Es la misma lección que el ERP aprendió cuando un borrado escrito
          //    como ausencia le devolvió $670.000 tres veces: un cambio que se
          //    puede ver es un cambio que se puede deshacer.
          if (accion === 'mover_mesa') {
            const { data: fila } = await sb.from('formularios').select('gestion,historial,nombre').eq('id', webId).maybeSingle();
            if (!fila) { resultados.push({ ok: false, web_id: webId, error: 'no_existe' }); continue; }
            const g: Record<string, unknown> = { ...(fila.gestion || {}) };
            const antes = String(g.mesa || g.zona || '').trim();
            const nueva = String(p.mesa_asignada ?? p.mesa ?? '').trim();
            if (antes === nueva) { resultados.push({ ok: true, web_id: webId, idempotente: true }); continue; }

            g.mesa = nueva || undefined;
            g.zona = nueva || undefined;          // las dos llaves: la web las lee por separado
            g.mesa_origen = 'erp';
            g.mesa_cambiada_at = String(p.mesa_cambiada_at || new Date().toISOString());
            g.mesa_anterior = antes || null;
            g.mesa_motivo = String(p.motivo || '').slice(0, 200) || undefined;
            g.mesa_por = String(p.por || '').slice(0, 80) || undefined;

            const hist = Array.isArray(fila.historial) ? fila.historial.slice() : [];
            hist.push({
              ts: g.mesa_cambiada_at,
              ev: `🪑 mesa: ${antes || '(sin asignar)'} → ${nueva || '(sin asignar)'}`
                + (p.por ? ' · ' + String(p.por).slice(0, 40) : '') + ' · desde el ERP'
                + (p.motivo ? ' · ' + String(p.motivo).slice(0, 100) : ''),
            });
            await sb.from('formularios').update({ gestion: g, historial: hist, updated_at: new Date().toISOString() }).eq('id', webId);
            resultados.push({ ok: true, web_id: webId, mesa_anterior: antes || null, mesa_asignada: nueva || null });
            continue;
          }

          if (accion === 'marcar_pagado') {
            await sb.from('reservas').update({ pagado_monto: parseInt(p.monto) || 0, pagado_medio: String(p.medio || '').slice(0, 40), updated_at: new Date().toISOString() }).eq('id', webId);
            resultados.push({ ok: true, web_id: webId });
            continue;
          }
          const esConfirmar = accion.startsWith('confirmar');
          const estadoNuevo = esConfirmar ? 'confirmada' : 'rechazada';
          if (r.estado === estadoNuevo) { resultados.push({ ok: true, web_id: webId, estado: estadoNuevo, idempotente: true }); continue; }
          if (r.estado === 'cancelada') { resultados.push({ ok: false, web_id: webId, error: 'estado_invalido', detalle: 'El cliente ya la canceló' }); continue; }
          const upd: Record<string, unknown> = { estado: estadoNuevo, nota_cliente: String(p.nota_cliente || '').slice(0, 500) || null, updated_at: new Date().toISOString() };
          if (esConfirmar) {
            upd.mesa_nombre = p.mesa?.nombre || null; upd.mesa_zona = p.mesa?.zona || null;
            upd.condiciones = String(p.condiciones || p.beneficios || '').slice(0, 500) || null;
            upd.abono_requerido = parseInt(p.abono_requerido) || null;
            if (p.consumo_minimo) upd.consumo_minimo_ofrecido = parseInt(p.consumo_minimo) || null;
          } else { upd.motivo_rechazo = String(p.motivo || '').slice(0, 300) || null; }
          await sb.from('reservas').update(upd).eq('id', webId);
          const esCumple = r.tipo === 'cumpleanos';
          if (r.email) {
            if (esConfirmar) {
              await mail(r.email, `✅ Tu ${esCumple ? 'cumpleaños' : 'reserva'} en FRATE está confirmad${esCumple ? 'o' : 'a'}`,
                plantilla(`¡Confirmad${esCumple ? 'o' : 'a'} para el ${r.fecha}! 🎉`,
                  `<p>${p.mesa?.nombre ? `Tu mesa: <b>${p.mesa.nombre}</b>${p.mesa?.zona ? ' (' + p.mesa.zona + ')' : ''}.<br/>` : ''}${p.consumo_minimo ? `Consumo mínimo: <b>$${parseInt(p.consumo_minimo).toLocaleString('es-CL')}</b>.<br/>` : ''}${p.abono_requerido ? `Abono para asegurar: <b>$${parseInt(p.abono_requerido).toLocaleString('es-CL')}</b>.<br/>` : ''}${upd.condiciones ? upd.condiciones + '<br/>' : ''}${upd.nota_cliente ? '<i>' + upd.nota_cliente + '</i>' : ''}</p>`));
            } else {
              await mail(r.email, `Tu solicitud en FRATE — ${r.fecha}`,
                plantilla('No pudimos confirmar tu solicitud 😔', `<p>${p.motivo ? 'Motivo: <b>' + p.motivo + '</b>.<br/>' : ''}${upd.nota_cliente || 'Escríbenos por WhatsApp y buscamos otra opción.'}</p>`));
            }
          }
          resultados.push({ ok: true, web_id: webId, estado: estadoNuevo });
          continue;
        }

        // ── Crear lista (decisión 7): el ERP crea la lista y recibe el "frate link" ──
        if (accion === 'crear_lista') {
          const nombre = String(p.nombre || '').trim();
          const fecha = String(p.fecha || '').trim();
          if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { resultados.push({ ok: false, error: 'nombre_y_fecha_obligatorios' }); continue; }
          const tipo = String(p.tipo || 'lista').slice(0, 20);
          const rrpp = (p.rrpp && typeof p.rrpp === 'object') ? p.rrpp : {};
          const genCod = () => 'L' + Math.random().toString(36).slice(2, 7).toUpperCase();
          let codigo = String(rrpp.codigo || p.codigo || '').trim().toUpperCase() || genCod();
          for (let i = 0; i < 6; i++) {   // asegurar unicidad del código
            const { data: dup } = await sb.from('listas').select('id').eq('codigo', codigo).limit(1);
            if (!dup || !dup.length) break;
            codigo = genCod();
          }
          const genero = tipo === 'mujeres' ? 'F' : (String(p.genero_esperado || '').toUpperCase().slice(0, 1) || null);
          const { data: lista, error } = await sb.from('listas').insert({
            nombre, fecha,
            evento_id: parseInt(p.evento_web_id ?? p.evento_id) || null,
            cupos: parseInt(p.cupos) || null,
            codigo, tipo, genero_esperado: genero,
            duenio_id: rrpp.duenio_id || null,
            duenio_nombre: rrpp.nombre || p.duenio_nombre || null,
            estado: 'aprobada', origen: 'erp',
          }).select('id').single();
          if (error) throw error;
          resultados.push({ ok: true, lista_web_id: lista.id, codigo, url: `https://www.frate.cl/lista/${codigo}` });
          continue;
        }

        // ── Listas ──
        if (accion === 'aprobar_lista' || accion === 'rechazar_lista') {
          const listaId = parseInt(p.lista_web_id);
          const { data: lista } = await sb.from('listas').select('*').eq('id', listaId).maybeSingle();
          if (!lista) { resultados.push({ ok: false, lista_web_id: listaId, error: 'no_encontrada' }); continue; }
          if (accion === 'rechazar_lista') {
            await sb.from('listas').update({ estado: 'rechazada', motivo_rechazo: String(p.motivo || '').slice(0, 300) || null, updated_at: new Date().toISOString() }).eq('id', listaId);
            resultados.push({ ok: true, lista_web_id: listaId });
            continue;
          }
          await sb.from('listas').update({ estado: 'aprobada', cupos: parseInt(p.cupos) || lista.cupos || 100, valido_hasta: p.valido_hasta || null, updated_at: new Date().toISOString() }).eq('id', listaId);
          // Regla de nómina (RESPUESTAS-CRM-ERP): los de nomina[] que no existan se crean aprobados (origen erp)
          for (const n of (Array.isArray(p.nomina) ? p.nomina.slice(0, 200) : [])) {
            if (!n?.nombre || !n?.rut) continue;
            const { data: existe } = await sb.from('lista_inscritos').select('id').eq('lista_id', listaId).eq('rut', n.rut).maybeSingle();
            if (!existe) await sb.from('lista_inscritos').insert({ lista_id: listaId, nombre: n.nombre, rut: n.rut, telefono: n.telefono || null, email: n.email || null, estado: 'pendiente', origen: 'erp' });
          }
          // Materializar cortesías de TODOS los pendientes con RUT
          const { data: pendientes } = await sb.from('lista_inscritos').select('*').eq('lista_id', listaId).eq('estado', 'pendiente');
          const aprobados: any[] = [];
          for (const insc of (pendientes || [])) {
            if (!insc.rut) { aprobados.push({ web_id: insc.id, nombre: insc.nombre, error: 'rut_requerido' }); continue; }
            const cort = await generarCortesia(sb, { nombre: insc.nombre, rut: insc.rut, email: insc.email, eventoId: lista.evento_id, fecha: lista.fecha, etiqueta: 'Lista: ' + lista.nombre, cantidad: 1 + (insc.acompanantes || 0), condiciones: lista.condiciones });
            await sb.from('lista_inscritos').update({ estado: 'aprobado', pedido_cortesia_id: cort.pedidoId, qr_ids: cort.qrIds, updated_at: new Date().toISOString() }).eq('id', insc.id);
            aprobados.push({ web_id: insc.id, nombre: insc.nombre, rut: insc.rut, qr_ids: cort.qrIds, qr_urls: cort.qrIds.map(QR_IMG) });
          }
          resultados.push({ ok: true, lista_web_id: listaId, aprobados });
          continue;
        }

        // ── Inscripciones e invitaciones individuales ──
        if (['aprobar_inscripcion', 'rechazar_inscripcion', 'aprobar_invitacion_rrpp', 'rechazar_invitacion_rrpp'].includes(accion)) {
          const esInv = accion.includes('invitacion');
          const tabla = esInv ? 'invitaciones_rrpp' : 'lista_inscritos';
          const webId = parseInt(p.web_id);
          let fila: any = null;
          if (esInv) {
            const { data } = await sb.from('invitaciones_rrpp').select('*').eq('id', webId).maybeSingle();
            fila = data;
          } else {
            const { data } = await sb.from('lista_inscritos').select('*, listas(nombre, fecha, evento_id)').eq('id', webId).maybeSingle();
            fila = data;
          }
          if (!fila) { resultados.push({ ok: false, web_id: webId, error: 'no_encontrada' }); continue; }
          if (accion.startsWith('rechazar')) {
            await sb.from(tabla).update({ estado: 'rechazado', motivo_rechazo: String(p.motivo || '').slice(0, 300) || null, updated_at: new Date().toISOString() }).eq('id', webId);
            if (fila.email) await mail(fila.email, 'Tu solicitud en FRATE', plantilla('Tu inscripción no fue aprobada 😔', `<p>${p.motivo ? 'Motivo: <b>' + p.motivo + '</b>' : 'Escríbenos por WhatsApp para más detalles.'}</p>`));
            resultados.push({ ok: true, web_id: webId });
            continue;
          }
          if (fila.estado === 'aprobado' && Array.isArray(fila.qr_ids) && fila.qr_ids.length) {
            resultados.push({ ok: true, web_id: webId, idempotente: true, qr_ids: fila.qr_ids, qr_urls: fila.qr_ids.map(QR_IMG) });
            continue;
          }
          if (!fila.rut) { resultados.push({ ok: false, web_id: webId, error: 'rut_requerido' }); continue; }
          const fecha = esInv ? fila.fecha : (fila.listas?.fecha || fila.created_at?.slice(0, 10));
          const eventoId = esInv ? fila.evento_id : fila.listas?.evento_id;
          const etiqueta = esInv ? 'Invitación RRPP' : 'Lista: ' + (fila.listas?.nombre || '');
          const cantidad = esInv ? (fila.personas || 1) : 1 + (fila.acompanantes || 0);
          const cort = await generarCortesia(sb, { nombre: fila.nombre, rut: fila.rut, email: fila.email, eventoId, fecha, etiqueta, cantidad, condiciones: esInv ? null : fila.listas?.condiciones });
          await sb.from(tabla).update({ estado: 'aprobado', pedido_cortesia_id: cort.pedidoId, qr_ids: cort.qrIds, updated_at: new Date().toISOString() }).eq('id', webId);
          resultados.push({ ok: true, web_id: webId, qr_ids: cort.qrIds, qr_urls: cort.qrIds.map(QR_IMG) });
          continue;
        }

        // ── Puerta OFFLINE del ERP: quemar un QR (idempotente, con gate_id) ──
        // La puerta valida contra su cache local y al reconectar sincroniza los
        // "quemados". Idempotente por qr_id: si ya estaba quemado devuelve ya_usado
        // + primera_vez_ts + gate_id_previo → el ERP detecta doble-uso (dos puertas).
        if (accion === 'validar_qr') {
          const token = String(p.qr_token || '').trim();
          const gate  = String(p.gate_id || '').slice(0, 60) || null;
          const tsDisp = p.ts || null;
          if (!token) { resultados.push({ ok: false, error: 'falta_qr_token' }); continue; }
          const { data: it } = await sb.from('items_pedido').select('pedido_id, pedidos(estado)').contains('qr_ids', [token]).limit(1).maybeSingle();
          if (!it) { resultados.push({ ok: false, qr_token: token, error: 'qr_no_existe' }); continue; }
          if ((it as any).pedidos?.estado !== 'pagado') { resultados.push({ ok: false, qr_token: token, error: 'no_pagado' }); continue; }
          const { data: ya } = await sb.from('qr_usados').select('created_at, gate_id').eq('qr_id', token).maybeSingle();
          if (ya) { resultados.push({ ok: true, qr_token: token, ya_usado: true, primera_vez_ts: ya.created_at, gate_id_previo: (ya as any).gate_id || null }); continue; }
          // Insertar (defensivo: si aún no corriste el SQL de columnas nuevas, inserta sin ellas)
          let insErr: any = null;
          { const { error } = await sb.from('qr_usados').insert({ qr_id: token, pedido_id: (it as any).pedido_id, gate_id: gate, ts_dispositivo: tsDisp }); insErr = error; }
          if (insErr && /gate_id|ts_dispositivo|column/i.test(String(insErr.message || ''))) {
            const { error } = await sb.from('qr_usados').insert({ qr_id: token, pedido_id: (it as any).pedido_id }); insErr = error;
          }
          if (insErr) {
            // Carrera: otro gate lo quemó entremedio → devolver ya_usado
            const { data: ya2 } = await sb.from('qr_usados').select('created_at, gate_id').eq('qr_id', token).maybeSingle();
            if (ya2) { resultados.push({ ok: true, qr_token: token, ya_usado: true, primera_vez_ts: ya2.created_at, gate_id_previo: (ya2 as any).gate_id || null }); continue; }
            resultados.push({ ok: false, qr_token: token, error: String(insErr.message || insErr) }); continue;
          }
          resultados.push({ ok: true, qr_token: token, ya_usado: false, primera_vez_ts: new Date().toISOString(), gate_id: gate });
          continue;
        }

        // ── DESCONTINUADO (2026-07-09): la WEB administra el inbox y TODOS los
        // canales de cliente (web/WhatsApp/Instagram) directo en su Meta. El ERP
        // ya no relaya chat entrante ni transporta la conversación. Ver CONTRATO §1.
        if (accion === 'inbound_chat') {
          resultados.push({ ok: false, error: 'inbound_chat descontinuado — la WEB administra el inbox + los canales (web/WhatsApp/IG). Ver CONTRATO-WEB-ERP.md §1.' });
          continue;
        }

        // ── Chat: el humano del ERP responde a una conversación (Fase 4) ──
        if (accion === 'responder_canal') {
          const convId = p.conversacion_id;
          const texto = String(p.texto || '').slice(0, 1000);
          if (!convId || !texto) { resultados.push({ ok: false, error: 'faltan conversacion_id/texto' }); continue; }
          await sb.from('mensajes').insert({ conversacion_id: convId, rol: 'humano', texto });
          await sb.from('conversaciones').update({ estado: p.cerrar ? 'cerrado' : 'humano', ultimo_ts: new Date().toISOString() }).eq('id', convId);
          resultados.push({ ok: true, conversacion_id: convId });
          continue;
        }

        resultados.push({ ok: false, error: 'accion_desconocida', accion });
      } catch (e) {
        resultados.push({ ok: false, accion, web_id: p?.web_id ?? p?.lista_web_id ?? null, error: String((e as any)?.message || e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, resultados }), { headers: cors });

  } catch (err) {
    console.error('[api-crm]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
