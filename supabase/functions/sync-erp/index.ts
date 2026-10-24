// ============================================================
// FRATE — Edge Function: sync-erp (WEB → ERP)
// Emisor DESACOPLADO: empuja al ERP, EN VIVO, todo lo de la puerta:
//   • cortesías emitidas (items_pedido)          → tipo 'cortesia_emitida'
//   • check-ins de puerta (qr_usados)            → tipo 'checkin'
//   • ventas pagadas (items_pedido, no cortesía) → tipo 'venta'
//   • totales por evento (aforo + recaudado)     → tipo 'totales'
// Reusa la cola/reintentos existente. NO toca la puerta ni la venta.
//
// Idempotente (checkin/cortesia/venta): registra cada QR en
// `erp_sync_log` y no lo reenvía. Los totales son un snapshot en vivo
// (sin dedupe, el ERP los sobrescribe).
//
// TIEMPO REAL: lo dispara un trigger pg_net en qr_usados/pedidos
// (frate-sync-erp-tiempo-real.sql) apenas ocurre un check-in o venta.
//
// SEGURO POR DISEÑO: los tipos nuevos ('venta','totales') van en LOTES
// APARTE de los ya probados ('checkin','cortesia_emitida'). Si el ERP
// todavía no acepta un tipo nuevo, ese lote se encola y reintenta solo,
// SIN afectar lo que ya funciona. Ver ARQUITECTURA-SYNC-ERP.md.
//
// verify_jwt=false. Protegido por CRON_SECRET (opcional).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRM_WEBHOOK_KEY, [CRON_SECRET]
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { enviarWebhookERP } from '../_shared/crm.ts';

const VENTANA_DIAS = 3;   // solo procesa lo emitido/escaneado en los últimos N días

Deno.serve(async (req: Request) => {
  // Protección opcional por secreto
  const secret = Deno.env.get('CRON_SECRET');
  if (secret) {
    const url = new URL(req.url);
    const got = req.headers.get('x-cron-secret') || url.searchParams.get('key');
    if (got !== secret) return json({ error: 'forbidden' }, 403);
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const desde = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();
  const eventos: any[] = [];

  // ── 1) Cortesías emitidas ──────────────────────────────────
  try {
    const { data: items } = await sb.from('items_pedido')
      .select('evento_id,nombre_ticket,qr_ids,personas,created_at,pedido_id,pedidos!inner(id,metodo_pago,estado,nombre_cliente,email_cliente,created_at)')
      .eq('pedidos.metodo_pago', 'cortesia').eq('pedidos.estado', 'pagado')
      .gte('pedidos.created_at', desde).limit(500);
    for (const it of ((items || []) as any[])) {
      const ped: any = Array.isArray(it.pedidos) ? it.pedidos[0] : it.pedidos;
      const qrs = Array.isArray(it.qr_ids) ? it.qr_ids : [];
      const pers = Array.isArray(it.personas) ? it.personas : [];
      qrs.forEach((qr: string, idx: number) => {
        if (!qr) return;
        const p: any = pers[idx] || {};
        eventos.push({
          tipo: 'cortesia_emitida', qr,
          web_pedido_id: it.pedido_id || ped?.id,
          evento_web_id: it.evento_id,
          nombre: p.nombre || ped?.nombre_cliente || null,
          rut: p.rut || null,
          email: ped?.email_cliente || null,
          tipo_ticket: it.nombre_ticket || null,
          emitida_at: ped?.created_at || it.created_at || null,
        });
      });
    }
  } catch (e) { console.error('[sync-erp] cortesias:', e); }

  // ── 2) Check-ins de puerta ─────────────────────────────────
  try {
    const { data: usados } = await sb.from('qr_usados')
      .select('qr_id,pedido_id,created_at,escaneado_por,incidencia')
      .gte('created_at', desde).limit(1000);
    for (const u of (usados || [])) {
      if (!u.qr_id) continue;
      eventos.push({
        tipo: 'checkin', qr: u.qr_id,
        web_pedido_id: u.pedido_id || null,
        evento_web_id: null,   // se estampa abajo (por pedido_id → items_pedido.evento_id)
        checked_at: u.created_at || null,
        validador: u.escaneado_por || null,
        incidencia: u.incidencia || null,
      });
    }
  } catch (e) { console.error('[sync-erp] checkins:', e); }

  // ── 3) Ventas PAGADAS (no cortesía) → tipo 'venta' ─────────
  const ventas: any[] = [];
  try {
    const { data: items } = await sb.from('items_pedido')
      .select('evento_id,nombre_ticket,qr_ids,personas,precio_unitario,created_at,pedido_id,producto_tipo,pedidos!inner(id,metodo_pago,estado,nombre_cliente,email_cliente,total_pagado,created_at,fecha_pago)')
      // 🥤 Solo entradas. Un vaso no es una persona: si viaja, el ERP lo cuenta
      //    en el aforo de la noche y te deja un fantasma por cada vaso vendido.
      .or('producto_tipo.is.null,producto_tipo.eq.ticket')
      .neq('pedidos.metodo_pago', 'cortesia').eq('pedidos.estado', 'pagado')
      .gte('pedidos.created_at', desde).limit(1000);
    for (const it of ((items || []) as any[])) {
      const ped: any = Array.isArray(it.pedidos) ? it.pedidos[0] : it.pedidos;
      const qrs = Array.isArray(it.qr_ids) ? it.qr_ids : [];
      const pers = Array.isArray(it.personas) ? it.personas : [];
      qrs.forEach((qr: string, idx: number) => {
        if (!qr) return;
        const p: any = pers[idx] || {};
        ventas.push({
          tipo: 'venta', qr,
          web_pedido_id: it.pedido_id || ped?.id,
          evento_web_id: it.evento_id,
          nombre: p.nombre || ped?.nombre_cliente || null,
          rut: p.rut || null,
          email: ped?.email_cliente || null,
          tipo_ticket: it.nombre_ticket || null,
          monto: typeof it.precio_unitario === 'number' ? it.precio_unitario : null,
          metodo_pago: ped?.metodo_pago || null,
          vendida_at: ped?.fecha_pago || ped?.created_at || it.created_at || null,
        });
      });
    }
  } catch (e) { console.error('[sync-erp] ventas:', e); }

  // ── 3b) Estampar evento_web_id en los check-ins (por pedido_id → items_pedido.evento_id) ──
  //     El qr ya liga venta↔checkin; esto solo agrega la comodidad que pide el contrato del ERP.
  try {
    const pids = [...new Set(eventos.filter(e => e.tipo === 'checkin' && e.web_pedido_id != null).map(e => e.web_pedido_id))];
    if (pids.length) {
      const pedEv: Record<string, any> = {};
      // 🥤 De paso se juntan los QR que NO son de entrada (un vaso entregado en la
      //    barra, por ejemplo). Esos check-ins no viajan: para el ERP serían una
      //    persona más en el aforo de la noche.
      const qrNoEntrada = new Set<string>();
      for (let i = 0; i < pids.length; i += 200) {
        const { data } = await sb.from('items_pedido')
          .select('pedido_id,evento_id,qr_ids,producto_tipo').in('pedido_id', pids.slice(i, i + 200));
        (data || []).forEach((r: any) => {
          if (pedEv[r.pedido_id] == null && r.evento_id != null) pedEv[r.pedido_id] = r.evento_id;
          if (r.producto_tipo && r.producto_tipo !== 'ticket' && Array.isArray(r.qr_ids)) {
            r.qr_ids.forEach((q: string) => { if (q) qrNoEntrada.add(String(q)); });
          }
        });
      }
      if (qrNoEntrada.size) {
        for (let i = eventos.length - 1; i >= 0; i--) {
          const e = eventos[i];
          if (e.tipo === 'checkin' && e.qr && qrNoEntrada.has(String(e.qr))) eventos.splice(i, 1);
        }
      }
      for (const e of eventos) { if (e.tipo === 'checkin' && e.evento_web_id == null && e.web_pedido_id != null) e.evento_web_id = pedEv[e.web_pedido_id] ?? null; }
    }
  } catch (e) { console.error('[sync-erp] checkin evento:', e); }

  // ── 4) Totales por evento (snapshot en vivo: aforo + recaudado) ──
  const totales: any[] = [];
  try {
    const agg: Record<string, any> = {};
    const bump = (ev: any) => { const k = String(ev); if (!agg[k]) agg[k] = { evento_web_id: ev, entradas: 0, recaudado: 0, check_ins: 0 }; return agg[k]; };
    const qrEvento: Record<string, string> = {};
    // emitidas + recaudado (cortesías + ventas ya cargadas cubren la ventana)
    for (const e of [...eventos.filter((x: any) => x.tipo === 'cortesia_emitida'), ...ventas]) {
      if (e.evento_web_id == null) continue;
      const a = bump(e.evento_web_id); a.entradas += 1;
      if (e.qr) qrEvento[e.qr] = String(e.evento_web_id);
      if (typeof e.monto === 'number') a.recaudado += e.monto;
    }
    // check-ins por evento (via mapa qr→evento)
    for (const e of eventos) {
      if (e.tipo !== 'checkin' || !e.qr) continue;
      const ev = qrEvento[e.qr]; if (!ev || !agg[ev]) continue;
      agg[ev].check_ins += 1;
    }
    const snap = new Date().toISOString();
    // ── El desglose por origen, que pidió el ERP ──────────────
    // ⚠️ Y de paso arregla un conteo malo: `check_ins` se calculaba solo con
    //    los QR que aparecían en ESTA ventana de sincronización, así que un
    //    check-in cuya entrada se emitió el día anterior no se contaba nunca.
    //    La función de la base cuenta el evento COMPLETO.
    for (const k of Object.keys(agg)) {
      try {
        const { data: po } = await sb.rpc('evento_checkins_por_origen', { p_evento_id: parseInt(k) });
        if (po && typeof po === 'object') {
          agg[k].check_ins_por_origen = po;
          agg[k].check_ins = po.total ?? agg[k].check_ins;   // el completo manda
        }
      } catch (_) { /* sin la función todavía → va el conteo de siempre */ }
      // El desglose por tipo y sector, en el mismo snapshot.
      try {
        const { data: dg } = await sb.rpc('evento_desglose_listas', { p_evento_id: parseInt(k) });
        if (dg && typeof dg === 'object') {
          agg[k].listas_por_tipo   = dg.listas_por_tipo;
          agg[k].listas_por_sector = dg.listas_por_sector;
          agg[k].sin_emitir        = dg.sin_emitir;
        }
      } catch (_) { /* sin la función → el resto del snapshot va igual */ }
    }
    for (const k of Object.keys(agg)) totales.push({ tipo: 'totales', ...agg[k], snapshot_at: snap });
  } catch (e) { console.error('[sync-erp] totales:', e); }

  if (!eventos.length && !ventas.length && !totales.length) return json({ ok: true, nuevos: 0, enviados: 0 });

  // ── Helper: dedupe contra erp_sync_log + envío en lotes + log ──
  //    (checkin/cortesia/venta son idempotentes por QR)
  async function enviarConLog(lista: any[], refOf: (e: any) => string) {
    if (!lista.length) return { nuevos: 0, enviados: 0, fallidos: 0 };
    const refs = lista.map(refOf);
    const ya = new Set<string>();
    for (let i = 0; i < refs.length; i += 200) {
      const { data, error } = await sb.from('erp_sync_log').select('ref').in('ref', refs.slice(i, i + 200));
      if (error) throw error;   // sin la tabla no deduplicamos → abortar (evita duplicar en el ERP)
      (data || []).forEach((r: any) => ya.add(r.ref));
    }
    const pend = lista.filter(e => !ya.has(refOf(e)));
    let enviados = 0, fallidos = 0;
    for (let i = 0; i < pend.length; i += 50) {
      const lote = pend.slice(i, i + 50);
      const r = await enviarWebhookERP(lote);
      if (r.ok) {
        enviados += lote.length;
        try {
          await sb.from('erp_sync_log').upsert(lote.map(e => ({ ref: refOf(e), tipo: e.tipo, qr: e.qr || null })), { onConflict: 'ref' });
        } catch (e) { console.error('[sync-erp] log:', e); }
      } else {
        fallidos += lote.length;   // ERP no listo / tipo aún no aceptado / caído → se reintenta luego
      }
    }
    return { nuevos: pend.length, enviados, fallidos };
  }

  const res: any = {
    estables: { nuevos: 0, enviados: 0, fallidos: 0 },
    ventas:   { nuevos: 0, enviados: 0, fallidos: 0 },
    totales:  { enviados: 0, fallidos: 0 },
  };
  try {
    // 1) check-ins + cortesías (contrato ya probado por el ERP)
    res.estables = await enviarConLog(eventos, (e: any) => (e.tipo === 'checkin' ? 'checkin|' : 'cortesia|') + e.qr);
    // 2) ventas (tipo nuevo → lote APARTE; si el ERP aún no lo acepta se reintenta solo, sin tocar lo anterior)
    res.ventas   = await enviarConLog(ventas, (e: any) => 'venta|' + e.qr);
  } catch (e) {
    return json({ error: 'falta_tabla_erp_sync_log', detalle: String((e as any)?.message || e) }, 500);
  }
  // 3) totales (snapshot, sin dedupe; best-effort, lote propio)
  if (totales.length) {
    const r = await enviarWebhookERP(totales);
    if (r.ok) res.totales.enviados = totales.length; else res.totales.fallidos = totales.length;
  }

  const enviados = res.estables.enviados + res.ventas.enviados + res.totales.enviados;
  const nuevos   = res.estables.nuevos + res.ventas.nuevos;
  return json({ ok: true, nuevos, enviados, detalle: res });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
