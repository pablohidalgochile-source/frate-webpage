/**
 * PublicListaLink — vista pública de un link FRATE LINK (sin login).
 * El invitado abre erp.frate.cl/l/:token en su celular y agrega su(s) dato(s).
 * Mobile-first, oscuro, urbano.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { getListaLinkByToken, submitEntryToLink } from '../lib/frateLinkService'
import { formatRUT, isValidRUT } from '../lib/formatters'

const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function PublicListaLink() {
  const token = (window.location.pathname.split('/l/')[1] || '').replace(/\/.*$/, '').trim()
  const [estado, setEstado] = useState('cargando')   // cargando/ok/error
  const [info, setInfo] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const [form, setForm] = useState({ nombre: '', rut: '', email: '', nickname: '', telefono: '', instagram: '', rol: '', productor: '', nacionalidad: '' })
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(null)           // { estado, qr_token }
  const [copiado, setCopiado] = useState(false)
  const [espacioSel, setEspacioSel] = useState(null) // espacio elegido en el croquis
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrMsg, setOcrMsg] = useState('')
  const [menorDeEdad, setMenorDeEdad] = useState(false)

  const cargar = useCallback(async () => {
    if (!token) { setEstado('error'); setErrMsg('Link inválido'); return }
    const r = await getListaLinkByToken(token)
    if (!r.ok) { setEstado('error'); setErrMsg(r.error); return }
    setInfo(r); setEstado('ok')
  }, [token])
  useEffect(() => { cargar() }, [cargar])

  function setRut(v) {
    setForm(f => ({ ...f, rut: formatRUT(v) }))
  }

  function edadDesde(fnac) {
    if (!fnac) return null
    const b = new Date(fnac + 'T12:00:00'); if (isNaN(b.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - b.getFullYear()
    const m = now.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
    return age
  }
  function leerImagenComprimida(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const reader = new FileReader()
      reader.onload = () => { img.src = reader.result }; reader.onerror = reject
      img.onload = () => {
        const max = 1100; let { width, height } = img
        if (width > max || height > max) { const r = max / Math.max(width, height); width *= r; height *= r }
        const c = document.createElement('canvas'); c.width = width; c.height = height
        c.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(c.toDataURL('image/jpeg', 0.7).split(',')[1])
      }
      img.onerror = reject; reader.readAsDataURL(file)
    })
  }
  async function escanearCedula(file) {
    if (!file) return
    setOcrMsg(''); setMenorDeEdad(false); setOcrLoading(true)
    try {
      const b64 = await leerImagenComprimida(file)
      const r = await fetch('/api/ocr-cedula', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: b64, media_type: 'image/jpeg' }) })
      const data = await r.json()
      if (!data.ok) { setOcrMsg(data.error || 'No se pudo leer la cédula'); setOcrLoading(false); return }
      setForm(f => ({ ...f, nombre: (data.nombre || f.nombre || '').toUpperCase(), rut: data.rut ? formatRUT(data.rut) : f.rut }))
      const edad = edadDesde(data.fecha_nacimiento)
      if (edad != null && edad < 18) { setMenorDeEdad(true); setOcrMsg(`⛔ Debes ser mayor de 18 años (edad detectada: ${edad}).`) }
      else setOcrMsg('✓ Datos cargados desde tu cédula' + (edad != null ? ` · ${edad} años` : ''))
    } catch (err) { setOcrMsg('Error al escanear: ' + err.message) }
    setOcrLoading(false)
  }

  async function enviar() {
    const cfg = (info?.link?.form_config) || { rut: 'opcional', email: 'opcional', telefono: 'oculto', instagram: 'oculto', apodo: 'opcional' }
    if (menorDeEdad) { setErrMsg('Debes ser mayor de 18 años para entrar'); return }
    if (!form.nombre.trim()) { setErrMsg('Escribe tu nombre'); return }
    if (form.rut.trim() && !isValidRUT(form.rut)) { setErrMsg('El RUT no es válido'); return }
    if (!emailOk(form.email.trim())) { setErrMsg('El email no es válido'); return }
    const reqLbl = { rut: 'el RUT/documento', email: 'el email', telefono: 'el teléfono', instagram: 'el Instagram', apodo: 'el nombre artístico', rol: 'el rol', productor: 'el productor', nacionalidad: 'la nacionalidad' }
    const val = { rut: form.rut, email: form.email, telefono: form.telefono, instagram: form.instagram, apodo: form.nickname, rol: form.rol, productor: form.productor, nacionalidad: form.nacionalidad }
    for (const [k, regla] of Object.entries(cfg)) {
      if (regla === 'obligatorio' && !(val[k] || '').trim()) { setErrMsg(`Falta ${reqLbl[k] || k}`); return }
    }
    setErrMsg(''); setEnviando(true)
    const r = await submitEntryToLink(token, { ...form, espacio_id: espacioSel?.space_id || null, espacio_nombre: espacioSel?.nombre || null })
    setEnviando(false)
    if (!r.ok) { setErrMsg(r.error); return }
    setExito({ estado: r.estado, qr_token: r.qr_token })
    setForm({ nombre: '', rut: '', email: '', nickname: '', telefono: '', instagram: '', rol: '', productor: '', nacionalidad: '' })
    cargar()   // refrescar cupos
  }

  function compartir() {
    const url = window.location.href
    const texto = `¡Estás en la lista de Fraternidad! Agrégate acá 👉 ${url}`
    if (navigator.share) { navigator.share({ title: 'Lista Fraternidad', text: texto, url }).catch(() => {}) }
    else { navigator.clipboard?.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
  }

  const wrap = { minHeight: '100vh', background: '#0a0a0c', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 18px', fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 440, background: '#141418', border: '1px solid #26262e', borderRadius: 16, padding: 22 }
  const inp = { width: '100%', boxSizing: 'border-box', background: '#0e0e12', border: '1px solid #2a2a33', color: '#fff', padding: '13px 14px', borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 10 }

  if (estado === 'cargando') return <div style={{ ...wrap, justifyContent: 'center' }}>Cargando…</div>
  if (estado === 'error') return (
    <div style={{ ...wrap, justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚫</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Link no disponible</div>
      <div style={{ color: '#888', marginTop: 6 }}>{errMsg}</div>
    </div>
  )

  const { link, evento, categoria, used_cupos, birthday, spaces } = info
  const esCumple = link.link_type === 'birthday'
  const esProd = link.link_type === 'artist' || link.link_type === 'production'
  const hayCroquis = link.allow_space_selection && spaces && spaces.length > 0
  const cfg = link.form_config || { rut: 'opcional', email: 'opcional', telefono: 'oculto', instagram: 'oculto', apodo: 'opcional', rol: 'oculto', productor: 'oculto', nacionalidad: 'oculto' }
  const ph = (label, k) => `${label}${cfg[k] === 'obligatorio' ? ' *' : ' (opcional)'}`
  const color = categoria?.color || '#e8363d'
  const disponibles = Math.max(0, link.max_cupos - used_cupos)
  const cerrado = link.status !== 'abierto' || (link.closes_at && new Date(link.closes_at) < new Date()) || disponibles <= 0

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '.25em', color: '#888', fontWeight: 700 }}>FRATERNIDAD CAMPUS CENTRAL</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{esCumple ? '🎂 Celebra tu cumple en Frate' : link.link_type === 'reservation' ? '🍾 Reserva tu mesa / zona' : link.link_type === 'artist' ? '🎤 Artist Guest List' : link.link_type === 'production' ? '🎬 Acceso Producción' : 'Tu lista está abierta'}</div>
        {esCumple && birthday?.birthday_name && <div style={{ fontSize: 14, color: '#ffd24a', marginTop: 2 }}>Cumple de {birthday.birthday_name}</div>}
        {esProd && <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>Sujeto a aprobación interna</div>}
      </div>

      <div style={card}>
        {/* Cabecera del evento */}
        <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{evento?.nombre || 'Evento'}</div>
          {evento?.fecha_estimada && <div style={{ fontSize: 13, color: '#aaa' }}>{evento.fecha_estimada}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {categoria && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: color + '22', color }}>{categoria.emoji ? categoria.emoji + ' ' : ''}{categoria.nombre}</span>}
            {link.benefit_text && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#1d1d24', color: '#ddd' }}>{link.benefit_text}</span>}
            {link.cover_amount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#1d1d24', color: '#ffd24a' }}>Cover ${link.cover_amount.toLocaleString('es-CL')}</span>}
          </div>
          {link.inviter_nombre && <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Invita: {link.inviter_nombre}</div>}
        </div>

        {/* Cupos */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#0e0e12', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: disponibles > 0 ? '#2ecc71' : '#e8363d' }}>{disponibles}</div>
            <div style={{ fontSize: 10, color: '#888' }}>cupos disponibles</div>
          </div>
          <div style={{ flex: 1, background: '#0e0e12', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{used_cupos}/{link.max_cupos}</div>
            <div style={{ fontSize: 10, color: '#888' }}>en la lista</div>
          </div>
        </div>

        {/* Botón de pago (WebPay) */}
        {link.monto_servicio > 0 && link.estado_pago !== 'pagado' && (
          <a href={link.webpay_url || 'https://www.webpay.cl/form-pay/224478'} target="_blank" rel="noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '13px', borderRadius: 10, background: '#d4a832', color: '#0a0a0a', fontWeight: 800, fontSize: 15, textDecoration: 'none', marginBottom: 14 }}>
            💳 Pagar ${link.monto_servicio.toLocaleString('es-CL')}
          </a>
        )}
        {link.monto_servicio > 0 && link.estado_pago === 'pagado' && (
          <div style={{ textAlign: 'center', padding: '10px', borderRadius: 10, background: 'rgba(46,204,113,0.12)', color: '#2ecc71', fontWeight: 800, marginBottom: 14 }}>✅ Pago confirmado</div>
        )}

        {exito ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{exito.estado === 'aprobado' ? '✅' : '⏳'}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{exito.estado === 'aprobado' ? '¡Estás en la lista!' : 'Datos recibidos'}</div>
            <div style={{ color: '#aaa', fontSize: 13, marginTop: 6 }}>
              {exito.estado === 'aprobado' ? 'Te esperamos en la puerta.' : 'Quedaste pendiente de validación. Te confirmamos pronto.'}
            </div>
            {exito.qr_token && (
              <a href={`/t/${exito.qr_token}`} style={{ display: 'inline-block', marginTop: 14, padding: '11px 18px', borderRadius: 10, background: color, color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                🎟 Ver mi entrada (QR)
              </a>
            )}
            <button onClick={() => setExito(null)} disabled={cerrado}
              style={{ display: 'block', margin: '12px auto 0', padding: '10px 18px', borderRadius: 10, border: '1px solid #2a2a33', background: 'transparent', color: '#ddd', fontWeight: 700, fontSize: 13, cursor: cerrado ? 'default' : 'pointer' }}>
              + Agregar otra persona
            </button>
          </div>
        ) : cerrado ? (
          <div style={{ textAlign: 'center', padding: '18px 0', color: '#e8363d', fontWeight: 700 }}>
            {disponibles <= 0 ? 'No quedan cupos 😣' : 'Esta lista está cerrada'}
          </div>
        ) : (
          <>
            {hayCroquis && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Selecciona tu zona {espacioSel ? <span style={{ color }}>· {espacioSel.nombre}{espacioSel.precio ? ` ($${espacioSel.precio.toLocaleString('es-CL')})` : ''}</span> : '(opcional)'}</div>
                <div style={{ width: 372, maxWidth: '100%', height: 236, position: 'relative', overflow: 'hidden', borderRadius: 10, margin: '0 auto' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 600, height: 380, transform: 'scale(0.62)', transformOrigin: 'top left', background: '#0e0e12', backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                    {spaces.map(s => {
                      const blocked = s.estado === 'bloqueado'
                      const on = espacioSel?.space_id === s.space_id
                      return (
                        <div key={s.space_id} onClick={() => !blocked && setEspacioSel(on ? null : s)}
                          style={{ position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, background: (s.color || '#3b8bd4') + (blocked ? '22' : on ? 'cc' : '55'), border: `2px solid ${on ? '#fff' : (s.color || '#3b8bd4')}`, borderRadius: 8, cursor: blocked ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: blocked ? 0.5 : 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.1 }}>{s.nombre}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{blocked ? 'No disponible' : (s.capacidad ? s.capacidad + 'p' : '') + (s.precio ? ' · $' + s.precio.toLocaleString('es-CL') : '')}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            <label style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 10, border: '1px dashed #3a3a44', color: '#bbb', fontSize: 13, cursor: ocrLoading ? 'wait' : 'pointer', marginBottom: 10 }}>
              {ocrLoading ? '⏳ Leyendo tu cédula…' : '📸 Escanear cédula (autollenar)'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => escanearCedula(e.target.files?.[0])} disabled={ocrLoading} />
            </label>
            {ocrMsg && <div style={{ fontSize: 12, color: menorDeEdad ? '#e8363d' : '#2ecc71', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>{ocrMsg}</div>}
            <input style={inp} placeholder="Nombre completo *" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            {cfg.rut !== 'oculto' && <input style={inp} placeholder={ph('RUT', 'rut')} value={form.rut} onChange={e => setRut(e.target.value)} inputMode="numeric" />}
            {cfg.email !== 'oculto' && <input style={inp} placeholder={ph('Email', 'email')} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} inputMode="email" />}
            {cfg.telefono !== 'oculto' && <input style={inp} placeholder={ph('Teléfono', 'telefono')} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} inputMode="tel" />}
            {cfg.instagram !== 'oculto' && <input style={inp} placeholder={ph('Instagram', 'instagram')} value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} />}
            {cfg.apodo !== 'oculto' && <input style={inp} placeholder={ph('Apodo / nombre artístico', 'apodo')} value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />}
            {cfg.rol !== 'oculto' && <input style={inp} placeholder={ph('Rol (DJ, técnico, manager…)', 'rol')} value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))} />}
            {cfg.productor !== 'oculto' && <input style={inp} placeholder={ph('Productor asociado', 'productor')} value={form.productor} onChange={e => setForm(f => ({ ...f, productor: e.target.value }))} />}
            {cfg.nacionalidad !== 'oculto' && <input style={inp} placeholder={ph('Nacionalidad', 'nacionalidad')} value={form.nacionalidad} onChange={e => setForm(f => ({ ...f, nacionalidad: e.target.value }))} />}
            {errMsg && <div style={{ color: '#e8363d', fontSize: 12, marginBottom: 8 }}>{errMsg}</div>}
            <button onClick={enviar} disabled={enviando || menorDeEdad}
              style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: menorDeEdad ? '#2a2a33' : color, color: '#fff', fontWeight: 800, fontSize: 15, cursor: (enviando || menorDeEdad) ? 'default' : 'pointer', opacity: menorDeEdad ? 0.6 : 1 }}>
              {menorDeEdad ? '⛔ Solo +18' : enviando ? 'Enviando…' : esProd ? 'Agregar integrante' : 'Agregarme a la lista'}
            </button>
          </>
        )}

        <button onClick={compartir}
          style={{ width: '100%', marginTop: 10, padding: '12px', borderRadius: 10, border: '1px solid #2a2a33', background: 'transparent', color: '#ddd', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          {copiado ? '✓ Link copiado' : '🔗 Compartir esta lista'}
        </button>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: '#555' }}>Pío Nono 430, Recoleta · Santiago</div>
    </div>
  )
}
