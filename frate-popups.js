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

  popup.classList.add('open');
  document.body.style.overflow = 'hidden';
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
      // 1) Guardar reserva en Supabase
      if (typeof sbCrearReserva === 'function') {
        const session = Storage.get('frate_session');
        await sbCrearReserva({
          clienteId: session?.id || null,
          nombre:    data.nombre,
          email:     data.email || session?.email || '',
          telefono:  data.telefono,
          fecha:     data.fecha,
          tipo:      data.tipo_servicio,
          personas:  parseInt(data.personas) || 1,
          mensaje:   data.mensaje || ''
        });
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

document.addEventListener('DOMContentLoaded', () => {
  initReservaPopups();
});
