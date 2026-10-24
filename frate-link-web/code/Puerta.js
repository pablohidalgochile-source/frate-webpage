/**
 * Puerta — Vista para tablet en puerta del evento.
 * Búsqueda rápida por nombre/RUT/QR + marca de ingreso.
 * Pensada para fullscreen táctil.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import * as SS from '../lib/syncService'
import { hoyChile, ayerChile, esMadrugadaChile } from '../lib/fechaChile'
import * as PW from '../lib/puertaWebService'

const CAT_COLORS = {
  'VIP FUEGO': '#e8363d',
  'VIP AIRE':  '#3b8bd4',
  'VIP':       '#d4a832',
  'GENERAL':   '#9b9b9b',
  'RESERVA/CUMPLE': '#e67e22',
  'FREE/CORTESIA':  '#2ecc71',
  'COVER':     '#9b59b6',
}

export default function Puerta() {
  const [eventos, setEventos] = useState([])
  const [eventoOpId, setEventoOpId] = useState(() => localStorage.getItem('frate_puerta_evento') || '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [toast, setToast] = useState(null)
  const [stats, setStats] = useState({ total: 0, ingresados: 0 })
  const inputRef = useRef(null)
  // Colores de categoría desde las categorías editables (frate.categorias_acceso); fallback al mapa fijo
  const [catColors, setCatColors] = useState(CAT_COLORS)
  useEffect(() => {
    SS.loadInvitadoCategorias().then(cats => {
      if (!cats?.length) return
      const map = { ...CAT_COLORS }
      cats.forEach(c => { if (c.color) { map[c.codigo] = c.color; map[(c.nombre || '').toUpperCase()] = c.color } })
      setCatColors(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const ev = JSON.parse(localStorage.getItem('frate_eventos_operativos') || '[]')
      // Ventana de 5am: un evento de "ayer" sigue vigente hasta las 05:00 de hoy
      // ⚠️ Fechas en hora de Chile (no UTC) — ver src/lib/fechaChile.js
      const now = new Date()
      const hoy = hoyChile(now)
      const esMadrugada = esMadrugadaChile(now)
      const ayer = ayerChile(now)
      setEventos(ev.filter(e => e.estado === 'activo' || e.fecha === hoy || (esMadrugada && e.fecha === ayer)).sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')))
    } catch {}
  }, [])

  useEffect(() => { localStorage.setItem('frate_puerta_evento', eventoOpId) }, [eventoOpId])

  // Cargar stats del evento
  const cargarStats = useCallback(async () => {
    if (!eventoOpId) { setStats({ total: 0, ingresados: 0 }); return }
    const all = await SS.loadInvitacionesEventoOperativo(eventoOpId)
    setStats({
      total: all.length,
      ingresados: all.filter(i => i.estado_ingreso === 'ingresó').length,
    })
  }, [eventoOpId])
  useEffect(() => { cargarStats() }, [cargarStats])

  // Búsqueda debounced
  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    if (!eventoOpId) return
    setSearching(true)
    const id = setTimeout(async () => {
      const r = await SS.searchInvitadosRapido(query, { eventoOpId, limit: 30 })
      setResults(r); setSearching(false)
    }, 250)
    return () => clearTimeout(id)
  }, [query, eventoOpId])

  function notify(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 2500)
  }

  // ── Puerta como LECTOR del QR de la web (contrato §2) ──────────────────────
  const eventoFecha = eventos.find(e => String(e.id) === String(eventoOpId))?.fecha || hoyChile()
  const [qrInput, setQrInput] = useState('')
  const [qrRes, setQrRes] = useState(null)
  const [snapInfo, setSnapInfo] = useState(null)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [gate, setGate] = useState(PW.getGateId())
  const qrRef = useRef(null)

  const refreshSnap = useCallback(() => setSnapInfo(PW.snapshotInfo(eventoFecha)), [eventoFecha])
  useEffect(() => { refreshSnap() }, [refreshSnap])
  useEffect(() => {
    const on = () => { setOnline(true); PW.flushCola(eventoFecha).then(refreshSnap) }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [eventoFecha, refreshSnap])

  async function cargarSnapshot() {
    if (!online) return notify('Necesitas internet para bajar el snapshot', 'err')
    notify('Bajando snapshot de la noche…')
    const r = await PW.prefetchSnapshot(eventoFecha)
    if (r.ok) { notify(`✓ ${r.count} QR cacheados para ${eventoFecha}`); refreshSnap() }
    else notify('Error snapshot: ' + (r.error || ''), 'err')
  }
  async function validarQrWeb(tok) {
    const token = (tok ?? qrInput).trim()
    if (!token) return
    const r = await PW.validarQr(token, eventoFecha)
    setQrRes(r); setQrInput(''); refreshSnap()
    setTimeout(() => qrRef.current?.focus(), 100)
    if (r.ok && !r.ya_usado) notify(`✓ ${r.persona?.nombre || 'Ingreso'} — validado${r.offline ? ' (offline)' : ''}`)
    else if (r.ok && r.ya_usado) notify(`⚠ QR YA USADO — ${r.persona?.nombre || ''}`, 'err')
    else notify(`✕ ${r.error === 'qr_no_existe' ? 'QR no válido' : r.error}`, 'err')
  }
  function saveGate(g) { setGate(g); PW.setGateId(g) }

  async function marcar(invitacionId, estado = 'ingresó') {
    try {
      await SS.marcarIngresoInvitado(invitacionId, { estado })
      notify(estado === 'ingresó' ? '✓ Ingreso registrado' : `Marcado: ${estado}`, 'ok')
      // Actualizar lista local
      setResults(prev => prev.map(r => r.invitacion_id === invitacionId ? { ...r, estado_ingreso: estado, ingreso_at: estado === 'ingresó' ? new Date().toISOString() : null } : r))
      cargarStats()
      // Limpiar búsqueda y enfocar input para el siguiente
      setTimeout(() => { setQuery(''); inputRef.current?.focus() }, 600)
    } catch (err) { notify('Error: ' + err.message, 'err') }
  }

  return (
    <div style={{
      minHeight: '100vh', padding: 24,
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--white)' }}>🚪 Puerta</div>
        <select value={eventoOpId} onChange={e => setEventoOpId(e.target.value)}
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--white)', padding: '10px 14px', borderRadius: 7, fontSize: 14, outline: 'none' }}>
          <option value="">— Seleccionar evento —</option>
          {eventos.map(e => (
            <option key={e.id} value={e.id}>{e.fecha} · {e.nombre || 'Sin nombre'}</option>
          ))}
        </select>

        {eventoOpId && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <div style={kpiBig('var(--gold2)')}>
              <div style={kpiLbl}>Convocados</div>
              <div style={kpiVal}>{stats.total}</div>
            </div>
            <div style={kpiBig('var(--green)')}>
              <div style={kpiLbl}>Ingresados</div>
              <div style={kpiVal}>{stats.ingresados}</div>
            </div>
            <div style={kpiBig('var(--orange)')}>
              <div style={kpiLbl}>Pendientes</div>
              <div style={kpiVal}>{stats.total - stats.ingresados}</div>
            </div>
          </div>
        )}
      </div>

      {!eventoOpId ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--muted2)' }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>🎟</div>
          <div style={{ fontSize: 16 }}>Selecciona un evento arriba para empezar.</div>
        </div>
      ) : (
        <>
          {/* Validar QR de la web (contrato §2) — sirve con lector USB (escribe + Enter) */}
          <div style={{ marginBottom: 16, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>🎫 Validar QR web</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: online ? 'var(--green)' : 'var(--orange)', border: `1px solid ${online ? 'var(--green)' : 'var(--orange)'}`, borderRadius: 20, padding: '2px 9px' }}>
                {online ? '🟢 En línea' : '🟠 Offline (valida con snapshot)'}
              </span>
              {snapInfo
                ? <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Snapshot: {snapInfo.total} QR · {snapInfo.usados} usados{snapInfo.pendientes ? ` · ${snapInfo.pendientes} por sincronizar` : ''}</span>
                : <span style={{ fontSize: 11, color: 'var(--orange)' }}>Sin snapshot — bájalo con internet antes de abrir</span>}
              <div style={{ flex: 1 }} />
              <input value={gate} onChange={e => saveGate(e.target.value)} title="Identificador de esta puerta"
                style={{ width: 90, padding: '5px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--white)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
              <button onClick={cargarSnapshot} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--green)', background: 'var(--green)1a', color: 'var(--green)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>⬇ Bajar snapshot</button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input ref={qrRef} value={qrInput} onChange={e => setQrInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') validarQrWeb() }}
                placeholder="Escanea o pega el código QR (FCC-…) y Enter"
                style={{ flex: 1, padding: '14px 18px', background: 'var(--bg3)', border: '2px solid var(--border)', color: 'var(--white)', borderRadius: 10, fontSize: 18, outline: 'none', fontFamily: 'var(--mono)' }} />
              <button onClick={() => validarQrWeb()} style={{ padding: '0 22px', borderRadius: 10, border: 'none', background: 'var(--green)', color: '#062', cursor: 'pointer', fontSize: 16, fontWeight: 800 }}>Validar</button>
            </div>
            {qrRes && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 9,
                background: qrRes.ok && !qrRes.ya_usado ? 'rgba(46,204,113,.14)' : qrRes.ya_usado ? 'rgba(230,126,34,.16)' : 'rgba(231,76,60,.16)',
                border: `1px solid ${qrRes.ok && !qrRes.ya_usado ? 'var(--green)' : qrRes.ya_usado ? 'var(--orange)' : 'var(--red)'}` }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {qrRes.ok && !qrRes.ya_usado ? '✓ VÁLIDO — DEJAR PASAR' : qrRes.ya_usado ? '⚠ QR YA USADO' : `✕ ${qrRes.error === 'qr_no_existe' ? 'QR NO VÁLIDO' : qrRes.error === 'sin_snapshot_offline' ? 'SIN SNAPSHOT (baja con internet)' : qrRes.error}`}
                </div>
                {qrRes.persona && <div style={{ fontSize: 13, color: 'var(--white)', marginTop: 3 }}>{qrRes.persona.nombre}{qrRes.persona.rut ? ` · ${qrRes.persona.rut}` : ''}{qrRes.persona.nombre_ticket ? ` · ${qrRes.persona.nombre_ticket}` : ''}{qrRes.offline ? ' · offline' : ''}</div>}
              </div>
            )}
          </div>

          {/* Input búsqueda grande */}
          <div style={{ marginBottom: 18 }}>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} autoFocus
              placeholder="🔍  Buscar por nombre, apodo, RUT o código QR…"
              style={{
                width: '100%', padding: '20px 24px',
                background: 'var(--bg2)', border: '2px solid var(--border)',
                color: 'var(--white)', borderRadius: 12, fontSize: 22,
                outline: 'none', fontWeight: 600,
              }} />
          </div>

          {searching && <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Buscando…</div>}

          {!searching && query.length >= 2 && results.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--red2)' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>❌</div>
              <div style={{ fontSize: 18 }}>Sin coincidencias. ¿Revisar lista o rechazar?</div>
            </div>
          )}

          {!searching && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map(r => {
                const ingresado = r.estado_ingreso === 'ingresó'
                const cat = r.tipo_acceso || 'SIN CLASIFICAR'
                const color = catColors[cat] || catColors[(cat || '').toUpperCase()] || '#9b9b9b'
                return (
                  <div key={r.invitacion_id} style={{
                    padding: '16px 20px', borderRadius: 10,
                    background: ingresado ? 'rgba(46,204,113,0.08)' : 'var(--bg2)',
                    border: `2px solid ${ingresado ? 'var(--green)' : color + '66'}`,
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>
                        {r.nombre_mostrar || r.nombre_en_lista}
                      </div>
                      {r.nickname_principal && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'monospace' }}>"{r.nickname_principal}"</div>
                      )}
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                        {r.rut_principal && (
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.rut_principal}</span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      padding: '8px 16px', borderRadius: 99,
                      background: color + '22', color, fontSize: 14, fontWeight: 800,
                      fontFamily: 'monospace', letterSpacing: '.05em',
                    }}>
                      {cat}
                    </div>
                    {ingresado ? (
                      <div style={{ padding: '12px 20px', borderRadius: 8, background: 'var(--green)', color: '#000', fontSize: 18, fontWeight: 800 }}>
                        ✓ INGRESÓ
                      </div>
                    ) : (
                      <>
                        <button onClick={() => marcar(r.invitacion_id, 'ingresó')}
                          style={{ padding: '16px 28px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>
                          ✓ INGRESAR
                        </button>
                        <button onClick={() => marcar(r.invitacion_id, 'rechazado')}
                          style={{ padding: '16px 22px', borderRadius: 8, border: '1px solid var(--red2)', background: 'transparent', color: 'var(--red2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          ✗ RECHAZAR
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          padding: '14px 30px', borderRadius: 10,
          background: toast.tipo === 'ok' ? 'var(--green)' : 'var(--red2)',
          color: '#000', fontSize: 18, fontWeight: 800,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 10000,
        }}>{toast.msg}</div>
      )}
    </div>
  )
}

const kpiBig = (c) => ({ background: `${c}1a`, border: `1px solid ${c}66`, borderRadius: 8, padding: '10px 18px', minWidth: 110, textAlign: 'center' })
const kpiLbl = { fontSize: 9, color: 'var(--muted2)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '.08em' }
const kpiVal = { fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: 'var(--white)', marginTop: 2 }
