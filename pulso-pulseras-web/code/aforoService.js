/**
 * aforoService — Aforo + pulseras en vivo (FASE 110). Fuente única en Supabase,
 * incrementos ATÓMICOS por RPC (varios dispositivos sin perder cuentas).
 */
import { supabase } from './supabase'
import { hoyChile, ayerChile, esMadrugadaChile } from './fechaChile'

// El ÚNICO evento ABIERTO de la app (estado abierto/activo), SIN importar la fecha.
// Regla: solo puede haber 1 abierto. Si su fecha+ventana ya pasó, sigue siendo el
// activo pero marca fueraDeHorario=true (el Pulso solo avisa, no lo abandona).
export async function findEventoActivo() {
  try {
    const sel = 'id, nombre, fecha, hora_inicio, hora_fin, estado, conteos_data'
    const { data } = await supabase.from('eventos_operativos')
      .select(sel).in('estado', ['abierto', 'activo']).order('fecha', { ascending: false }).limit(1)
    const ev = (data || [])[0]
    if (!ev) return null
    const vigente = esMadrugadaChile() ? ayerChile() : hoyChile()
    const fueraDeHorario = !!(ev.fecha && ev.fecha < vigente)
    return { id: ev.id, nombre: ev.nombre, fecha: ev.fecha, hora_inicio: ev.hora_inicio, hora_fin: ev.hora_fin, fueraDeHorario, pulseras: pulserasDeEvento(ev) }
  } catch { return null }
}

// Colores de pulsera del día desde la config sincronizada (app_config) — fuente
// única para admin y staff de ingreso en cualquier dispositivo.
export async function loadColoresDia() {
  try {
    const m = await import('./syncService')
    const p = await m.loadPulserasRemoto()
    return (p?.colores || []).map(c => typeof c === 'string' ? c : (c.nombre || c.label)).filter(Boolean)
  } catch { return [] }
}

// Extrae las pulseras del día desde conteos_data. Modelo:
//  inicial = entregada inicial (planificación) · extra = entregadas extra durante
//  la noche (solo admin) · total = inicial + extra (disponible a entregar).
//  utilizadas (las que el público usó) viven en aforo_live; quedan = total − utilizadas.
function pulserasDeEvento(ev) {
  const arr = ev?.conteos_data?.pulseras
  if (!Array.isArray(arr)) return []
  const seen = new Set(); const out = []
  arr.forEach(p => {
    const c = (p.color || '').toString()
    if (c && !seen.has(c)) {
      seen.add(c)
      // inicial: campo nuevo; fallback a 'cantidad'/'entregadas' por datos viejos
      const inicial = parseInt(p.inicial ?? p.cantidad ?? p.entregadas) || 0
      const extra = parseInt(p.extra) || 0
      out.push({ color: c, tipo: p.tipo || '', inicial, extra, total: inicial + extra })
    }
  })
  return out
}

// Carga la pulsera/aforo de un evento (crea la fila si falta vía RPC con 0).
export async function loadAforo(eventoId) {
  if (!eventoId) return null
  try {
    const { data } = await supabase.from('aforo_live').select('*').eq('evento_id', eventoId).maybeSingle()
    if (data) return data
    // crear con incremento 0
    const { data: nuevo } = await supabase.rpc('incrementar_aforo', { p_evento: eventoId, p_aforo: 0 })
    return Array.isArray(nuevo) ? nuevo[0] : nuevo
  } catch { return null }
}

// Incremento atómico de aforo (personas).
export async function incAforo(eventoId, delta) {
  try {
    const { data, error } = await supabase.rpc('incrementar_aforo', { p_evento: eventoId, p_aforo: delta })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (err) { console.error('[incAforo]', err.message); return null }
}

// Incremento atómico de una pulsera por color (sin tocar aforo).
export async function incPulsera(eventoId, color, delta) {
  try {
    const { data, error } = await supabase.rpc('incrementar_aforo', { p_evento: eventoId, p_aforo: 0, p_pulsera: color, p_delta: delta })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (err) { console.error('[incPulsera]', err.message); return null }
}

// ENTREGAR una pulsera = una persona que entra: descuenta del stock de ese color
// Y suma al aforo, en UN solo paso atómico (el RPC mueve ambos a la vez). delta
// negativo = deshacer (devuelve la pulsera y resta del aforo).
export async function darPulsera(eventoId, color, delta) {
  try {
    const { data, error } = await supabase.rpc('incrementar_aforo', { p_evento: eventoId, p_aforo: delta, p_pulsera: color, p_delta: delta })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (err) { console.error('[darPulsera]', err.message); return null }
}

export async function setCapacidad(eventoId, cap) {
  try {
    const { data, error } = await supabase.rpc('set_capacidad_aforo', { p_evento: eventoId, p_cap: parseInt(cap) || 0 })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (err) { console.error('[setCapacidad]', err.message); return null }
}

export function subscribeAforo(eventoId, onChange) {
  if (!eventoId) return () => {}
  const ch = supabase.channel('aforo-' + eventoId + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aforo_live', filter: `evento_id=eq.${eventoId}` },
      payload => { try { onChange(payload.new) } catch {} })
    .subscribe()
  return () => { try { supabase.removeChannel(ch) } catch {} }
}

// Total de pulseras entregadas (suma del jsonb)
export function totalPulseras(pulserasObj) {
  if (!pulserasObj) return 0
  return Object.values(pulserasObj).reduce((s, n) => s + (parseInt(n) || 0), 0)
}

// Resumen EN VIVO para el Pulso: staff (llegaron/break/faltan) + reservas/cumples.
export async function loadResumenVivo(eventoId) {
  if (!eventoId) return null
  try {
    const [{ data: staff }, { data: ev }] = await Promise.all([
      supabase.from('evento_staff').select('estado_asistencia, estado_invitacion').eq('evento_id', eventoId).not('personal_id', 'is', null),
      supabase.from('eventos_operativos').select('conteos_data').eq('id', eventoId).maybeSingle(),
    ])
    const roster = (staff || []).filter(s => ['aceptado', 'convocado', 'disponible'].includes(s.estado_invitacion))
    const llegaron = roster.filter(s => ['presente', 'en_colacion', 'finalizado'].includes(s.estado_asistencia)).length
    const enBreak = roster.filter(s => s.estado_asistencia === 'en_colacion').length
    const finalizados = roster.filter(s => s.estado_asistencia === 'finalizado').length
    const cd = ev?.conteos_data || {}
    return {
      staff: { total: roster.length, llegaron, enBreak, finalizados, pendientes: roster.length - llegaron },
      cumples: Array.isArray(cd.cumples) ? cd.cumples.length : 0,
      reservas: Array.isArray(cd.reservas) ? cd.reservas.length : 0,
    }
  } catch { return null }
}
