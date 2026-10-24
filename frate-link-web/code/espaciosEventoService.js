/**
 * espaciosEventoService — Administración por evento de los espacios del mapa (FASE 111).
 * La estructura del plano vive en Config (floorplans); aquí solo el estado por evento.
 */
import { supabase } from './supabase'

export const ESTADOS_ESPACIO = {
  libre:     { label: 'Libre',      color: '#3b8bd4' },
  reservado: { label: 'Reservado',  color: '#9b59b6' },
  cumple:    { label: 'Cumpleaños', color: '#f0c84a' },
  ocupado:   { label: 'Ocupado',    color: '#2ecc71' },
  bloqueado: { label: 'Bloqueado',  color: '#e8363d' },
}

export async function loadAsignaciones(eventoId) {
  if (!eventoId) return []
  try {
    const { data } = await supabase.from('evento_espacios').select('*').eq('evento_id', eventoId)
    return data || []
  } catch { return [] }
}

// Crea o actualiza la asignación de un espacio en un evento (upsert por evento+space).
export async function setAsignacion(eventoId, spaceId, campos) {
  if (!eventoId || !spaceId) return { ok: false }
  const row = {
    evento_id: eventoId, space_id: spaceId,
    estado: campos.estado || 'libre',
    titular: (campos.titular || '').trim() || null,
    personas: campos.personas ? parseInt(campos.personas) : null,
    monto: campos.monto ? parseInt(campos.monto) : null,
    nota: (campos.nota || '').trim() || null,
    lista_link_id: campos.lista_link_id || null,
    updated_at: new Date().toISOString(),
  }
  try {
    const { data, error } = await supabase.from('evento_espacios')
      .upsert(row, { onConflict: 'evento_id,space_id' }).select('*').single()
    if (error) throw error
    return { ok: true, data }
  } catch (err) { return { ok: false, error: err.message } }
}

// Liberar = volver a libre (borra la fila para mantener limpio).
export async function clearAsignacion(eventoId, spaceId) {
  try { await supabase.from('evento_espacios').delete().eq('evento_id', eventoId).eq('space_id', spaceId); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
}

export function subscribeAsignaciones(eventoId, onChange) {
  if (!eventoId) return () => {}
  const ch = supabase.channel('evesp-' + eventoId + '-' + Math.random().toString(36).slice(2, 8))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evento_espacios', filter: `evento_id=eq.${eventoId}` },
      payload => { try { onChange(payload) } catch {} })
    .subscribe()
  return () => { try { supabase.removeChannel(ch) } catch {} }
}
