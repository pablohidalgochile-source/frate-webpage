/**
 * frateLinkService — FRATE LINK Fase 1.
 * Links auto-servicio de listas: eventos de planificación, links con cupos,
 * y entries (que viven en frate.invitaciones para alimentar el CRM).
 */
import { supabase } from './supabase'

const frateDB = () => supabase.schema('frate')

// Botón de pago hospedado de WebPay (form-pay). Confirmación manual en el MVP.
export const WEBPAY_URL = 'https://www.webpay.cl/form-pay/224478'

// Configuración de campos por defecto (Fase 2). nombre siempre obligatorio.
export const FORM_DEFAULT = { rut: 'opcional', email: 'opcional', telefono: 'oculto', instagram: 'oculto', apodo: 'opcional', rol: 'oculto', productor: 'oculto', nacionalidad: 'oculto' }
export const FORM_CAMPOS = [
  { k: 'rut', lbl: 'RUT / Documento' }, { k: 'email', lbl: 'Email' }, { k: 'telefono', lbl: 'Teléfono' },
  { k: 'instagram', lbl: 'Instagram' }, { k: 'apodo', lbl: 'Apodo / nombre artístico' },
  { k: 'rol', lbl: 'Rol' }, { k: 'productor', lbl: 'Productor asociado' }, { k: 'nacionalidad', lbl: 'Nacionalidad' },
]

// ── Tipos de módulo configurables (Editor de Tipos) ─────────────────────────
// Cada tipo: key, nombre, emoji, color, activo, orden, especial (birthday/
// reservation/null para coordinación dedicada), form_config, flags.
export const DEFAULT_LINK_TIPOS = [
  { key: 'guest_list',  nombre: 'Lista',      emoji: '🎫', color: '#9b9b9b', activo: true, orden: 1, especial: null,         form_config: { ...FORM_DEFAULT }, requires_manual_approval: true,  allow_incomplete_data: false, allow_space_selection: false },
  { key: 'birthday',    nombre: 'Cumple',     emoji: '🎂', color: '#e91e63', activo: true, orden: 2, especial: 'birthday',    form_config: { ...FORM_DEFAULT }, requires_manual_approval: true,  allow_incomplete_data: false, allow_space_selection: false },
  { key: 'reservation', nombre: 'Reserva',    emoji: '🍾', color: '#9b59b6', activo: true, orden: 3, especial: 'reservation', form_config: { rut: 'opcional', email: 'opcional', telefono: 'obligatorio', instagram: 'oculto', apodo: 'oculto', rol: 'oculto', productor: 'oculto', nacionalidad: 'oculto' }, requires_manual_approval: true, allow_incomplete_data: false, allow_space_selection: false },
  { key: 'artist',      nombre: 'Artista',    emoji: '🎤', color: '#3b8bd4', activo: true, orden: 4, especial: null,         form_config: { rut: 'opcional', email: 'opcional', telefono: 'opcional', instagram: 'opcional', apodo: 'obligatorio', rol: 'obligatorio', productor: 'opcional', nacionalidad: 'opcional' }, requires_manual_approval: true, allow_incomplete_data: true, allow_space_selection: false },
  { key: 'production',  nombre: 'Producción', emoji: '🎬', color: '#e67e22', activo: true, orden: 5, especial: null,         form_config: { rut: 'opcional', email: 'oculto', telefono: 'opcional', instagram: 'oculto', apodo: 'opcional', rol: 'obligatorio', productor: 'obligatorio', nacionalidad: 'oculto' }, requires_manual_approval: true, allow_incomplete_data: true, allow_space_selection: false },
]

export async function loadLinkTipos() {
  try {
    const { data } = await supabase.from('app_config').select('link_tipos_config').eq('id', 1).maybeSingle()
    const cfg = data?.link_tipos_config
    return (Array.isArray(cfg) && cfg.length) ? cfg : DEFAULT_LINK_TIPOS
  } catch (err) { console.error('[loadLinkTipos]', err); return DEFAULT_LINK_TIPOS }
}
export async function saveLinkTipos(tipos) {
  try {
    if (!Array.isArray(tipos)) return { ok: false, error: 'tipos inválidos' }
    const { error } = await supabase.from('app_config').update({ link_tipos_config: tipos }).eq('id', 1)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// Presets por tipo de link (campos + flags). El admin puede ajustar después.
export const LINK_TYPE_PRESETS = {
  guest_list: { form_config: { ...FORM_DEFAULT }, requires_manual_approval: true, allow_incomplete_data: false },
  artist:     { form_config: { rut: 'opcional', email: 'opcional', telefono: 'opcional', instagram: 'opcional', apodo: 'obligatorio', rol: 'obligatorio', productor: 'opcional', nacionalidad: 'opcional' }, requires_manual_approval: true, allow_incomplete_data: true },
  production: { form_config: { rut: 'opcional', email: 'oculto', telefono: 'opcional', instagram: 'oculto', apodo: 'opcional', rol: 'obligatorio', productor: 'obligatorio', nacionalidad: 'oculto' }, requires_manual_approval: true, allow_incomplete_data: true },
  reservation: { form_config: { rut: 'opcional', email: 'opcional', telefono: 'obligatorio', instagram: 'oculto', apodo: 'oculto', rol: 'oculto', productor: 'oculto', nacionalidad: 'oculto' }, requires_manual_approval: true, allow_incomplete_data: false },
}

// Token seguro, largo y no adivinable
function genToken() {
  const a = new Uint8Array(16)
  ;(window.crypto || window.msCrypto).getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}
function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}
function normNombre(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

// ── Eventos de planificación ────────────────────────────────────────────────
export async function loadLinkEventos() {
  const { data, error } = await frateDB().from('link_eventos').select('*').order('created_at', { ascending: false })
  if (error) { console.error('[loadLinkEventos]', error); return [] }
  return data || []
}
export async function createLinkEvento({ nombre, fecha_estimada = null, tipo = 'fiesta', notas = null }) {
  try {
    if (!nombre?.trim()) return { ok: false, error: 'Falta el nombre del evento' }
    const { data, error } = await frateDB().from('link_eventos')
      .insert({ nombre: nombre.trim(), fecha_estimada, tipo, notas }).select('*').single()
    if (error) throw error
    return { ok: true, row: data }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function updateLinkEvento(id, campos) {
  try {
    const { error } = await frateDB().from('link_eventos').update({ ...campos, updated_at: new Date().toISOString() }).eq('link_evento_id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── Links ───────────────────────────────────────────────────────────────────
export async function createListaLink(data) {
  try {
    const token = genToken()
    // Si habilita selección de espacio sin floorplan, usa el croquis por defecto
    if (data.allow_space_selection && !data.floorplan_id) {
      const fp = await getOrCreateDefaultFloorplan()
      if (fp) data.floorplan_id = fp.floorplan_id
    }
    const payload = {
      token,
      slug: slugify(data.inviter_nombre || data.benefit_text || 'lista'),
      link_evento_id: data.link_evento_id || null,
      fecha: data.fecha || null,
      evento_operativo_id: data.evento_operativo_id || null,
      cantidad_personas: parseInt(data.cantidad_personas) || null,
      monto_servicio: parseInt(data.monto_servicio) || null,
      estado_pago: (parseInt(data.monto_servicio) || 0) > 0 ? 'pendiente' : 'sin_cobro',
      webpay_url: (parseInt(data.monto_servicio) || 0) > 0 ? (data.webpay_url || WEBPAY_URL) : null,
      link_type: data.link_type || 'guest_list',
      categoria_id: data.categoria_id || null,
      inviter_nombre: data.inviter_nombre?.trim() || null,
      benefit_text: data.benefit_text?.trim() || null,
      cover_amount: parseInt(data.cover_amount) || null,
      max_cupos: parseInt(data.max_cupos) || 50,
      requires_manual_approval: data.requires_manual_approval !== false,
      allow_incomplete_data: !!data.allow_incomplete_data,
      form_config: data.form_config || FORM_DEFAULT,
      allow_space_selection: !!data.allow_space_selection,
      floorplan_id: data.floorplan_id || null,
      closes_at: data.closes_at || null,
      status: 'abierto',
      notes: data.notes?.trim() || null,
      created_by: data.created_by || null,
    }
    const { data: row, error } = await frateDB().from('lista_links').insert(payload).select('*').single()
    if (error) throw error
    return { ok: true, row }
  } catch (err) { return { ok: false, error: err.message } }
}

// Lista de eventos operativos del ERP (para enlazar listas)
export async function loadEventosOperativos() {
  try {
    const { data } = await supabase.from('eventos_operativos').select('id, nombre, fecha').order('fecha', { ascending: false }).limit(200)
    return data || []
  } catch (err) { console.error('[loadEventosOperativos]', err); return [] }
}

// Lista de links con conteo de cupos usados (entries no rechazadas) + nombre del evento operativo
export async function loadListaLinks(linkEventoId = null) {
  try {
    let q = frateDB().from('lista_links').select('*')
      .order('fecha', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    if (linkEventoId) q = q.eq('link_evento_id', linkEventoId)
    const { data: links, error } = await q
    if (error) throw error
    // Resolver nombres de eventos operativos enlazados
    const evIds = [...new Set((links || []).map(l => l.evento_operativo_id).filter(Boolean))]
    let evMap = {}
    if (evIds.length) {
      const { data: evs } = await supabase.from('eventos_operativos').select('id, nombre, fecha').in('id', evIds)
      evMap = Object.fromEntries((evs || []).map(e => [e.id, e]))
    }
    // Conteo de entries por link (en paralelo)
    const conConteo = await Promise.all((links || []).map(async (l) => {
      const { count: total } = await frateDB().from('invitaciones').select('*', { count: 'exact', head: true }).eq('lista_link_id', l.lista_link_id).neq('estado_lista', 'rechazado')
      const { count: aprob } = await frateDB().from('invitaciones').select('*', { count: 'exact', head: true }).eq('lista_link_id', l.lista_link_id).eq('estado_lista', 'aprobado')
      const { count: pend } = await frateDB().from('invitaciones').select('*', { count: 'exact', head: true }).eq('lista_link_id', l.lista_link_id).eq('estado_lista', 'pendiente_revision')
      return { ...l, used_cupos: total || 0, aprobados: aprob || 0, pendientes: pend || 0, evento_operativo: evMap[l.evento_operativo_id] || null }
    }))
    return conConteo
  } catch (err) { console.error('[loadListaLinks]', err); return [] }
}

// ── Reservas (tipo especializado) ───────────────────────────────────────────
export async function createReservationLink(linkData, reservationData) {
  try {
    const r = await createListaLink({ ...linkData, link_type: 'reservation' })
    if (!r.ok) return r
    const payload = {
      lista_link_id: r.row.lista_link_id,
      ...reservationData,
      party_size: parseInt(reservationData.party_size) || null,
      consumo_minimo: parseInt(reservationData.consumo_minimo) || null,
      abono: parseInt(reservationData.abono) || null,
      presupuesto: parseInt(reservationData.presupuesto) || null,
    }
    const { data, error } = await frateDB().from('reservation_requests').insert(payload).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, link: r.row, reservation: data }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function loadReservationRequest(listaLinkId) {
  const { data } = await frateDB().from('reservation_requests').select('*').eq('lista_link_id', listaLinkId).maybeSingle()
  return data || null
}
export async function updateReservationRequest(reservationId, campos) {
  try {
    const norm = { ...campos }
    ;['party_size', 'consumo_minimo', 'abono', 'presupuesto'].forEach(k => { if (k in norm) norm[k] = parseInt(norm[k]) || null })
    const { error } = await frateDB().from('reservation_requests').update({ ...norm, updated_at: new Date().toISOString() }).eq('reservation_id', reservationId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── Cumpleaños (Fase 3) ─────────────────────────────────────────────────────
export async function createBirthdayLink(linkData, birthdayData) {
  try {
    const r = await createListaLink({ ...linkData, link_type: 'birthday' })
    if (!r.ok) return r
    const payload = {
      lista_link_id: r.row.lista_link_id,
      link_evento_id: linkData.link_evento_id || null,
      ...birthdayData,
      estimated_guests: parseInt(birthdayData.estimated_guests) || null,
      cover_birthday: parseInt(birthdayData.cover_birthday) || null,
      cover_guests: parseInt(birthdayData.cover_guests) || null,
      presupuesto: parseInt(birthdayData.presupuesto) || null,
    }
    const { data, error } = await frateDB().from('birthday_requests').insert(payload).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, link: r.row, birthday: data }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function loadBirthdayRequest(listaLinkId) {
  const { data } = await frateDB().from('birthday_requests').select('*').eq('lista_link_id', listaLinkId).maybeSingle()
  return data || null
}
export async function updateBirthdayRequest(birthdayId, campos) {
  try {
    const norm = { ...campos }
    ;['estimated_guests', 'cover_birthday', 'cover_guests', 'presupuesto'].forEach(k => {
      if (k in norm) norm[k] = parseInt(norm[k]) || null
    })
    const { error } = await frateDB().from('birthday_requests').update({ ...norm, updated_at: new Date().toISOString() }).eq('birthday_id', birthdayId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

export async function updateListaLink(id, campos) {
  try {
    const { error } = await frateDB().from('lista_links').update({ ...campos, updated_at: new Date().toISOString() }).eq('lista_link_id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function deleteListaLink(id) {
  try {
    const { error } = await frateDB().from('lista_links').delete().eq('lista_link_id', id)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── Vista pública: cargar link por token (con evento y categoría) ───────────
export async function getListaLinkByToken(token) {
  try {
    const { data: link, error } = await frateDB().from('lista_links').select('*').eq('token', token).maybeSingle()
    if (error) throw error
    if (!link) return { ok: false, error: 'Link no encontrado' }
    let evento = null, categoria = null
    if (link.link_evento_id) {
      const { data } = await frateDB().from('link_eventos').select('*').eq('link_evento_id', link.link_evento_id).maybeSingle()
      evento = data || null
    }
    if (link.categoria_id) {
      const { data } = await frateDB().from('categorias_acceso').select('*').eq('categoria_id', link.categoria_id).maybeSingle()
      categoria = data || null
    }
    const { count } = await frateDB().from('invitaciones').select('*', { count: 'exact', head: true }).eq('lista_link_id', link.lista_link_id).neq('estado_lista', 'rechazado')
    let birthday = null, reservation = null
    if (link.link_type === 'birthday') {
      const { data } = await frateDB().from('birthday_requests').select('*').eq('lista_link_id', link.lista_link_id).maybeSingle()
      birthday = data || null
    }
    if (link.link_type === 'reservation') {
      const { data } = await frateDB().from('reservation_requests').select('*').eq('lista_link_id', link.lista_link_id).maybeSingle()
      reservation = data || null
    }
    let floorplan = null, spaces = []
    if (link.allow_space_selection && link.floorplan_id) {
      const { data: fp } = await frateDB().from('floorplans').select('*').eq('floorplan_id', link.floorplan_id).maybeSingle()
      floorplan = fp || null
      const { data: sp } = await frateDB().from('floorplan_spaces').select('*').eq('floorplan_id', link.floorplan_id).order('orden')
      spaces = sp || []
    }
    return { ok: true, link, evento, categoria, birthday, reservation, floorplan, spaces, used_cupos: count || 0 }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── Vista pública: registrar una persona en el link ─────────────────────────
export async function submitEntryToLink(token, entry) {
  try {
    const r = await getListaLinkByToken(token)
    if (!r.ok) return r
    const { link, used_cupos } = r
    if (link.status !== 'abierto') return { ok: false, error: 'Esta lista está cerrada' }
    if (link.closes_at && new Date(link.closes_at) < new Date()) return { ok: false, error: 'Esta lista ya cerró' }
    if (used_cupos >= link.max_cupos) return { ok: false, error: 'No quedan cupos disponibles' }

    const nombre = (entry.nombre || '').trim()
    if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }

    // Validar campos obligatorios según form_config del link (Fase 2)
    const cfg = link.form_config || FORM_DEFAULT
    const valor = { rut: entry.rut, email: entry.email, telefono: entry.telefono, instagram: entry.instagram, apodo: entry.nickname, rol: entry.rol, productor: entry.productor, nacionalidad: entry.nacionalidad }
    for (const [campo, regla] of Object.entries(cfg)) {
      if (regla === 'obligatorio' && !((valor[campo] || '').trim())) {
        return { ok: false, error: `Falta un campo obligatorio: ${campo}` }
      }
    }

    // Calidad de dato según lo recibido
    const tieneRut = !!(entry.rut || '').trim()
    const tieneEmail = !!(entry.email || '').trim()
    const data_quality = (tieneRut && tieneEmail) ? 'completa' : (tieneRut || tieneEmail) ? 'parcial' : 'minima'
    const autoAprobado = !link.requires_manual_approval

    const payload = {
      invitacion_id: genTokenUUID(),
      lista_link_id: link.lista_link_id,
      nombre_en_lista: nombre.toUpperCase(),
      rut_en_lista: (entry.rut || '').trim() || null,
      email_en_lista: (entry.email || '').trim().toLowerCase() || null,
      nickname_en_lista: (entry.nickname || '').trim() || null,
      telefono_en_lista: (entry.telefono || '').trim() || null,
      instagram_en_lista: (entry.instagram || '').trim() || null,
      tipo_acceso: link.link_type,
      source_mode: entry.source_mode || 'guest_self_register',
      data_quality,
      estado_lista: autoAprobado ? 'aprobado' : 'pendiente_revision',
      estado_ingreso: 'pendiente_importado',
      qr_token: autoAprobado ? genToken() : null,   // si se auto-aprueba ya tiene QR
      espacio_id: entry.espacio_id || null,
      espacio_nombre: entry.espacio_nombre || null,
      rol_lista: (entry.rol || '').trim() || null,
      productor_asociado: (entry.productor || '').trim() || null,
      nacionalidad: (entry.nacionalidad || '').trim() || null,
    }
    const { error } = await frateDB().from('invitaciones').insert(payload)
    if (error) throw error
    // Si se auto-aprobó (confirmado) → agregar/vincular en el CRM maestro
    if (autoAprobado) { try { await upsertPersonaDesdeEntry(payload.invitacion_id) } catch {} }
    return { ok: true, estado: payload.estado_lista, qr_token: payload.qr_token }
  } catch (err) { return { ok: false, error: err.message } }
}

function genTokenUUID() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16)
  })
}

// ── Croquis / floorplan (Fase 4) ────────────────────────────────────────────
export async function getOrCreateDefaultFloorplan() {
  try {
    const { data: existentes } = await frateDB().from('floorplans').select('*').order('created_at').limit(1)
    if (existentes && existentes.length) return existentes[0]
    const { data, error } = await frateDB().from('floorplans').insert({ nombre: 'Croquis principal', is_default: true }).select('*').single()
    if (error) throw error
    return data
  } catch (err) { console.error('[getOrCreateDefaultFloorplan]', err); return null }
}
export async function loadSpaces(floorplanId) {
  const { data, error } = await frateDB().from('floorplan_spaces').select('*').eq('floorplan_id', floorplanId).order('orden')
  if (error) { console.error('[loadSpaces]', error); return [] }
  return data || []
}
export async function createSpace(floorplanId, data = {}) {
  try {
    const { data: row, error } = await frateDB().from('floorplan_spaces')
      .insert({ floorplan_id: floorplanId, nombre: data.nombre || 'Nuevo', ...data }).select('*').single()
    if (error) throw error
    return { ok: true, row }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function updateSpace(spaceId, campos) {
  try {
    const norm = { ...campos }
    ;['capacidad', 'precio', 'x', 'y', 'w', 'h'].forEach(k => { if (k in norm) norm[k] = parseInt(norm[k]) || 0 })
    const { error } = await frateDB().from('floorplan_spaces').update(norm).eq('space_id', spaceId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function deleteSpace(spaceId) {
  try {
    const { error } = await frateDB().from('floorplan_spaces').delete().eq('space_id', spaceId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── Multi-mapa (varios planos por zona del local) ──────────────────────────
export async function loadFloorplans() {
  try {
    const { data, error } = await frateDB().from('floorplans').select('*').order('created_at')
    if (error) throw error
    if (!data || !data.length) { const def = await getOrCreateDefaultFloorplan(); return def ? [def] : [] }
    return data
  } catch (err) { console.error('[loadFloorplans]', err); return [] }
}
export async function createFloorplan(nombre) {
  try {
    const { data, error } = await frateDB().from('floorplans').insert({ nombre: (nombre || 'Nuevo mapa').trim().slice(0, 60) }).select('*').single()
    if (error) throw error
    return { ok: true, row: data }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function updateFloorplan(floorplanId, campos) {
  try {
    const { error } = await frateDB().from('floorplans').update(campos).eq('floorplan_id', floorplanId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}
export async function deleteFloorplan(floorplanId) {
  try {
    await frateDB().from('floorplan_spaces').delete().eq('floorplan_id', floorplanId)
    const { error } = await frateDB().from('floorplans').delete().eq('floorplan_id', floorplanId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// Todos los espacios de TODOS los mapas (para lectura externa: lugares, etc.)
export async function loadAllSpaces() {
  try {
    const { data } = await frateDB().from('floorplan_spaces').select('*').order('orden')
    return data || []
  } catch { return [] }
}

// ── Admin: entries de un link ───────────────────────────────────────────────
export async function loadEntries(listaLinkId) {
  const { data, error } = await frateDB().from('invitaciones')
    .select('invitacion_id, nombre_en_lista, rut_en_lista, email_en_lista, nickname_en_lista, telefono_en_lista, instagram_en_lista, espacio_nombre, rol_lista, productor_asociado, nacionalidad, data_quality, estado_lista, source_mode, qr_token, qr_used_at, created_at')
    .eq('lista_link_id', listaLinkId).order('created_at', { ascending: false })
  if (error) { console.error('[loadEntries]', error); return [] }
  return data || []
}
export async function setEntryEstado(invitacionId, estado) {
  try {
    // Al aprobar, genera el QR si aún no tiene
    const update = { estado_lista: estado }
    if (estado === 'aprobado') {
      const { data: cur } = await frateDB().from('invitaciones').select('qr_token').eq('invitacion_id', invitacionId).maybeSingle()
      if (!cur?.qr_token) update.qr_token = genToken()
    }
    const { error } = await frateDB().from('invitaciones').update(update).eq('invitacion_id', invitacionId)
    if (error) throw error
    // Al confirmar → agregar/vincular en el CRM maestro (frate.personas)
    if (estado === 'aprobado') { try { await upsertPersonaDesdeEntry(invitacionId) } catch {} }
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}

// Inserta/vincula una entry confirmada en el CRM maestro (frate.personas) con
// deduplicación (RUT → email → nombre normalizado). Vincula persona_id en la
// invitación. Crea provisional aunque tenga datos mínimos.
export async function upsertPersonaDesdeEntry(invitacionId) {
  try {
    const { data: e } = await frateDB().from('invitaciones')
      .select('invitacion_id, persona_id, nombre_en_lista, rut_en_lista, email_en_lista, nickname_en_lista, tipo_acceso')
      .eq('invitacion_id', invitacionId).maybeSingle()
    if (!e) return { ok: false, error: 'entry no encontrada' }
    if (e.persona_id) return { ok: true, persona_id: e.persona_id }   // ya vinculada

    const rut = (e.rut_en_lista || '').trim()
    const email = (e.email_en_lista || '').trim().toLowerCase()
    const nombre = (e.nombre_en_lista || '').trim()
    const normaliz = normNombre(nombre)

    // Dedup: RUT → email → nombre normalizado
    let persona = null
    if (rut) { const { data } = await frateDB().from('personas').select('persona_id, veces_invitado').eq('rut_principal', rut).limit(1); if (data?.length) persona = data[0] }
    if (!persona && email) { const { data } = await frateDB().from('personas').select('persona_id, veces_invitado').eq('email_principal', email).limit(1); if (data?.length) persona = data[0] }
    if (!persona && normaliz) { const { data } = await frateDB().from('personas').select('persona_id, veces_invitado').eq('nombre_normalizado', normaliz).limit(1); if (data?.length) persona = data[0] }

    let personaId
    if (persona) {
      personaId = persona.persona_id
      const upd = { veces_invitado: (persona.veces_invitado || 0) + 1, updated_at: new Date().toISOString() }
      if (rut) upd.rut_principal = rut
      if (email) upd.email_principal = email
      if (e.nickname_en_lista) upd.nickname_principal = e.nickname_en_lista
      if (e.tipo_acceso) upd.categoria_frecuente = e.tipo_acceso
      await frateDB().from('personas').update(upd).eq('persona_id', personaId)
    } else {
      personaId = genTokenUUID()
      const dq = rut && email ? 'ALTA' : (rut || email) ? 'MEDIA' : 'BAJA'
      const { error } = await frateDB().from('personas').insert({
        persona_id: personaId,
        nombre_mostrar: nombre.toUpperCase() || 'SIN NOMBRE',
        nombre_normalizado: normaliz || null,
        rut_principal: rut || null,
        rut_estado: rut ? 'VALIDO' : 'SIN_RUT',
        email_principal: email || null,
        nickname_principal: e.nickname_en_lista || null,
        categoria_frecuente: e.tipo_acceso || null,
        veces_invitado: 1,
        estado_app: 'activo',
        created_from_import: false,
        nivel_confianza_identidad: dq,
      })
      if (error) throw error
    }
    await frateDB().from('invitaciones').update({ persona_id: personaId }).eq('invitacion_id', invitacionId)
    return { ok: true, persona_id: personaId }
  } catch (err) { console.error('[upsertPersonaDesdeEntry]', err); return { ok: false, error: err.message } }
}

// ── QR / Puerta (Fase 6) ────────────────────────────────────────────────────
// Vista pública del ticket por su qr_token
export async function getTicketByQr(qrToken) {
  try {
    const { data: e, error } = await frateDB().from('invitaciones')
      .select('invitacion_id, nombre_en_lista, nickname_en_lista, estado_lista, qr_token, qr_used_at, lista_link_id')
      .eq('qr_token', qrToken).maybeSingle()
    if (error) throw error
    if (!e) return { ok: false, error: 'Entrada no encontrada' }
    let link = null, evento = null, categoria = null
    const { data: l } = await frateDB().from('lista_links').select('*').eq('lista_link_id', e.lista_link_id).maybeSingle()
    link = l || null
    if (link?.link_evento_id) { const { data } = await frateDB().from('link_eventos').select('*').eq('link_evento_id', link.link_evento_id).maybeSingle(); evento = data || null }
    if (link?.categoria_id) { const { data } = await frateDB().from('categorias_acceso').select('*').eq('categoria_id', link.categoria_id).maybeSingle(); categoria = data || null }
    return { ok: true, entry: e, link, evento, categoria }
  } catch (err) { return { ok: false, error: err.message } }
}

// Quemar ticket en puerta — ATÓMICO: el UPDATE con `is('qr_used_at', null)` sólo
// matchea si nadie lo quemó antes (Postgres aplica el WHERE de forma atómica).
export async function checkinByToken(qrToken, gateBy = 'puerta') {
  try {
    if (!qrToken) return { ok: false, error: 'Sin token' }
    // Validar estado primero (para mensajes claros)
    const { data: e } = await frateDB().from('invitaciones')
      .select('nombre_en_lista, estado_lista, qr_used_at').eq('qr_token', qrToken).maybeSingle()
    if (!e) return { ok: false, error: 'QR no encontrado' }
    if (e.estado_lista !== 'aprobado') return { ok: false, error: 'Persona no aprobada', entry: e }
    if (e.qr_used_at) return { ok: false, error: 'ya_usado', usado_at: e.qr_used_at, entry: e }
    // Burn atómico
    const { data: upd, error } = await frateDB().from('invitaciones')
      .update({ qr_used_at: new Date().toISOString(), qr_used_by: gateBy })
      .eq('qr_token', qrToken).is('qr_used_at', null).select('nombre_en_lista, qr_used_at')
    if (error) throw error
    if (!upd || !upd.length) return { ok: false, error: 'ya_usado', entry: e }
    return { ok: true, entry: upd[0] }
  } catch (err) { return { ok: false, error: err.message } }
}

// Puerta global: todas las entries aprobadas (de todas las listas)
export async function loadAllApprovedEntries() {
  try {
    const { data } = await frateDB().from('invitaciones')
      .select('invitacion_id, nombre_en_lista, rut_en_lista, nickname_en_lista, estado_lista, qr_token, qr_used_at, lista_link_id, espacio_nombre')
      .eq('estado_lista', 'aprobado').order('nombre_en_lista').limit(3000)
    return data || []
  } catch (err) { console.error('[loadAllApprovedEntries]', err); return [] }
}

// Búsqueda en puerta: entries aprobadas de TODO un evento (todos sus links)
export async function loadEntriesByEvento(linkEventoId) {
  try {
    const { data: links } = await frateDB().from('lista_links').select('lista_link_id, inviter_nombre, categoria_id').eq('link_evento_id', linkEventoId)
    const ids = (links || []).map(l => l.lista_link_id)
    if (!ids.length) return []
    const { data } = await frateDB().from('invitaciones')
      .select('invitacion_id, nombre_en_lista, rut_en_lista, nickname_en_lista, estado_lista, qr_token, qr_used_at, lista_link_id')
      .in('lista_link_id', ids).eq('estado_lista', 'aprobado').order('nombre_en_lista')
    const linkMap = Object.fromEntries((links || []).map(l => [l.lista_link_id, l.inviter_nombre]))
    return (data || []).map(e => ({ ...e, inviter: linkMap[e.lista_link_id] || '' }))
  } catch (err) { console.error('[loadEntriesByEvento]', err); return [] }
}
export async function deleteEntry(invitacionId) {
  try {
    const { error } = await frateDB().from('invitaciones').delete().eq('invitacion_id', invitacionId)
    if (error) throw error
    return { ok: true }
  } catch (err) { return { ok: false, error: err.message } }
}
