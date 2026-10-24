// ============================================================
// FRATE POPUPS — Reservas y servicios
// ============================================================
// NOTA: openEventPopup(), closeEventPopup(), showTicketSelector(),
// renderPersonalizacionForms*() e initEventPopup() fueron migrados
// al popup unificado de index.html + frate-cuenta.js.
// Este archivo solo maneja los popups de RESERVAS/SERVICIOS.
// ============================================================

// ── CERRAR POPUP DE EVENTO ────────────────────────────────────
// Definida aquí también para que el botón "MESA VIP / RESERVAS"
// del popup de evento pueda llamar closeEventPopup() sin problemas.
function closeEventPopup() {
  document.getElementById('event-popup')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── RESERVA SERVICE POPUPS ────────────────────────────────────
const RESERVA_SERVICIOS = {
  vip: {
    titulo: "RESERVA & MESA VIP",
    emoji: "👑",
    descripcion: "La experiencia más exclusiva de Frate. Tu mesa, tu espacio, tu noche. Acceso prioritario, atención personalizada y la mejor vista de la pista.",
    detalles: ["Mesa reservada toda la noche", "Atención VIP personalizada", "Acceso prioritario sin filas", "Botellería y consumición mínima", "Coordinador dedicado"],
    color: "#D4A832"
  },
  cumple: {
    titulo: "CUMPLEAÑOS ESPECIAL",
    emoji: "🎂",
    descripcion: "Celebra tu noche más importante en la pista más famosa de Chile. Hacemos tu cumpleaños inolvidable con sorpresas, atención especial y mucho carrete.",
    detalles: ["Mesa reservada para el grupo", "Sorpresa especial de cumpleaños", "Foto y video del momento", "Atención personalizada", "Coordinar detalles por WhatsApp"],
    color: "#E8363D"
  },
  grupo: {
    titulo: "GRUPO UNIVERSITARIO",
    emoji: "🎓",
    descripcion: "¿Van más de 10 de tu carrera o facultad? Tenemos condiciones especiales para grupos universitarios. La casita del carrete te espera.",
    detalles: ["Tarifa especial para 10+ personas", "Lista reservada con nombres", "Coordinación directa con encargado", "Acceso grupal sin filas", "Válido para todas las universidades"],
    color: "#D4A832"
  },
  convenio: {
    titulo: "FRAT & FRIENDS",
    emoji: "🤝",
    descripcion: "Convenios con universidades, centros de estudiantes, federaciones y grupos organizados. Si representas a una comunidad, hablemos de algo más grande.",
    detalles: ["Convenio institucional", "Tarifas negociadas para socios", "Activaciones en campus", "Presencia de marca Frate", "Programas de fidelización"],
    color: "#E8363D"
  },
  despedida: {
    titulo: "DESPEDIDAS DE SOLTER@S",
    emoji: "💍",
    descripcion: "La despedida de soltero o soltera que se va a recordar. Frate pone el ambiente, la música y la energía. Tú traes a los culpables.",
    detalles: ["Coordinación completa del evento", "Mesa o zona reservada", "Sorpresas personalizadas", "Atención especial para el/la protagonista", "Fotos y recuerdos de la noche"],
    color: "#8B1A1E"
  }
};

function openReservaPopup(tipo) {
  const svc = RESERVA_SERVICIOS[tipo];
  if (!svc) return;
  const popup = document.getElementById('reserva-popup');
  if (!popup) return;

  document.getElementById('rp-emoji').textContent  = svc.emoji;
  document.getElementById('rp-titulo').textContent = svc.titulo;
  document.getElementById('rp-titulo').style.color = svc.color;
  document.getElementById('rp-desc').textContent   = svc.descripcion;
  document.getElementById('rp-detalles').innerHTML = svc.detalles.map(d =>
    `<li style="padding:6px 0;border-bottom:1px solid #1a1a1c;font-size:0.85rem;color:var(--gris);display:flex;gap:10px;align-items:center;">
      <span style="color:${svc.color}">✓</span> ${d}
    </li>`
  ).join('');

  document.getElementById('rp-tipo-hidden').value = svc.titulo;

  // Tipo del CONTRATO CRM: cumple → 'cumpleanos'; convenio → 'convenio'; resto → 'reserva'
  window._rpConvenio = (tipo === 'convenio');
  window._rpTipoContrato = (tipo === 'cumple') ? 'cumpleanos' : 'reserva';
  const esCumple = window._rpTipoContrato === 'cumpleanos';
  const deco = document.getElementById('rp-deco-wrap');
  const nac  = document.getElementById('rp-nac-wrap');
  if (deco) deco.style.display = esCumple ? 'flex' : 'none';
  if (nac)  nac.style.display  = esCumple ? 'block' : 'none';
  const invW = document.getElementById('rp-invitados');
  if (invW) invW.style.display = window._rpConvenio ? 'none' : '';
  if (!window._rpConvenio) renderInvitadosRP();

  popup.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ── Constructor de invitados (detalle nombre + RUT por persona) ──
// Conserva lo ya escrito al cambiar la cantidad (igual que los tickets).
function renderInvitadosRP() {
  const cont = document.getElementById('rp-invitados');
  if (!cont) return;
  const n = Math.max(1, Math.min(60, parseInt(document.getElementById('rp-personas')?.value) || 1));
  const prev = [...cont.querySelectorAll('.rp-inv-row')].map(r => ({
    nombre: r.querySelector('.rp-inv-nombre').value,
    rut: r.querySelector('.rp-inv-rut').value,
  }));
  let html = '';
  for (let i = 0; i < n; i++) {
    html += `<div class="rp-inv-row" style="display:grid;grid-template-columns:24px 1fr 130px;gap:8px;align-items:center;margin-bottom:6px;">
      <span style="color:#555;font-size:0.7rem;">${i + 1}.</span>
      <input type="text" class="rp-inv-nombre" placeholder="${i === 0 ? 'Tu nombre (responsable)' : 'Nombre invitad@ ' + (i + 1)}" style="width:100%;box-sizing:border-box;" />
      <input type="text" class="rp-inv-rut" placeholder="RUT" style="width:100%;box-sizing:border-box;" />
    </div>`;
  }
  cont.innerHTML = html;
  const nombres = cont.querySelectorAll('.rp-inv-nombre');
  const ruts = cont.querySelectorAll('.rp-inv-rut');
  prev.forEach((p, i) => { if (nombres[i] && p.nombre) nombres[i].value = p.nombre; if (ruts[i] && p.rut) ruts[i].value = p.rut; });
}

function closeReservaPopup() {
  document.getElementById('reserva-popup')?.classList.remove('open');
  document.body.style.overflow = '';
}

function initReservaPopups() {
  document.getElementById('reserva-popup')?.addEventListener('click', e => {
    if (e.target === document.getElementById('reserva-popup')) closeReservaPopup();
  });
  document.getElementById('rp-close')?.addEventListener('click', closeReservaPopup);

  // Form → Supabase + WhatsApp (ambos)
  document.getElementById('rp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const btn  = form.querySelector('button[type="submit"]');
    const txtOrig = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
      // 1) Crear la solicitud CRM (con detalle de invitados) — el ERP
      //    la recibe al instante por webhook. Todo pasa por el servidor.
      const session = Storage.get('frate_session');
      const invitados = [...document.querySelectorAll('#rp-invitados .rp-inv-row')].map(r => ({
        nombre: r.querySelector('.rp-inv-nombre').value.trim(),
        rut:    r.querySelector('.rp-inv-rut').value.trim(),
      })).filter(i => i.nombre);
      // El responsable siempre va como primer invitado si no se detalló
      if (!invitados.length) invitados.push({ nombre: data.nombre, rut: data.rut || '' });
      else if (!invitados[0].rut && data.rut) invitados[0].rut = data.rut;

      const bodyReq = window._rpConvenio
        ? { accion: 'crear_convenio', payload: {
              nombre: data.nombre, telefono: data.telefono,
              email: data.email || session?.email || '',
              universidad: data.zona_preferida || session?.universidad || '',
              personas: parseInt(data.personas) || null,
              mensaje: data.mensaje || '', fecha: data.fecha || '',
            } }
        : { accion: window._rpTipoContrato === 'cumpleanos' ? 'crear_cumpleanos' : 'crear_reserva',
            payload: {
              nombre: data.nombre,
              telefono: data.telefono,
              fecha: data.fecha,
              personas: parseInt(data.personas) || invitados.length,
              rut: data.rut || '',
              email: data.email || session?.email || '',
              zona_preferida: data.zona_preferida || '',
              presupuesto: parseInt(data.presupuesto) || null,
              quiere_botellas: !!data.quiere_botellas,
              quiere_decoracion: !!data.quiere_decoracion,
              fecha_nacimiento: data.fecha_nacimiento || '',
              comentario: (data.tipo_servicio ? data.tipo_servicio + ' — ' : '') + (data.mensaje || ''),
              invitados,
            } };
      const { data: resp, error } = await sb.functions.invoke('crm-solicitud', { body: bodyReq });
      if (error) {
        // El motivo real viene en el cuerpo (p. ej. «RUT inválido para: …»);
        // error.message es siempre el genérico de supabase-js y no dice nada.
        let m = error.message || 'No se pudo enviar la solicitud.';
        try { const c = await error.context?.json?.(); if (c?.error) m = c.error; } catch (_) {}
        throw new Error(m);
      }
      if (resp && resp.error) throw new Error(resp.error);

      // ⚠️ `ok:true` NO significa que se haya guardado. Si ya hay una solicitud
      //    abierta de esta persona para esa misma noche, el servidor responde
      //    ok:true con `ya:true` y NO crea nada. Antes se seguía de largo: se
      //    abría WhatsApp y el toast decía «Solicitud registrada», así que la
      //    persona se iba convencida de estar anotada y la ficha no existía.
      //    No se hace form.reset() a propósito: si quiere cambiar la fecha,
      //    al reabrir encuentra sus datos donde los dejó.
      if (resp && resp.ya) {
        showToast('👋 ' + (resp.msg || 'Ya tenemos tu solicitud y la estamos viendo.'));
        closeReservaPopup();
        return;
      }

      // 2) Abrir WhatsApp con el mensaje pre-llenado
      const msg = encodeURIComponent(
        `*Solicitud Frate*\n${data.tipo_servicio}\n\nNombre: ${data.nombre}\nTeléfono: ${data.telefono}\nFecha: ${data.fecha}\nPersonas: ${data.personas}\nMensaje: ${data.mensaje || '-'}`
      );
      window.open(`https://wa.me/${FRATE_CONFIG.whatsapp}?text=${msg}`, '_blank');

      showToast('✅ Solicitud registrada — te contactaremos pronto 🔥');
      closeReservaPopup();
      form.reset();
    } catch (err) {
      console.error('[FRATE] Error en reserva:', err);
      showToast('⚠️ ' + (err?.message || 'Error al enviar la reserva.'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = txtOrig || 'ENVIAR SOLICITUD'; }
    }
  });
}

// ══ LISTAS GRATUITAS: inscripción pública ═════════════════════
async function openListasPopup() {
  const popup = document.getElementById('listas-popup');
  const body = document.getElementById('listas-pub-body');
  if (!popup || !body) return;
  popup.classList.add('open');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div style="color:var(--gris);padding:12px;">Cargando listas…</div>';
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: listas } = await sb.from('listas').select('id,nombre,fecha,valido_hasta')
      .eq('estado', 'aprobada').gte('fecha', hoy).order('fecha').limit(10);
    const abiertas = (listas || []).filter(l => !l.valido_hasta || new Date(l.valido_hasta) > new Date());
    if (!abiertas.length) {
      body.innerHTML = '<div style="color:var(--gris);padding:16px;text-align:center;">Por ahora no hay listas abiertas.<br/><span style="font-size:0.75rem;">Síguenos en Instagram para enterarte cuando se abran 📢</span></div>';
      return;
    }
    body.innerHTML = abiertas.map(l => `
      <div style="background:var(--negro-3);border:1px solid #1a1a1c;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <b style="color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;letter-spacing:1px;">${l.nombre}</b>
          <span style="font-size:0.7rem;color:var(--dorado);">${l.fecha}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;margin-bottom:8px;">
          <input type="text" id="li-nombre-${l.id}" placeholder="Nombre y apellido" style="width:100%;box-sizing:border-box;" />
          <input type="text" id="li-rut-${l.id}" placeholder="RUT" style="width:100%;box-sizing:border-box;" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <input type="tel" id="li-tel-${l.id}" placeholder="Teléfono" style="width:100%;box-sizing:border-box;" />
          <input type="email" id="li-email-${l.id}" placeholder="Email (para tu QR)" style="width:100%;box-sizing:border-box;" />
        </div>
        <button onclick="inscribirListaPub(${l.id}, this)" style="width:100%;background:var(--rojo);border:none;color:#fff;padding:11px;font-family:'Barlow Condensed',sans-serif;font-weight:900;letter-spacing:2px;text-transform:uppercase;border-radius:2px;cursor:pointer;">Anotarme 📋</button>
      </div>`).join('');
  } catch (e) {
    body.innerHTML = '<div style="color:#f87171;padding:12px;">No se pudieron cargar las listas.</div>';
  }
}
function closeListasPopup() {
  document.getElementById('listas-popup')?.classList.remove('open');
  document.body.style.overflow = '';
}
async function inscribirListaPub(listaId, btn) {
  const v = id => (document.getElementById(id + '-' + listaId)?.value || '').trim();
  const nombre = v('li-nombre'), rut = v('li-rut'), tel = v('li-tel'), email = v('li-email');
  if (!nombre) { showToast('⚠️ Escribe tu nombre'); return; }
  if (!rut && !tel && !email) { showToast('⚠️ Deja al menos un dato de contacto'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Anotando...'; }
  try {
    const { data: resp, error } = await sb.functions.invoke('crm-solicitud', {
      body: { accion: 'inscribir_lista', payload: { lista_id: listaId, nombre, rut, telefono: tel, email } },
    });
    if (error) throw new Error(error.message || 'Error');
    if (resp && resp.error) throw new Error(resp.error);
    if (btn) { btn.textContent = '✅ ¡Anotad@! Te avisamos por correo'; btn.style.background = '#22c55e'; }
    showToast('📋 ¡Quedaste anotad@ en la lista!');
  } catch (e) {
    showToast('⚠️ ' + (e.message || 'No se pudo inscribir'));
    if (btn) { btn.disabled = false; btn.textContent = 'Anotarme 📋'; }
  }
}

// ══ Cancelar reserva/cumpleaños desde Mi cuenta ═══════════════
async function cancelarReservaCliente(webId, btn) {
  if (!confirm('¿Cancelar esta solicitud? Se libera tu espacio y le avisamos al equipo.')) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelando...'; }
  try {
    const { data: resp, error } = await sb.functions.invoke('crm-solicitud', {
      body: { accion: 'cancelar', payload: { web_id: webId } },
    });
    if (error) throw new Error(error.message || 'Error');
    if (resp && resp.error) throw new Error(resp.error);
    showToast('✅ Solicitud cancelada');
    if (typeof cuentaCargarHistorial === 'function') cuentaCargarHistorial();
  } catch (e) {
    showToast('⚠️ ' + (e.message || 'No se pudo cancelar'));
    if (btn) { btn.disabled = false; btn.textContent = 'Cancelar'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initReservaPopups();
});
