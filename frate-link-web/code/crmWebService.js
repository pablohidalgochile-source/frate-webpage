/**
 * crmWebService — lado cliente del puente CRM web (frate.cl) ↔ ERP.
 * Lee las solicitudes espejadas (frate.lista_links / frate.invitaciones con web_tipo)
 * y dispara acciones vía el proxy server-side /api/crm-accion (la llave vive en Vercel).
 * Contrato: ARQUITECTURA-CRM-ERP.md v2 + ARQUITECTURA-CRM-WEB.md + RESPUESTAS-CRM-ERP.md.
 * Requiere SQL_FASE_129.
 */
import { supabase } from './supabase'

const frateDB = () => supabase.schema('frate')

export const ESTADO_WEB = {
  pendiente:  { lbl: 'PENDIENTE',  color: 'var(--gold2, #d4af37)' },
  confirmada: { lbl: 'CONFIRMADA', color: 'var(--green, #2ecc71)' },
  aprobada:   { lbl: 'APROBADA',   color: 'var(--green, #2ecc71)' },
  rechazada:  { lbl: 'RECHAZADA',  color: 'var(--red, #e74c3c)' },
  cancelada:  { lbl: 'CANCELADA',  color: 'var(--muted, #888)' },
}
export const ESTADO_INSCRITO = {
  pendiente_revision: { lbl: 'PENDIENTE', color: 'var(--gold2, #d4af37)' },
  aprobado:           { lbl: 'APROBADO ✓', color: 'var(--green, #2ecc71)' },
  rechazado:          { lbl: 'RECHAZADO ✕', color: 'var(--red, #e74c3c)' },
}

// ── Carga de la bandeja ──────────────────────────────────────────────────────
export async function loadSolicitudesWeb() {
  const [linksR, invsR, rrppR] = await Promise.all([
    frateDB().from('lista_links').select('*').not('web_tipo', 'is', null).order('fecha', { ascending: false }).limit(400),
    frateDB().from('invitaciones').select('*').not('web_tipo', 'is', null).order('created_at', { ascending: false }).limit(2000),
    frateDB().from('rrpp').select('*').then(r => r, () => ({ data: [] })),
  ])
  const links = linksR.data || []
  const invs = invsR.data || []
  const rrppCat = rrppR.data || []

  const linkIds = links.map(l => l.lista_link_id)
  let reqB = [], reqR = []
  if (linkIds.length) {
    const [b, r] = await Promise.all([
      frateDB().from('birthday_requests').select('*').in('lista_link_id', linkIds),
      frateDB().from('reservation_requests').select('*').in('lista_link_id', linkIds),
    ])
    reqB = b.data || []; reqR = r.data || []
  }
  const reqDe = id => reqB.find(x => x.lista_link_id === id) || reqR.find(x => x.lista_link_id === id) || null

  const reservas = links.filter(l => l.web_tipo === 'reserva').map(l => ({ ...l, req: reqDe(l.lista_link_id) }))
  const cumples = links.filter(l => l.web_tipo === 'cumpleanos').map(l => ({ ...l, req: reqDe(l.lista_link_id) }))
  const listas = links.filter(l => l.web_tipo === 'lista').map(l => ({
    ...l,
    inscritos: invs.filter(i => i.web_tipo === 'lista' && i.lista_link_id === l.lista_link_id),
  }))
  const rrpp = invs.filter(i => i.web_tipo === 'invitacion_rrpp')
  const futuras = [...reservas, ...cumples, ...listas].filter(x => !x.evento_operativo_id).length

  return { reservas, cumples, listas, rrpp, rrppCat, futuras }
}

// ── Acciones / sincronización vía proxy server-side ─────────────────────────
async function api(url, opts) {
  try {
    const r = await fetch(url, opts)
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.ok === false) return { ok: false, error: j.error || `HTTP ${r.status}`, ...j }
    return { ok: true, ...j }
  } catch (e) { return { ok: false, error: e.message } }
}

export function accionCRM(accion, payload, actor) {
  return api('/api/crm-accion', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, payload, actor: actor || 'erp' }),
  })
}
export const sincronizarCRM = () => api('/api/crm-accion?sincronizar=1')
export const sincronizarRRPP = () => api('/api/crm-accion?catalogo=rrpp')
export const checkinsCRM = (fecha) => api(`/api/crm-accion?checkins&fecha=${encodeURIComponent(fecha || '')}`)

// ── util visual ──────────────────────────────────────────────────────────────
export function fmtFechaCorta(f) {
  if (!f) return '—'
  const [y, m, d] = String(f).split('-')
  return d ? `${d}-${m}-${y}` : String(f)
}
export const clp = n => '$' + (parseInt(n) || 0).toLocaleString('es-CL')
