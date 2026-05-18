// ============================================================
// FRATE CUENTA / TIENDITA / CARTA — Lógica v3
// ============================================================

// ── RUT FORMATTER ─────────────────────────────────────────────
function formatRUT(val) {
  let v = val.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  const dv = v.slice(-1);
  let body = v.slice(0, -1).replace(/^0+/, '');
  body = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return body + '-' + dv;
}

function applyRUTFormat(input) {
  input.addEventListener('input', function() {
    const pos = this.selectionStart;
    const raw = this.value;
    this.value = formatRUT(raw);
  });
}

// ── RUT VALIDATOR ─────────────────────────────────────────────
// Valida dígito verificador del RUT chileno.
// Acepta formatos: "12.345.678-9", "12345678-9", "12345678K", etc.
// Devuelve true si el RUT es válido o está vacío (campo opcional).
function validarRut(rut) {
  if (!rut || rut.trim() === '') return true; // vacío = opcional, no bloquear
  const clean = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
  if (clean.length < 2) return false;
  const cuerpo = clean.slice(0, -1);
  const dv     = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }
  const dvCalc = 11 - (suma % 11);
  const dvEsperado = dvCalc === 11 ? '0' : dvCalc === 10 ? 'K' : String(dvCalc);
  return dv === dvEsperado;
}

function applyPhoneFormat(input) {
  if (!input.value || input.value === '') input.value = '+569 ';
  input.addEventListener('focus', function() {
    if (!this.value.startsWith('+569')) this.value = '+569 ' + this.value.replace(/^\+?569?\s?/, '');
  });
  input.addEventListener('input', function() {
    if (!this.value.startsWith('+569')) this.value = '+569 ';
  });
}

// ── PRE-FILL ALL FORMS FROM SESSION ──────────────────────────
function prefillFormsFromSession() {
  const session = Storage.get('frate_session');
  if (!session) return;
  document.querySelectorAll('[data-prefill]').forEach(el => {
    const key = el.dataset.prefill;
    if (session[key] !== undefined && session[key] !== null && session[key] !== '') {
      el.value = session[key];
    }
  });
  // RUT format on all RUT fields
  document.querySelectorAll('[data-prefill="rut"], .rut-field').forEach(applyRUTFormat);
  // Phone default
  document.querySelectorAll('[data-prefill="telefono"], .tel-field').forEach(applyPhoneFormat);
}

// ── MI CUENTA PANEL ───────────────────────────────────────────
let cuentaTab = 'perfil';

function openCuenta() {
  const session = Storage.get('frate_session');
  if (!session) { openAuthModal('login'); return; }
  document.getElementById('cuenta-backdrop')?.classList.add('open');
  document.getElementById('cuenta-panel')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCuenta(session);
  showCuentaTab(cuentaTab);
}

function closeCuenta() {
  document.getElementById('cuenta-backdrop')?.classList.remove('open');
  document.getElementById('cuenta-panel')?.classList.remove('open');
  document.body.style.overflow = '';
}

function showCuentaTab(tab) {
  cuentaTab = tab;
  document.querySelectorAll('.cuenta-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cuenta-tab-panel').forEach(p => p.style.display = 'none');
  document.querySelector(`.cuenta-tab[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`cuenta-panel-${tab}`)?.style.setProperty('display', 'block');
  // Cargar historial desde Supabase cuando se abre la tab de tickets
  if (tab === 'tickets' && typeof cuentaCargarHistorial === 'function') {
    cuentaCargarHistorial();
  }
}

function renderCuenta(session) {
  // Avatar con iniciales
  const nombre = session.nombres || session.nombre || '';
  const apellido = session.apellidos || '';
  const initials = ((nombre[0] || '') + (apellido[0] || nombre[1] || '')).toUpperCase() || 'FT';
  const avatar  = document.getElementById('cuenta-avatar');
  const nameEl  = document.getElementById('cuenta-user-name');
  const emailEl = document.getElementById('cuenta-user-email');
  if (avatar)  avatar.textContent  = initials;
  if (nameEl)  nameEl.textContent  = session.username ? '@' + session.username : (nombre + ' ' + apellido).trim() || '—';
  if (emailEl) emailEl.textContent = session.email || '—';

  // Puntos
  const puntos = calcularPuntos(session);
  const puntosEl = document.getElementById('cuenta-puntos');
  if (puntosEl) puntosEl.textContent = puntos + ' pts';
  const puntosValorEl = document.getElementById('puntos-valor');
  if (puntosValorEl) puntosValorEl.textContent = puntos;

  // Campos de perfil
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('cp-username',  session.username  || '');
  set('cp-nombres',   session.nombres   || '');
  set('cp-apellidos', session.apellidos || '');
  set('cp-email',     session.email     || '');
  set('cp-rut',       session.rut       || '');
  set('cp-tel',       session.telefono  || '');

  // Institución — seleccionar en el dropdown
  const instSel = document.getElementById('cp-inst');
  if (instSel && session.universidad) {
    instSel.value = session.universidad;
    if (instSel.value !== session.universidad) {
      // Valor no existe aún → añadir temporalmente
      const opt = document.createElement('option');
      opt.value = session.universidad; opt.textContent = session.universidad;
      instSel.appendChild(opt); instSel.value = session.universidad;
    }
    if (typeof cuentaCarreras === 'function') cuentaCarreras(instSel);
    // Seleccionar carrera después de poblar
    setTimeout(() => {
      const carSel = document.getElementById('cp-carrera');
      if (carSel && session.carrera) carSel.value = session.carrera;
    }, 50);
  }

  // Historial y membresías
  renderHistorialPuntos(session);
  renderMembresias(session);
}

function calcularPuntos(session) {
  const orders = Storage.get('frate_orders') || [];
  const userOrders = orders.filter(o => o.comprador?.email === session.email);
  return userOrders.reduce((sum, o) => sum + Math.floor(o.total / 100), 0);
}

function renderHistorialTickets(session) {
  const container = document.getElementById('historial-tickets-list');
  if (!container) return;
  const orders = Storage.get('frate_orders') || [];
  const userOrders = orders.filter(o => o.comprador?.email === session.email).reverse();
  if (!userOrders.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--gris);">
      <div style="font-size:2rem;margin-bottom:8px;">🎟️</div>
      <div>Aún no has comprado tickets</div>
    </div>`;
    return;
  }
  container.innerHTML = userOrders.map(o => `
    <div class="historial-item">
      <div class="historial-item-icon">🎟️</div>
      <div class="historial-item-info">
        <div class="historial-item-nombre">${o.items?.[0]?.nombre || '—'}</div>
        <div class="historial-item-meta">${o.id} · ${o.items?.reduce((s,i)=>s+i.cantidad,0)} entrada(s) · ${new Date(o.fecha).toLocaleDateString('es-CL')}</div>
        <button class="historial-reprint" onclick="reprintTicket('${o.id}')">🖨️ Reimprimir ticket</button>
      </div>
      <div class="historial-item-precio">${formatCLP(o.total)}</div>
    </div>
  `).join('');
}

function renderHistorialPuntos(session) {
  const container = document.getElementById('puntos-history-list');
  if (!container) return;
  const orders = Storage.get('frate_orders') || [];
  const userOrders = orders.filter(o => o.comprador?.email === session.email);
  if (!userOrders.length) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--gris);font-size:0.82rem;">Compra tickets para ganar puntos</div>`;
    return;
  }
  container.innerHTML = userOrders.reverse().map(o => `
    <div class="puntos-row">
      <span class="puntos-row-label">Compra ${o.id} · ${o.items?.[0]?.nombre}</span>
      <span class="puntos-row-val positivo">+${Math.floor(o.total / 100)} pts</span>
    </div>
  `).join('');
}

function renderMembresias(session) {
  const container = document.getElementById('membresias-list');
  if (!container || typeof FRATE_MEMBRESIAS === 'undefined') return;
  container.innerHTML = FRATE_MEMBRESIAS.map(m => `
    <div class="membresia-card ${session.membresia === m.id ? 'activa' : ''}" onclick="suscribirMembresia('${m.id}')">
      <div class="membresia-nombre">${m.nombre}</div>
      <div class="membresia-precio">${formatCLP(m.precio)} <small>/mes</small></div>
      <ul class="membresia-beneficios">
        ${m.beneficios.map(b => `<li>${b}</li>`).join('')}
      </ul>
      ${session.membresia === m.id ? '' : `<button class="btn-rojo" style="margin-top:16px;width:100%;border:none;cursor:pointer;padding:12px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1rem;letter-spacing:2px;text-transform:uppercase;border-radius:2px;">SUSCRIBIRME</button>`}
    </div>
  `).join('');
}

function suscribirMembresia(id) {
  const session = Storage.get('frate_session');
  if (!session) return;
  session.membresia = id;
  Storage.set('frate_session', session);
  renderMembresias(session);
  showToast('🌟 Membresía activada — ¡bienvenido a la familia!');
}

function savePerfil() {
  // Delegar a la función global que también guarda en Supabase
  if (typeof cuentaGuardarPerfil === 'function') {
    cuentaGuardarPerfil();
  }
}

function reprintTicket(orderId) {
  const orders = Storage.get('frate_orders') || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) { showToast('Ticket no encontrado'); return; }
  closeCuenta();
  showTicket(order);
}

// ── INIT MI CUENTA ────────────────────────────────────────────
function initCuenta() {
  document.getElementById('cuenta-backdrop')?.addEventListener('click', closeCuenta);
  document.getElementById('cuenta-close-btn')?.addEventListener('click', closeCuenta);
  document.querySelectorAll('.cuenta-tab').forEach(tab => {
    tab.addEventListener('click', () => showCuentaTab(tab.dataset.tab));
  });
  document.getElementById('save-perfil-btn')?.addEventListener('click', savePerfil);

  // RUT + phone auto-format
  document.querySelectorAll('.rut-field').forEach(applyRUTFormat);
  document.querySelectorAll('.tel-field').forEach(applyPhoneFormat);
}

// ── TIENDITA ─────────────────────────────────────────────────
// initTiendita() y openTiendaPopup() están definidas en index.html
// (versiones async que cargan desde Supabase y usan window._tiendaData).

function closeTiendaPopup() {
  document.getElementById('tienda-popup')?.classList.remove('open');
  document.body.style.overflow = '';
}

function selectTiendaOpt(el, type) {
  const parent = el.closest('.tiendita-selector');
  parent?.querySelectorAll('.ts-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}
// addTiendaToCart() está definida en index.html (usa window._tiendaData).

// ── CARTA ─────────────────────────────────────────────────────
// initCarta() y addCartaItemDirect() están definidas en index.html
// (versión async que carga desde Supabase).

// ── TICKET MULTI-TYPE POPUP (improved event popup) ────────────
function renderTicketTypes(ev) {
  const container = document.getElementById('ep-ticket-types');
  if (!container || !ev.tiposTicket) return;

  const visibles = ev.tiposTicket.filter(t => t.soloWeb && t.estado !== 'Oculto' && t.estado !== 'Cerrado' && t.estado !== 'Venta solo RRPP');

  container.innerHTML = visibles.map(tt => {
    const agotado = tt.disponible === 0 || tt.estado === 'Agotado';
    return `
    <div class="ticket-type-card ${agotado ? 'agotado' : ''}" data-ttid="${tt.id}" onclick="${agotado ? '' : `selectTicketType('${tt.id}', this)`}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div style="font-family:var(--fuente-display);font-weight:700;font-size:1rem;color:${agotado ? 'var(--gris)' : 'var(--blanco)'};">${tt.nombre}</div>
        <span style="font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;padding:3px 8px;border-radius:2px;background:${agotado ? 'rgba(113,113,122,0.2)' : 'rgba(34,197,94,0.1)'};color:${agotado ? 'var(--gris)' : '#22c55e'};border:1px solid ${agotado ? '#333' : 'rgba(34,197,94,0.3)'};">${agotado ? 'Agotado' : tt.estado}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--gris);margin-bottom:10px;">${tt.descripcion}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-family:var(--fuente-display);font-weight:900;font-size:1.4rem;color:${agotado ? 'var(--gris)' : 'var(--dorado)'};">${tt.precio === 0 ? 'Gratis' : formatCLP(tt.precio)}</div>
        ${!agotado ? `
        <div class="ticket-qty-inline" style="display:flex;align-items:center;gap:8px;">
          <button class="qty-btn" onclick="event.stopPropagation();changeTicketTypeQty('${tt.id}',-1)">−</button>
          <span class="qty-num" id="qty-${tt.id}" style="min-width:24px;text-align:center;">0</span>
          <button class="qty-btn" onclick="event.stopPropagation();changeTicketTypeQty('${tt.id}',1)">+</button>
        </div>` : ''}
      </div>
      ${!agotado ? `<div style="font-size:0.65rem;color:#555;margin-top:6px;">${tt.disponible} disponibles · máx. ${tt.maxPorCompra} por compra</div>` : ''}
    </div>`;
  }).join('');

  if (!visibles.length) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gris);">No hay tickets disponibles para este evento</div>`;
  }
}

// ticketTypeQtys se almacena en window para que el listener de index.html
// pueda leerlo al momento de re-renderizar los formularios de personas.
// NO declarar con let/const para que window.ticketTypeQtys sea la única copia.

function changeTicketTypeQty(ttId, delta) {
  if (!window.ticketTypeQtys) window.ticketTypeQtys = {};
  // Comparar como string para tolerar id numérico vs string (Supabase integer vs onclick string)
  const sid = String(ttId);
  const ev = FRATE_EVENTOS.find(e => e.tiposTicket?.some(t => String(t.id) === sid));
  const tt = ev?.tiposTicket?.find(t => String(t.id) === sid);
  if (!tt) return;
  window.ticketTypeQtys[sid] = window.ticketTypeQtys[sid] || 0;
  window.ticketTypeQtys[sid] = Math.min(tt.maxPorCompra, Math.max(0, window.ticketTypeQtys[sid] + delta));
  const el = document.getElementById('qty-' + sid);
  if (el) el.textContent = window.ticketTypeQtys[sid];
  // Actualizar total + formularios de personas
  updateTicketTotal(ev);
  // Sincronizar formularios de personas (el listener de index.html usa window.ticketTypeQtys)
  const totalQty = (ev.tiposTicket || []).reduce((s, t2) => s + (window.ticketTypeQtys[String(t2.id)] || 0), 0);
  if (typeof renderPersonalizacionFormsV3 === 'function') renderPersonalizacionFormsV3(totalQty);
}

function updateTicketTotal(ev) {
  let total = 0;
  let qty = 0;
  (ev.tiposTicket || []).forEach(tt => {
    const q = (window.ticketTypeQtys || {})[String(tt.id)] || 0;
    total += q * tt.precio;
    qty += q;
  });
  const totalEl = document.getElementById('ep-ticket-total');
  if (totalEl) totalEl.textContent = qty > 0 ? `Total: ${formatCLP(total)} · ${qty} entrada${qty > 1 ? 's' : ''}` : '';
}

function selectTicketType(ttId, el) { /* visual selection handled via qty */ }

// Override ep-confirm-tickets to handle multi-type
function confirmMultiTickets() {
  const popup = document.getElementById('event-popup');
  const evId = parseInt(popup?.dataset.evid);
  const ev = FRATE_EVENTOS.find(e => e.id === evId);
  if (!ev) return;

  const qtys = window.ticketTypeQtys || {};
  const selected = (ev.tiposTicket || []).filter(tt => (qtys[String(tt.id)] || 0) > 0);
  if (!selected.length) { showToast('Selecciona al menos 1 entrada.'); return; }

  const totalQty = selected.reduce((s, tt) => s + qtys[String(tt.id)], 0);
  const personas = [...document.querySelectorAll('.persona-nombre')].map((inp, i) => ({
    nombre: inp.value.trim(),
    rut: document.querySelectorAll('.persona-rut')[i]?.value.trim() || '',
    email: document.querySelectorAll('.persona-email')[i]?.value.trim() || ''
  }));

  // Validar que cada entrada tenga nombre
  if (personas.some(p => !p.nombre)) { showToast('⚠️ Asigna nombre a cada entrada.'); return; }

  // Validar RUTs — si se ingresó un RUT debe ser válido
  const rutsInvalidos = personas.filter(p => p.rut && !validarRut(p.rut));
  if (rutsInvalidos.length) {
    const idx = personas.findIndex(p => p.rut && !validarRut(p.rut));
    showToast(`⚠️ RUT inválido en la entrada #${idx + 1}. Revisa el dígito verificador.`);
    // Resaltar el campo con error
    const rutInputs = [...document.querySelectorAll('.persona-rut')];
    if (rutInputs[idx]) {
      rutInputs[idx].style.borderColor = '#ef4444';
      rutInputs[idx].focus();
      setTimeout(() => { rutInputs[idx].style.borderColor = '#333'; }, 3000);
    }
    return;
  }

  // Asignar personas en orden: Ticket#1 → primer tipo, Ticket#2... → segundo tipo, etc.
  let personaIdx = 0;
  selected.forEach(tt => {
    const qty = qtys[String(tt.id)];
    const thisPersonas = personas.slice(personaIdx, personaIdx + qty);
    personaIdx += qty;
    const existing = cart.findIndex(c => c.eventoId === evId && c.tipo === tt.nombre);
    if (existing >= 0) cart.splice(existing, 1);
    cart.push({
      eventoId: evId,
      tipo: tt.nombre,
      cantidad: qty,
      precio: tt.precio,
      nombre: ev.nombre,
      fecha: ev.fecha,
      hora: ev.hora,
      ambiente: ev.ambiente,
      ttId: tt.id,
      personas: thisPersonas
    });
  });

  saveCart(); updateCartBadge(); renderCartItems();
  window.ticketTypeQtys = {};
  closeEventPopup();
  showToast(`🎟️ ${totalQty} entrada${totalQty > 1 ? 's' : ''} agregada${totalQty > 1 ? 's' : ''} al carrito`);
}

// Renderiza un formulario de nombre+RUT por cada entrada seleccionada,
// agrupando por tipo de ticket para que quede claro a cuál pertenece cada persona.
function renderPersonalizacionFormsV3(qty) {
  const container = document.getElementById('ep-personas-list');
  if (!container) return;

  // Si no hay entradas, limpiar y salir
  if (!qty || qty === 0) { container.innerHTML = ''; return; }

  const session      = Storage.get('frate_session');
  const nombreCompleto = session
    ? ((session.nombres || '') + ' ' + (session.apellidos || '')).trim() || session.nombre || ''
    : '';

  // Obtener tipos de ticket del evento actual para saber el nombre de cada tipo
  const popup = document.getElementById('event-popup');
  const evId  = parseInt(popup?.dataset.evid);
  const ev    = FRATE_EVENTOS?.find(e => e.id === evId);
  const qtys  = window.ticketTypeQtys || {};

  let html = '';
  let globalIdx = 0; // índice global de ticket (para "Ticket #N" y para saber quién es el dueño)

  if (ev && ev.tiposTicket) {
    // Recorrer cada tipo de ticket en el mismo orden que se renderizaron las cards
    ev.tiposTicket.forEach(tt => {
      const count = qtys[String(tt.id)] || 0;
      for (let i = 0; i < count; i++) {
        const isOwn = globalIdx === 0 && !!session;
        html += buildPersonaForm(globalIdx, tt.nombre, isOwn, session, nombreCompleto);
        globalIdx++;
      }
    });
  } else {
    // Fallback: sin info de tipos (no debería ocurrir)
    for (let i = 0; i < qty; i++) {
      const isOwn = i === 0 && !!session;
      html += buildPersonaForm(i, null, isOwn, session, nombreCompleto);
    }
  }

  container.innerHTML = html;
  document.querySelectorAll('.persona-rut.rut-field').forEach(applyRUTFormat);
}

function buildPersonaForm(idx, tipoNombre, isOwn, session, nombreCompleto) {
  const etiqueta = tipoNombre
    ? `Ticket #${idx + 1} — ${tipoNombre}${isOwn ? ' — Tu entrada' : ''}`
    : `Ticket #${idx + 1}${isOwn ? ' — Tu entrada' : ''}`;

  return `
  <div style="background:var(--negro-3);border:1px solid #2a2a2c;border-radius:var(--radius);padding:16px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:0.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--rojo);font-weight:700;">
        ${etiqueta}
      </div>
      ${!isOwn ? `<span style="font-size:0.62rem;color:var(--gris);letter-spacing:1px;">Datos del asistente</span>` : ''}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nombre completo</label>
        <input type="text" class="persona-nombre" placeholder="Nombre y apellido"
               value="${isOwn ? nombreCompleto : ''}" required
               style="background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;" />
      </div>
      <div class="form-group">
        <label>RUT <span style="font-size:0.7rem;color:var(--gris);">(ej: 12.345.678-9)</span></label>
        <input type="text" class="persona-rut rut-field" placeholder="12.345.678-9"
               value="${isOwn && session ? session.rut || '' : ''}"
               style="background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;" />
      </div>
    </div>
    ${!isOwn ? `
    <div class="form-group" style="margin-top:10px;">
      <label>Email del invitado <span style="font-size:0.7rem;color:var(--gris);">(opcional)</span></label>
      <input type="email" class="persona-email" placeholder="email@ejemplo.com"
             style="background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;" />
    </div>` : `<input type="hidden" class="persona-email" value="${session?.email || ''}" />`}
  </div>`;
}

// ── GENERATE UNIQUE QR CODE ────────────────────────────────────
function generateUniqueTicketId(orderId, eventoId, userId, index) {
  const base = `${orderId}-${eventoId}-${userId || 'g'}-${index}`;
  const hash = base.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return `FCC-${Math.abs(hash).toString(36).toUpperCase().padStart(6,'0')}`;
}

function burnTicket(ticketUniqueId) {
  const burned = Storage.get('frate_burned_tickets') || [];
  if (burned.includes(ticketUniqueId)) return false; // already burned
  burned.push(ticketUniqueId);
  Storage.set('frate_burned_tickets', burned);
  return true;
}

function isTicketBurned(ticketUniqueId) {
  const burned = Storage.get('frate_burned_tickets') || [];
  return burned.includes(ticketUniqueId);
}

// ── INIT ─────────────────────────────────────────────────────
function initCuentaModule() {
  initCuenta();

  // Cargar tiendita y carta desde Supabase (funciones definidas en index.html)
  if (typeof initTiendita === 'function') initTiendita();
  if (typeof initCarta    === 'function') initCarta();

  // Tienda popup: cerrar al hacer click fuera o en el ×
  document.getElementById('tienda-popup')?.addEventListener('click', e => {
    if (e.target === document.getElementById('tienda-popup')) closeTiendaPopup();
  });
  document.getElementById('tp-close')?.addEventListener('click', closeTiendaPopup);
  // tp-add-cart-btn usa addTiendaToCart() definida en index.html (ya tiene el onclick)

  // Qty controls en popup de tiendita
  document.getElementById('tp-qty-up')?.addEventListener('click', () => {
    const el = document.getElementById('tp-qty');
    if (el) el.textContent = Math.min(10, parseInt(el.textContent) + 1);
  });
  document.getElementById('tp-qty-down')?.addEventListener('click', () => {
    const el = document.getElementById('tp-qty');
    if (el) el.textContent = Math.max(1, parseInt(el.textContent) - 1);
  });

  // Botón "Agregar al carrito" del popup de eventos
  // (index.html también lo wires en su DOMContentLoaded, esto es respaldo)
  const epConfBtn = document.getElementById('ep-confirm-tickets');
  if (epConfBtn && !epConfBtn._bound) {
    epConfBtn.addEventListener('click', confirmMultiTickets);
    epConfBtn._bound = true;
  }

  // Nav user button → abre Mi Cuenta si logueado, login si no
  const navUserBtn = document.getElementById('nav-user-btn');
  if (navUserBtn) {
    navUserBtn.onclick = null; // limpia cualquier handler previo
    navUserBtn.addEventListener('click', () => {
      const session = Storage.get('frate_session');
      if (session) openCuenta();
      else if (typeof openAuthModal === 'function') openAuthModal('login');
    });
  }
}

document.addEventListener('DOMContentLoaded', initCuentaModule);
