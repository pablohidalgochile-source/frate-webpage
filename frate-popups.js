// ============================================================
// FRATE POPUPS — Event detail, ticket personalization, reservas
// ============================================================

// ── EVENT DETAIL POPUP ────────────────────────────────────────
function openEventPopup(evId) {
  const ev = FRATE_EVENTOS.find(e => e.id === evId);
  if (!ev) return;

  const popup = document.getElementById('event-popup');
  if (!popup) return;

  // Populate
  document.getElementById('ep-nombre').textContent = ev.nombre;
  document.getElementById('ep-fecha').textContent = ev.fecha + ' · ' + ev.hora + ' hrs';
  document.getElementById('ep-djs').textContent = ev.djs.join(' · ');
  document.getElementById('ep-ambiente').textContent = ev.ambiente;
  document.getElementById('ep-anticipada').textContent = '$' + ev.precio_anticipada.toLocaleString('es-CL');
  document.getElementById('ep-general').textContent = '$' + ev.precio_general.toLocaleString('es-CL');

  // IG link
  const igLink = document.getElementById('ep-ig-link');
  if (igLink) igLink.href = FRATE_CONFIG.instagram;

  // Store ev id for buy flow
  popup.dataset.evid = evId;

  // Reset ticket section
  showTicketSelector(false);
  document.getElementById('ep-ticket-tipo').value = 'Anticipada';
  document.getElementById('ep-ticket-qty').value = 1;
  renderPersonalizacionForms(1);

  popup.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEventPopup() {
  document.getElementById('event-popup')?.classList.remove('open');
  document.body.style.overflow = '';
}

function showTicketSelector(show) {
  const sel = document.getElementById('ep-ticket-section');
  const btns = document.getElementById('ep-buy-btns');
  if (sel) sel.style.display = show ? 'block' : 'none';
  if (btns) btns.style.display = show ? 'none' : 'flex';
}

// ── TICKET PERSONALIZATION ────────────────────────────────────
function renderPersonalizacionForms(qty) {
  const container = document.getElementById('ep-personas-list');
  if (!container) return;
  container.innerHTML = Array.from({ length: qty }, (_, i) => `
    <div class="persona-form" style="background:var(--negro-3);border:1px solid #2a2a2c;border-radius:var(--radius);padding:16px;margin-bottom:10px;">
      <div style="font-size:0.65rem;letter-spacing:3px;text-transform:uppercase;color:var(--rojo);margin-bottom:12px;">
        Ticket #${i + 1}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nombre completo</label>
          <input type="text" class="persona-nombre" placeholder="Nombre del asistente" required
                 style="background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;color-scheme:dark;" />
        </div>
        <div class="form-group">
          <label>RUT</label>
          <input type="text" class="persona-rut" placeholder="12.345.678-9"
                 style="background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;" />
        </div>
      </div>
    </div>
  `).join('');
}

function initEventPopup() {
  // Close on backdrop click
  document.getElementById('event-popup')?.addEventListener('click', e => {
    if (e.target === document.getElementById('event-popup')) closeEventPopup();
  });
  document.getElementById('ep-close')?.addEventListener('click', closeEventPopup);

  // "Comprar entradas" button → show ticket selector
  document.getElementById('ep-open-tickets')?.addEventListener('click', () => {
    const session = Storage.get('frate_session');
    if (!session) {
      closeEventPopup();
      openAuthModal('login');
      showToast('Inicia sesión para comprar tickets.');
      return;
    }
    showTicketSelector(true);
  });

  // Qty change → re-render personalization forms
  document.getElementById('ep-ticket-qty')?.addEventListener('input', e => {
    let v = parseInt(e.target.value) || 1;
    v = Math.min(10, Math.max(1, v));
    e.target.value = v;
    renderPersonalizacionForms(v);
  });

  // Confirm → validate + add to cart
  document.getElementById('ep-confirm-tickets')?.addEventListener('click', () => {
    const popup = document.getElementById('event-popup');
    const evId = parseInt(popup.dataset.evid);
    const tipo = document.getElementById('ep-ticket-tipo').value;
    const qty = parseInt(document.getElementById('ep-ticket-qty').value) || 1;

    // Validate all names filled
    const nombres = [...document.querySelectorAll('.persona-nombre')].map(i => i.value.trim());
    const ruts = [...document.querySelectorAll('.persona-rut')].map(i => i.value.trim());

    if (nombres.some(n => !n)) {
      showToast('Por favor asigna un nombre a cada ticket.');
      return;
    }

    // Add to cart with personalization
    const ev = FRATE_EVENTOS.find(e => e.id === evId);
    if (!ev) return;
    const precio = tipo === 'Anticipada' ? ev.precio_anticipada : ev.precio_general;

    // Remove existing same event+tipo item and replace
    const existIdx = cart.findIndex(i => i.eventoId === evId && i.tipo === tipo);
    if (existIdx >= 0) cart.splice(existIdx, 1);

    cart.push({
      eventoId: evId,
      tipo,
      cantidad: qty,
      precio,
      nombre: ev.nombre,
      fecha: ev.fecha,
      hora: ev.hora,
      ambiente: ev.ambiente,
      personas: nombres.map((n, i) => ({ nombre: n, rut: ruts[i] || '' }))
    });

    saveCart();
    updateCartBadge();
    renderCartItems();
    syncFloatingCount();

    // Bounce animation
    const cartBtn = document.getElementById('nav-cart-btn');
    if (cartBtn) { cartBtn.classList.add('cart-bounce'); setTimeout(() => cartBtn.classList.remove('cart-bounce'), 300); }

    closeEventPopup();
    showToast(`🎟️ ${qty} entrada${qty > 1 ? 's' : ''} de ${ev.nombre} agregada${qty > 1 ? 's' : ''} al carrito`);
  });
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

  document.getElementById('rp-emoji').textContent = svc.emoji;
  document.getElementById('rp-titulo').textContent = svc.titulo;
  document.getElementById('rp-titulo').style.color = svc.color;
  document.getElementById('rp-desc').textContent = svc.descripcion;
  document.getElementById('rp-detalles').innerHTML = svc.detalles.map(d =>
    `<li style="padding:6px 0;border-bottom:1px solid #1a1a1c;font-size:0.85rem;color:var(--gris);display:flex;gap:10px;align-items:center;">
      <span style="color:${svc.color}">✓</span> ${d}
    </li>`
  ).join('');

  // Set hidden tipo field
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

  // Form submit in popup
  document.getElementById('rp-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const msg = encodeURIComponent(
      `*Solicitud Frate*\n${data.tipo_servicio}\n\nNombre: ${data.nombre}\nTeléfono: ${data.telefono}\nFecha: ${data.fecha}\nPersonas: ${data.personas}\nMensaje: ${data.mensaje || '-'}`
    );
    window.open(`https://wa.me/${FRATE_CONFIG.whatsapp}?text=${msg}`, '_blank');
    showToast('¡Solicitud enviada vía WhatsApp! Te contactaremos pronto 🔥');
    closeReservaPopup();
    e.target.reset();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEventPopup();
  initReservaPopups();
});
