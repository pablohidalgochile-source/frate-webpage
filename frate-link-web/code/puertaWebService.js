/**
 * puertaWebService — la puerta del ERP como LECTOR del QR de la web (contrato §2).
 * La web es la autoridad del QR; acá cacheamos el snapshot de la noche para validar
 * incluso SIN internet, y encolamos los quemados para sincronizar al reconectar.
 * Token canónico = qr_token (string 'FCC-…'), que es exactamente lo que codifica el QR.
 *
 * Online  → POST /api/crm-accion {accion:'validar_qr'} (proxy → web, quema real).
 * Offline → valida contra el snapshot cacheado + encola; al volter, flushCola() manda el lote.
 * Todo en localStorage (persiste offline). No toca la puerta local de FRATE LINK.
 */
const KSNAP = f => `frate_puerta_snap_${f}`
const KCOLA = f => `frate_puerta_cola_${f}`
export const getGateId = () => localStorage.getItem('frate_puerta_gate') || 'puerta-1'
export const setGateId = g => localStorage.setItem('frate_puerta_gate', g || 'puerta-1')

function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota */ } }

// Descarga y cachea el snapshot de la fecha (llamar al abrir la puerta / con internet).
export async function prefetchSnapshot(fecha) {
  try {
    const r = await fetch(`/api/crm-accion?snapshot_qr&fecha=${encodeURIComponent(fecha)}`)
    const j = await r.json()
    if (!r.ok || !Array.isArray(j.qrs)) return { ok: false, error: j.error || `HTTP ${r.status}` }
    const map = {}
    for (const q of j.qrs) if (q && q.qr_token) map[q.qr_token] = { ...q }
    write(KSNAP(fecha), { fecha, generado_ts: j.generado_ts || null, bajado_ts: new Date().toISOString(), qrs: map })
    return { ok: true, count: j.qrs.length }
  } catch (e) { return { ok: false, error: e.message } }
}

export function snapshotInfo(fecha) {
  const s = read(KSNAP(fecha))
  if (!s) return null
  const qrs = Object.values(s.qrs || {})
  return { bajado_ts: s.bajado_ts, total: qrs.length, usados: qrs.filter(q => q.ya_usado).length, pendientes: (read(KCOLA(fecha)) || []).length }
}

// Valida (y quema) un qr_token. Online usa la web; offline usa el cache + encola.
export async function validarQr(qr_token, fecha) {
  const token = (qr_token || '').trim()
  if (!token) return { ok: false, error: 'falta_qr_token' }
  const gate_id = getGateId()
  const ts = new Date().toISOString()

  if (navigator.onLine) {
    try {
      const r = await fetch('/api/crm-accion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'validar_qr', payload: { qr_token: token, gate_id, ts } }),
      })
      const j = await r.json()
      const web = (j.resultados && j.resultados[0]) || j   // proxy envuelve single en resultados? tomamos ambos
      // reflejar en cache si lo tenemos
      const snap = read(KSNAP(fecha))
      if (snap && snap.qrs[token]) { snap.qrs[token].ya_usado = true; snap.qrs[token].usado_ts = web.primera_vez_ts || ts; write(KSNAP(fecha), snap) }
      if (web && web.ok === false) return { ok: false, error: web.error || 'rechazado', qr_token: token }
      const persona = snap && snap.qrs[token] ? snap.qrs[token] : null
      return { ok: true, qr_token: token, ya_usado: !!web.ya_usado, primera_vez_ts: web.primera_vez_ts || null, persona, online: true }
    } catch (e) {
      // cae a offline si la red falla en medio
      return validarOffline(token, fecha, gate_id, ts, 'red_falló_' )
    }
  }
  return validarOffline(token, fecha, gate_id, ts)
}

function validarOffline(token, fecha, gate_id, ts) {
  const snap = read(KSNAP(fecha))
  if (!snap || !snap.qrs) return { ok: false, error: 'sin_snapshot_offline', qr_token: token, offline: true }
  const q = snap.qrs[token]
  if (!q) return { ok: false, error: 'qr_no_existe', qr_token: token, offline: true }
  const yaUsado = !!q.ya_usado
  if (!yaUsado) {
    q.ya_usado = true; q.usado_ts = ts; q.gate_id = gate_id; write(KSNAP(fecha), snap)
    const cola = read(KCOLA(fecha)) || []; cola.push({ qr_token: token, gate_id, ts }); write(KCOLA(fecha), cola)
  }
  return { ok: true, qr_token: token, ya_usado: yaUsado, primera_vez_ts: q.usado_ts || ts, persona: q, offline: true }
}

// Sincroniza la cola de quemados offline (llamar al reconectar).
export async function flushCola(fecha) {
  const cola = read(KCOLA(fecha)) || []
  if (!cola.length) return { ok: true, enviados: 0 }
  if (!navigator.onLine) return { ok: false, error: 'sin_conexion', pendientes: cola.length }
  try {
    const lote = cola.map(c => ({ accion: 'validar_qr', payload: c }))
    const r = await fetch('/api/crm-accion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lote),
    })
    const j = await r.json()
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}`, pendientes: cola.length }
    write(KCOLA(fecha), [])   // la web deduplica por qr_token; reenviar es seguro
    return { ok: true, enviados: cola.length, resultados: j.resultados || null }
  } catch (e) { return { ok: false, error: e.message, pendientes: cola.length } }
}
