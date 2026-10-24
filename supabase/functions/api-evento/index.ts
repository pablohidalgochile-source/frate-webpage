// ============================================================
// FRATE — Edge Function: api-evento (API para el ERP)
// Entrega los datos OPERATIVOS de un evento en JSON, listo para
// que el ERP / sistema de la noche los consuma.
//
// Seguridad: requiere el header  x-api-key: <ERP_API_KEY>
//
// Uso:
//   GET  /functions/v1/api-evento?evento_id=5
//   POST /functions/v1/api-evento   body { evento_id: 5 }
//
// Secrets: ERP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy SIN verificación de JWT (verify_jwt=false) — usa su propia
// API key. Ver config.toml.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── Autenticación por API key ────────────────────────────
    const ERP_KEY = Deno.env.get('ERP_API_KEY');
    if (!ERP_KEY) return j({ error: 'ERP_API_KEY no configurada' }, 500, cors);
    const sent = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('api_key') || '';
    if (sent !== ERP_KEY) return j({ error: 'No autorizado' }, 401, cors);

    // ── Evento solicitado ────────────────────────────────────
    let eventoId: number | null = null;
    let eventUid: string | null = null;
    if (req.method === 'POST') { const b = await req.json().catch(() => ({})); eventoId = Number(b.evento_id) || null; eventUid = b.event_uid ? String(b.event_uid) : null; }
    else { const q = new URL(req.url).searchParams; eventoId = Number(q.get('evento_id')) || null; eventUid = q.get('event_uid'); }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // R11: se puede pedir por event_uid (external_id canónico) en lugar de evento_id.
    if (!eventoId && eventUid) {
      const { data: ev } = await sb.from('eventos').select('id').eq('external_id', eventUid).maybeSingle();
      if (!ev) return j({ error: 'Evento no encontrado (event_uid)' }, 404, cors);
      eventoId = ev.id;
    }

    // Sin evento_id → devolver la LISTA de eventos (para el selector del ERP)
    if (!eventoId) {
      const { data: eventos } = await sb.from('eventos').select('id, external_id, nombre, fecha, hora, hora_termino, estado, activo, archivado').order('fecha', { ascending: false });
      return j({ ok: true, eventos: eventos || [] }, 200, cors);
    }

    const [{ data: evento }, { data: tipos }, { data: items }] = await Promise.all([
      sb.from('eventos').select('id, external_id, nombre, fecha, hora, hora_termino, estado, ambiente, archivado').eq('id', eventoId).maybeSingle(),
      sb.from('tipos_ticket').select('id, nombre, precio, disponible, vence_hora, ticket_uid, estado, venta_desde, venta_hasta').eq('evento_id', eventoId),
      sb.from('items_pedido').select('tipo_ticket_id, nombre_ticket, cantidad, precio_unitario, personas, qr_ids, pedidos!inner(id, estado, dev_estado, dev_opcion, dev_motivo, total_pagado, nombre_cliente, email_cliente)').eq('evento_id', eventoId).in('pedidos.estado', ['pagado', 'reembolsado', 'requiere_reembolso']),
    ]);

    if (!evento) return j({ error: 'Evento no encontrado' }, 404, cors);

    // Check-ins: traer SOLO los QR de este evento (por lotes). qr_usados es global e histórica;
    // sin acotar, el tope por defecto (~1000 filas) truncaba silenciosamente los check-ins.
    const qrIdsEvento: string[] = [];
    for (const ip of (items || []) as any[]) { const qs = Array.isArray(ip.qr_ids) ? ip.qr_ids : []; for (const q of qs) if (q) qrIdsEvento.push(String(q)); }
    const usados: any[] = [];
    for (let i = 0; i < qrIdsEvento.length; i += 200) {
      const { data } = await sb.from('qr_usados').select('qr_id, created_at, incidencia, incidencia_nota').in('qr_id', qrIdsEvento.slice(i, i + 200));
      if (data) usados.push(...data);
    }

    const usadosMap = new Map(usados.map((u: any) => [String(u.qr_id).toUpperCase(), u]));

    // Por tipo de ticket
    const porTipo: Record<number, any> = {};
    // ticket_uid/estado/ventana: los pide el ERP para verificar un import sin credenciales
    // de la base. Con `estado` y `ticket_uid` se comprueba que los tramos no se fusionaron;
    // con la ventana, cuál está vigente. Aditivos: nadie que lea los campos viejos se entera.
    (tipos || []).forEach((t: any) => { porTipo[t.id] = {
      id: t.id, nombre: t.nombre, precio: t.precio, disponible: t.disponible,
      ticket_uid: t.ticket_uid ?? null, estado: t.estado ?? null,
      venta_desde: t.venta_desde ?? null, venta_hasta: t.venta_hasta ?? null,
      vendidos: 0, ingresos: 0 }; });

    // Asistentes (1 fila por QR) + check-ins + devoluciones/incidencias
    const asistentes: any[] = [];
    const devoluciones: any[] = [];
    const devVistos = new Set<number>();
    let ingresosTotal = 0, checkIns = 0, incidencias = 0;
    for (const ip of (items || []) as any[]) {
      const ped = ip.pedidos || {};
      const esPagado = ped.estado === 'pagado';
      const qrIds = Array.isArray(ip.qr_ids) ? ip.qr_ids : [];
      const personas = Array.isArray(ip.personas) ? ip.personas : [];
      if (esPagado && ip.tipo_ticket_id && porTipo[ip.tipo_ticket_id]) {
        porTipo[ip.tipo_ticket_id].vendidos += ip.cantidad || 0;
        porTipo[ip.tipo_ticket_id].ingresos += (ip.precio_unitario || 0) * (ip.cantidad || 0);
      }
      if (esPagado) ingresosTotal += (ip.precio_unitario || 0) * (ip.cantidad || 0);
      // Devoluciones / reactivaciones (1 por pedido)
      if ((ped.dev_estado || ped.estado === 'reembolsado' || ped.estado === 'requiere_reembolso') && !devVistos.has(ped.id)) {
        devVistos.add(ped.id);
        devoluciones.push({
          orden: 'FCC-' + String(ped.id).padStart(6, '0'),
          cliente: ped.nombre_cliente || '', email: ped.email_cliente || '',
          monto: ped.total_pagado || 0,
          tipo: ped.dev_opcion || (ped.estado === 'requiere_reembolso' ? 'dinero' : null),  // 'credito' = reactivación
          estado: ped.dev_estado || ped.estado,  // pendiente | aprobada | rechazada | reembolsado | requiere_reembolso
          motivo: ped.dev_motivo || null,
        });
      }
      if (!esPagado) continue;  // asistentes solo de pedidos vigentes
      qrIds.forEach((qr: string, i: number) => {
        const u: any = usadosMap.get(String(qr).toUpperCase()) || null;
        if (u) checkIns++;
        if (u?.incidencia) incidencias++;
        asistentes.push({
          qr_id: qr,
          nombre: personas[i]?.nombre || '',
          rut: personas[i]?.rut || '',
          tipo: ip.nombre_ticket || '',
          ingresado: !!u,
          ingreso_at: u?.created_at || null,
          incidencia: u?.incidencia || null,        // 'posible_devolucion' | 'resuelta_credito' | 'rechazada'
          incidencia_nota: u?.incidencia_nota || null,
        });
      });
    }

    const entradasVendidas = asistentes.length;

    // Cortesías / listas gratuitas del evento (tipo='cortesia' o cover 0) con conteo de
    // inscritos. Service role → cuenta lista_inscritos sin que la RLS lo bloquee (R11/R25).
    let cortesias: any[] = [];
    try {
      const { data: listas } = await sb.from('listas')
        .select('id, nombre, inviter_nombre, cupos, estado, duenio_nombre, tipo, cover_amount, lista_inscritos(count)')
        .eq('evento_id', eventoId);
      cortesias = (listas || [])
        .filter((l: any) => (l.tipo === 'cortesia' || (Number(l.cover_amount) || 0) === 0) && l.estado !== 'rechazada')
        .map((l: any) => ({
          id: l.id, nombre: l.nombre || l.inviter_nombre || 'Lista',
          cupos: l.cupos || 0, estado: l.estado || '', dueno: l.duenio_nombre || '',
          inscritos: (l.lista_inscritos?.[0]?.count) || 0,
        }))
        .sort((a: any, b: any) => b.inscritos - a.inscritos);
    } catch (_) { cortesias = []; }

          // Se pide a la base: una consulta agregada e indexada, en vez de traerse
      // el evento entero a memoria. Si la función no está, va null y el ERP
      // muestra el rótulo sin números en vez de inventar.
      let porOrigen: unknown = null;
      try {
        const { data: po } = await sb.rpc('evento_checkins_por_origen', { p_evento_id: evento.id });
        if (po && typeof po === 'object') porOrigen = po;
      } catch (_) { /* sin la función todavía → null, y el ERP lo maneja */ }

      // Desglose de listas por tipo y por sector, acordado con el ERP.
      // Va acá Y en el webhook `totales`: la vez pasada lo pusimos en uno solo
      // y ellos leían el otro.
      let desglose: any = null;
      try {
        const { data: dg } = await sb.rpc('evento_desglose_listas', { p_evento_id: evento.id });
        if (dg && typeof dg === 'object') desglose = dg;
      } catch (_) { /* sin la función → null, y el ERP muestra el rótulo sin números */ }

      return j({
      ok: true,
      cortesias,           // 🎟 listas gratuitas del evento con su conteo de inscritos
      evento: { id: evento.id, external_id: evento.external_id || null, nombre: evento.nombre, fecha: evento.fecha, hora: evento.hora, hora_termino: evento.hora_termino, estado: evento.estado, archivado: evento.archivado, ambiente: evento.ambiente },
      resumen: {
        entradas_vendidas: entradasVendidas,
        ingresos_total: ingresosTotal,
        check_ins: checkIns,
        // Desglose de los check-ins por de dónde viene cada persona.
        // El ERP comparaba el total contra las pulseras de PREVENTA y le
        // faltaban 21; partido, la preventa calza en una persona.
        // Va acá y no solo en el webhook `totales` porque este es el endpoint
        // que alimenta su panel en vivo.
        check_ins_por_origen: porOrigen,
        listas_por_tipo:   desglose ? desglose.listas_por_tipo   : null,
        listas_por_sector: desglose ? desglose.listas_por_sector : null,
        sin_emitir:        desglose ? desglose.sin_emitir        : null,
        pendientes_ingreso: entradasVendidas - checkIns,   // = no usados (si el evento ya terminó)
        incidencias_puerta: incidencias,
        devoluciones_reactivaciones: devoluciones.length,
      },
      tipos: Object.values(porTipo),
      asistentes,          // cada uno con ingreso_at → el ERP puede armar el histograma por hora
      devoluciones,        // solicitudes de crédito (reactivación) y dinero, con estado
      generado_at: new Date().toISOString(),
    }, 200, cors);
  } catch (err) {
    console.error('[api-evento]', err);
    return j({ error: String((err as any)?.message || err) }, 500, cors);
  }
});

function j(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), { status, headers: cors });
}
