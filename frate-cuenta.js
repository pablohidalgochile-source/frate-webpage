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
  if (tab === 'promos' && typeof renderPromos === 'function') {
    renderPromos();
  }
  if (tab === 'puntos' && typeof renderPuntosCuenta === 'function') {
    renderPuntosCuenta();
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

  // Puntos (reales desde la BD)
  const puntosEl = document.getElementById('cuenta-puntos');
  const puntosValorEl = document.getElementById('puntos-valor');
  if (session.id && typeof sb !== 'undefined') {
    sb.from('clientes').select('puntos').eq('id', session.id).maybeSingle().then(({ data }) => {
      const pts = (data?.puntos || 0);
      if (puntosEl) puntosEl.textContent = pts.toLocaleString('es-CL') + ' pts';
      if (puntosValorEl) puntosValorEl.textContent = pts.toLocaleString('es-CL');
    });
  } else if (puntosEl) { puntosEl.textContent = '0 pts'; }

  // Campos de perfil
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('cp-username',  session.username  || '');
  set('cp-nombres',   session.nombres   || '');
  try { _pintarSexoCuenta(session); } catch (_) {}
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
  if (typeof checkCumple === 'function') checkCumple(session);
  renderLoyalty(session);
}

// ── LOYALTY: nivel de cliente frecuente (visitas reales en puerta) ──
async function renderLoyalty(session) {
  if (typeof sb === 'undefined' || !session || !session.id) return;
  let host = document.getElementById('cuenta-loyalty');
  if (!host) {
    const hdr = document.getElementById('cuenta-header');
    if (!hdr) return;
    host = document.createElement('div'); host.id = 'cuenta-loyalty';
    host.style.cssText = 'margin:0 20px 6px;';
    hdr.insertAdjacentElement('afterend', host);
  }
  try {
    const { data } = await sb.rpc('mi_loyalty');
    if (!data || data.error) { host.innerHTML = ''; return; }
    const v = data.visitas || 0, niv = data.nivel || 'nuevo';
    const META = {
      nuevo:     { icon:'🎧', label:'Nuevo',     color:'#9a9aa2', ben:`Llevas <b>${v}</b> visita${v===1?'':'s'}. A las <b>${v + (data.faltan_frecuente||5)}</b> te haces Frecuente y ganas beneficios 🔥` },
      frecuente: { icon:'⭐', label:'Frecuente', color:'#D4A832', ben:'Entrada de cortesía hasta 01:00 · 2x1 en tragos los jueves · invita 3 amig@s sin costo los jueves' },
      vip:       { icon:'👑', label:'VIP',       color:'#E8363D', ben:'Todo lo Frecuente + VIP de cortesía cada 5 visitas · zona reservada · acceso anticipado a eventos' },
    };
    const m = META[niv] || META.nuevo;
    host.innerHTML = `<div style="background:linear-gradient(135deg,rgba(212,168,50,.12),rgba(232,54,61,.05));border:1px solid ${m.color}55;border-radius:14px;padding:13px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:800;font-size:0.98rem;color:#fff;">${m.icon} Cliente <span style="color:${m.color};">${m.label}</span></div>
        <div style="font-size:0.76rem;color:#9a9aa2;">${v} visita${v===1?'':'s'}</div>
      </div>
      <div style="font-size:0.8rem;color:#e9e9ee;margin-top:6px;line-height:1.5;">${m.ben}</div>
    </div>`;
  } catch (e) { /* sin loyalty (falta correr frate-loyalty.sql) */ }
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

async function renderMembresias(session) {
  const container = document.getElementById('membresias-list');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--gris);padding:16px;">Cargando...</div>';
  try {
    const [{ data: cli }, { data: mems }] = await Promise.all([
      sb.from('clientes').select('membresia_nombre, membresia_hasta').eq('id', session.id).maybeSingle(),
      sb.from('membresias').select('*').eq('activo', true).order('orden').order('precio')
    ]);
    let html = '';
    const activa = cli?.membresia_hasta && new Date(cli.membresia_hasta) > new Date();
    if (activa) {
      const hasta = new Date(cli.membresia_hasta).toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' });
      html += `<div style="background:linear-gradient(90deg,rgba(212,168,50,0.15),var(--negro-3));border:1px solid rgba(212,168,50,0.4);border-radius:8px;padding:18px;margin-bottom:16px;">
        <div style="color:var(--dorado);font-weight:900;font-family:var(--fuente-display);font-size:1.2rem;">👑 ${cli.membresia_nombre}</div>
        <div style="color:var(--gris);font-size:0.85rem;margin-top:4px;">Activa hasta el ${hasta}</div>
      </div>`;
    }
    if (!mems || !mems.length) {
      container.innerHTML = html + '<div style="color:var(--gris);padding:16px;">No hay membresías disponibles por ahora.</div>';
      return;
    }
    html += mems.map(m => {
      const benes = (m.beneficios || '').split('\n').filter(Boolean);
      return `<div class="membresia-card">
        <div class="membresia-nombre">${m.nombre}</div>
        <div class="membresia-precio">${formatCLP(m.precio)} <small>pago único</small></div>
        <ul class="membresia-beneficios">${benes.map(b => `<li>${b}</li>`).join('')}</ul>
        <button onclick="comprarMembresia(${m.id},this)" class="btn-rojo" style="margin-top:16px;width:100%;border:none;cursor:pointer;padding:12px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1rem;letter-spacing:2px;text-transform:uppercase;border-radius:2px;">${activa ? 'RENOVAR / CAMBIAR' : 'OBTENER'}</button>
      </div>`;
    }).join('');
    container.innerHTML = html;
  } catch(e) { container.innerHTML = '<div style="color:var(--gris);padding:16px;">No se pudo cargar.</div>'; }
}

async function comprarMembresia(id, btn) {
  const session = Storage.get('frate_session');
  if (!session?.id) { showToast('Inicia sesión para obtener tu membresía'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Generando pago...'; }
  try {
    const nombre = ((session.nombres||'') + ' ' + (session.apellidos||'')).trim() || session.nombre || session.username || 'Cliente';
    const { data, error } = await sb.functions.invoke('comprar-membresia', { body: { membresiaId: id, comprador: { nombre, email: session.email, clienteId: session.id } } });
    if (error) throw new Error(error.message || 'Error');
    if (data?.error) throw new Error(data.error);
    if (!data?.initPoint) throw new Error('No se pudo iniciar el pago.');
    window.location.href = data.initPoint;
  } catch(e) {
    showToast('⚠️ ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = 'OBTENER'; }
  }
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
  // Al abrir, los botones vuelven a su estado normal y se saca el aviso de
  // miembros de la vez anterior.
  { const bp=document.getElementById('ep-pagar-ahora'), bc=document.getElementById('ep-confirm-tickets'), bg=document.getElementById('ep-reservar-gratis'), av=document.getElementById('ep-aviso-miembros');
    if (bp) bp.style.display=''; if (bc) bc.style.display=''; if (bg) bg.style.display='none'; if (av) av.remove(); }

  // ⏳ Tramos de preventa: sólo el que está en su ventana AHORA. Sin esto la cabecera
  //    del popup decía «desde $16.000» (ya filtra) y la lista de abajo ofrecía los cuatro
  //    tramos a la vez, comprables, y el cliente llenaba nombre y RUT de cada asistente
  //    antes de que el servidor lo rechazara. El typeof es porque este archivo también lo
  //    carga comprar.html, que no define enVentana (ahí la lista ya viene filtrada).
  const visibles = ev.tiposTicket.filter(t => t.soloWeb && t.estado !== 'Oculto' && t.estado !== 'Cerrado' && t.estado !== 'Venta solo RRPP'
    && (typeof enVentana !== 'function' || enVentana(t)));

  if (!visibles.length) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gris);">No hay tickets disponibles para este evento</div>`;
    return;
  }

  // La tarjeta la arma frate-afiche.js — la MISMA que usa /e/... Antes esta
  // pantalla tenía su propia copia y por eso se quedó atrás en cada rediseño.
  // Lo único propio de acá es ticketVencido(), que sabe la fecha del evento.
  if (window.FrateAfiche) {
    FrateAfiche.estilos();
    // ¿el local está abierto AHORA? estadoEfectivoEvento() ya resuelve la ventana
    // 23:00→05:00 y el estado manual; no se recalcula acá para no tener dos
    // versiones de la misma hora.
    const _enVivo = (typeof estadoEfectivoEvento === 'function') && estadoEfectivoEvento(ev) === 'en_vivo';
    container.innerHTML = visibles.map(tt => {
      const cerrado = (typeof ticketVencido === 'function') && ticketVencido(ev, tt);
      // ⚠️ se pasa ev.tiposTicket COMPLETO, no `visibles`: `visibles` ya está
      //    filtrado por ventana y un tramo que abre mañana no estaría, con lo que
      //    parecería que no queda nada y mandaríamos gente a la puerta de más.
      const enPuerta = !!(FrateAfiche.enPuertaPara
                          && FrateAfiche.enPuertaPara(tt, ev.tiposTicket, { enVivo: _enVivo }));
      return FrateAfiche.entradaHTML(tt, {
        cerrado, enPuerta,
        cantidad: (window.ticketTypeQtys || {})[tt.id] || 0,
        onMenos: `changeTicketTypeQty('${tt.id}',-1)`,
        onMas:   `changeTicketTypeQty('${tt.id}',1)`,
        qtyId: 'qty-' + tt.id,          // changeTicketTypeQty busca este id
        precioTxt: tt.precio === 0 ? 'Gratis' : formatCLP(tt.precio)
      });
    }).join('');
    return;
  }

  // Respaldo sin el generador: la versión simple de siempre.
  container.innerHTML = visibles.map(tt => `
    <div class="ticket-type-card" data-ttid="${tt.id}">
      <div class="tt-head"><div class="tt-title">${tt.nombre}</div></div>
      <div class="tt-foot"><div class="tt-price">${tt.precio === 0 ? 'Gratis' : formatCLP(tt.precio)}</div>
        <div class="ticket-qty-inline" style="display:flex;align-items:center;gap:8px;">
          <button class="qty-btn" onclick="changeTicketTypeQty('${tt.id}',-1)">−</button>
          <span class="qty-num" id="qty-${tt.id}">0</span>
          <button class="qty-btn" onclick="changeTicketTypeQty('${tt.id}',1)">+</button>
        </div></div>
    </div>`).join('');
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
  // 🎁 Entrada solo para miembros: sin sesión no se suma. Se avisa AL TOCAR,
  // no al final: antes la persona llenaba todo y chocaba recién al pagar.
  if (delta > 0 && tt.solo_miembros) {
    if (!Storage.get('frate_session')) { _avisoMiembros(ev, tt); return; }
    // Con sesión: se revisa el perfil EN VIVO (nombre, RUT, sexo, institución)
    // antes de sumar. Si falta algo se pide ahí mismo.
    if (window.FratePerfil) { _sumarMiembro(ev, tt, sid); return; }
  }
  _aplicarQty(ev, tt, sid, delta);
}

function _aplicarQty(ev, tt, sid, delta) {
  window.ticketTypeQtys[sid] = window.ticketTypeQtys[sid] || 0;
  // La entrada de miembro va a nombre del dueño de la cuenta: una sola.
  const tope = tt.solo_miembros ? 1 : tt.maxPorCompra;
  window.ticketTypeQtys[sid] = Math.min(tope, Math.max(0, window.ticketTypeQtys[sid] + delta));
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
  if (totalEl) totalEl.textContent = qty > 0 ? `Total: ${total === 0 ? 'Gratis' : formatCLP(total)} · ${qty} entrada${qty > 1 ? 's' : ''}` : '';
  // Todo lo elegido es gratis → un solo botón «Reservar gratis», sin carrito
  // ni pago. Si se mezcla con una pagada, van juntas al pago como siempre.
  const soloGratis = qty > 0 && total === 0;
  const bPagar = document.getElementById('ep-pagar-ahora');
  const bCarro = document.getElementById('ep-confirm-tickets');
  const bGratis = document.getElementById('ep-reservar-gratis');
  if (bPagar) bPagar.style.display = soloGratis ? 'none' : '';
  if (bCarro) bCarro.style.display = soloGratis ? 'none' : '';
  if (bGratis) bGratis.style.display = soloGratis ? '' : 'none';
  if (qty > 0) { const av = document.getElementById('ep-aviso-miembros'); if (av) av.remove(); }
  _avisoMezcla(ev);
}

// La cortesía de miembro se reserva sola: si se elige junto a otra entrada,
// se avisa apenas pasa (el servidor igual lo rechaza con NO_MEZCLAR).
function _esCortesiaMiembro(tt) { return !!tt.solo_miembros && !(tt.precio > 0); }
function _hayMezcla(ev) {
  const q = window.ticketTypeQtys || {};
  const sel = (ev.tiposTicket || []).filter(t => (q[String(t.id)] || 0) > 0);
  return sel.some(_esCortesiaMiembro) && sel.some(t => !_esCortesiaMiembro(t));
}
function _avisoMezcla(ev) {
  const viejo = document.getElementById('ep-aviso-mezcla');
  if (!_hayMezcla(ev)) { if (viejo) viejo.remove(); return; }
  if (viejo) return;
  const total = document.getElementById('ep-ticket-total');
  if (!total) return;
  const av = document.createElement('div');
  av.id = 'ep-aviso-mezcla';
  av.style.cssText = 'background:#241d06;border:1px solid #e0b53b;border-radius:10px;padding:12px;margin:0 0 12px;text-align:center;color:#f0e2b0;font-size:0.82rem;line-height:1.45;';
  av.innerHTML = '<b>🎁 Tu cortesía se reserva sola</b><br>Primero resérvala con 🎁 RESERVAR GRATIS (deja en 0 las demás) y después compra el resto.';
  total.parentNode.insertBefore(av, total.nextSibling);
}

function selectTicketType(ttId, el) { /* visual selection handled via qty */ }
// Despliega/oculta las condiciones de una entrada (tap en móvil; en compu también se ve al hover)
function _ttToggle(headEl){ const card = headEl && headEl.closest('.ticket-type-card'); if(card) card.classList.toggle('open'); }

// Override ep-confirm-tickets to handle multi-type
function confirmMultiTickets() {
  const popup = document.getElementById('event-popup');
  const evId = parseInt(popup?.dataset.evid);
  const ev = FRATE_EVENTOS.find(e => e.id === evId);
  if (!ev) return;
  // "Pagar ahora" pone este flag para saltar directo al checkout tras validar.
  const irAPagar = !!window._irAPagar; window._irAPagar = false;
  const reservarGratis = !!window._reservarGratis; window._reservarGratis = false;

  const qtys = window.ticketTypeQtys || {};
  const selected = (ev.tiposTicket || []).filter(tt => (qtys[String(tt.id)] || 0) > 0);
  if (!selected.length) { showToast('Selecciona al menos 1 entrada.'); return; }
  if (_hayMezcla(ev)) { _avisoMezcla(ev); showToast('🎁 Tu cortesía se reserva sola: deja en 0 las demás entradas.'); return; }
  const esMiembroIdx = [...document.querySelectorAll('.persona-nombre')].map(inp => inp.dataset.miembro === '1');
  const _pm = (window.FratePerfil && window.FratePerfil.persona()) || null;

  const totalQty = selected.reduce((s, tt) => s + qtys[String(tt.id)], 0);
  const personas = [...document.querySelectorAll('.persona-nombre')].map((inp, i) => ({
    nombre: inp.value.trim(),
    rut: document.querySelectorAll('.persona-rut')[i]?.value.trim() || '',
    email: document.querySelectorAll('.persona-email')[i]?.value.trim() || ''
  }));

  // TICKETS NOMINATIVOS: debe existir un formulario por cada entrada,
  // y TODAS deben llevar nombre + RUT válido (regla de la casa).
  if (personas.length < totalQty) {
    if (typeof renderPersonalizacionFormsV3 === 'function') renderPersonalizacionFormsV3(totalQty);
    showToast('⚠️ Completa nombre y RUT de cada entrada (todas son nominativas).');
    return;
  }
  if (personas.some(p => !p.nombre)) { showToast('⚠️ Asigna nombre a cada entrada — todas son nominativas.'); return; }
  if (personas.some(p => !p.rut)) {
    const idxSin = personas.findIndex(p => !p.rut);
    showToast(`⚠️ Falta el RUT en la entrada #${idxSin + 1}. Todas las entradas llevan nombre y RUT.`);
    const rutInputs2 = [...document.querySelectorAll('.persona-rut')];
    if (rutInputs2[idxSin]) { rutInputs2[idxSin].style.borderColor = '#ef4444'; rutInputs2[idxSin].focus(); setTimeout(() => { rutInputs2[idxSin].style.borderColor = '#333'; }, 3000); }
    return;
  }

  // Validar RUTs — deben ser válidos (dígito verificador)
  // Filas de miembro: el RUT viene de la cuenta (ya revisado al elegir). Un
  // extranjero usa documento, que no tiene dígito verificador.
  const _rutMalo = (p, i) => p.rut && !(esMiembroIdx[i] && _pm && _pm.extranjero) && !validarRut(p.rut);
  const rutsInvalidos = personas.filter(_rutMalo);
  if (rutsInvalidos.length) {
    const idx = personas.findIndex(_rutMalo);
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

  // Las filas de miembro se pisan con los datos de la cuenta (el servidor
  // igual usa los de la cuenta; esto es para que el carrito muestre lo mismo).
  if (_pm) esMiembroIdx.forEach((m, i) => { if (m && personas[i]) { personas[i].nombre = _pm.nombre; personas[i].rut = _pm.rut; personas[i].email = _pm.email; } });

  // 🎁 «Reservar gratis»: mismo armado de entradas, pero va directo a
  // reservar, sin pasar por el carrito ni por el checkout.
  if (reservarGratis) {
    let pi = 0;
    const items = selected.map(tt => {
      const qty = qtys[String(tt.id)];
      const ps = personas.slice(pi, pi + qty); pi += qty;
      return { eventoId: evId, tipo: tt.nombre, cantidad: qty, precio: tt.precio, nombre: ev.nombre,
               fecha: ev.fecha, hora: ev.hora, ambiente: ev.ambiente, ttId: tt.id, personas: ps };
    });
    _reservarGratisDirecto(ev, items);
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
  if (irAPagar && typeof openCheckout === 'function') {
    openCheckout();   // Pagar ahora → directo al checkout, sin pasar por el carrito
  } else {
    showToast(`🎟️ ${totalQty} entrada${totalQty > 1 ? 's' : ''} agregada${totalQty > 1 ? 's' : ''} al carrito`);
  }
}

// "Pagar ahora": valida + agrega al carrito + abre el checkout de una.
function pagarAhora() { window._irAPagar = true; confirmMultiTickets(); }
window.pagarAhora = pagarAhora;

// ── 🎁 ENTRADAS GRATIS PARA MIEMBROS ─────────────────────────────
function reservarGratis() { window._reservarGratis = true; confirmMultiTickets(); }
window.reservarGratis = reservarGratis;

// El aviso sale dentro de la misma ventana del evento, donde se tocó el ＋.
function _avisoMiembros(ev, tt) {
  const total = document.getElementById('ep-ticket-total');
  if (!total) { showToast('🔒 Esta entrada es solo para miembros: crea tu cuenta para adquirirla.'); return; }
  let av = document.getElementById('ep-aviso-miembros');
  if (!av) { av = document.createElement('div'); av.id = 'ep-aviso-miembros'; total.parentNode.insertBefore(av, total); }
  av.style.cssText = 'background:#241d06;border:1px solid #e0b53b;border-radius:10px;padding:14px;margin:0 0 14px;text-align:center;';
  const gratis = !(tt.precio > 0);
  const nom = String(tt.nombre || '').replace(/</g, '&lt;');
  av.innerHTML = '<div style="font-size:1.4rem;">🔒</div>'
    + '<div style="color:#f0e2b0;font-weight:700;margin-top:4px;">' + (gratis ? 'Crea tu cuenta para adquirir tu entrada gratis' : 'Esta entrada es solo para miembros') + '</div>'
    + '<div style="color:#b4a870;font-size:0.8rem;margin-top:4px;line-height:1.45;">«' + nom + '» es exclusiva para miembros de FRATE. Te toma un minuto y vuelves directo acá.</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">'
    + '<button type="button" onclick="_irACuentaDesdeEvento(' + ev.id + ',\'' + tt.id + '\',\'register\')" style="flex:1;min-width:140px;background:#E8363D;color:#fff;border:none;border-radius:8px;padding:11px;font-weight:800;cursor:pointer;">CREAR MI CUENTA</button>'
    + '<button type="button" onclick="_irACuentaDesdeEvento(' + ev.id + ',\'' + tt.id + '\',\'login\')" style="flex:1;min-width:140px;background:transparent;color:#E6C860;border:1px solid #E6C860;border-radius:8px;padding:11px;font-weight:700;cursor:pointer;">YA TENGO CUENTA</button>'
    + '</div>';
  try { av.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
}
async function _sumarMiembro(ev, tt, sid) {
  if (window._gateMiembroEnCurso) return;           // doble toque
  window._gateMiembroEnCurso = true;
  try {
    const r = await window.FratePerfil.exigir(tt);
    if (r.ok) { _aplicarQty(ev, tt, sid, 1); return; }
    if (r.motivo === 'SIN_SESION') { _avisoMiembros(ev, tt); return; }
    if (r.motivo === 'NO_CORRESPONDE') _avisoEnVentana('🚫', 'Esta entrada no es para tu perfil', r.texto);
  } catch (e) {
    showToast('⚠️ No pudimos revisar tu cuenta. Intenta de nuevo.');
  } finally { window._gateMiembroEnCurso = false; }
}
function _avisoEnVentana(icono, titulo, texto) {
  const total = document.getElementById('ep-ticket-total');
  if (!total) { showToast(icono + ' ' + titulo); return; }
  let av = document.getElementById('ep-aviso-miembros');
  if (!av) { av = document.createElement('div'); av.id = 'ep-aviso-miembros'; total.parentNode.insertBefore(av, total); }
  av.style.cssText = 'background:#2a1214;border:1px solid #E24B4A;border-radius:10px;padding:14px;margin:0 0 14px;text-align:center;';
  const e = v => String(v || '').replace(/</g, '&lt;');
  av.innerHTML = '<div style="font-size:1.3rem;">' + icono + '</div><div style="color:#f7c1c1;font-weight:700;margin-top:4px;">' + e(titulo) + '</div>'
    + '<div style="color:#f09595;font-size:0.8rem;margin-top:4px;line-height:1.45;">' + e(texto) + '</div>';
  try { av.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
}
function _irACuentaDesdeEvento(evId, ttId, tab) {
  try { sessionStorage.setItem('frate_volver_evento', evId + '|' + ttId); } catch (_) {}
  if (typeof closeEventPopup === 'function') closeEventPopup();
  if (typeof openAuthModal === 'function') openAuthModal(tab === 'login' ? 'login' : 'register');
}
// Al entrar o crear la cuenta, vuelve al mismo evento con la entrada ya elegida.
window.addEventListener('frate:sesion', () => {
  try { window.FratePerfil && window.FratePerfil.limpiar(); } catch (_) {}
  let v = null;
  try { v = sessionStorage.getItem('frate_volver_evento'); sessionStorage.removeItem('frate_volver_evento'); } catch (_) {}
  if (!v) return;
  const partes = v.split('|');
  setTimeout(() => {
    try { if (typeof closeAuthModal === 'function') closeAuthModal(); } catch (_) {}
    if (typeof openEventPopup !== 'function') return;
    openEventPopup(parseInt(partes[0]));
    setTimeout(() => { try { changeTicketTypeQty(partes[1], 1); } catch (_) {} }, 250);
  }, 400);
});

async function _reservarGratisDirecto(ev, items) {
  const s = Storage.get('frate_session');
  const btn = document.getElementById('ep-reservar-gratis');
  // Gratis pero sin sesión (una entrada gratis que NO es de miembros): va al
  // checkout normal, que con total $0 ya no muestra nada de pago.
  if (!s) {
    items.forEach(it => { const i = cart.findIndex(c => c.eventoId === it.eventoId && c.tipo === it.tipo); if (i >= 0) cart.splice(i, 1); cart.push(it); });
    saveCart(); updateCartBadge(); renderCartItems();
    window.ticketTypeQtys = {}; closeEventPopup();
    if (typeof openCheckout === 'function') openCheckout();
    return;
  }
  const p0 = (items[0] && items[0].personas && items[0].personas[0]) || {};
  const pm = (window.FratePerfil && window.FratePerfil.persona()) || null;
  const comprador = {
    nombre: (pm && pm.nombre) || ((s.nombres || '') + ' ' + (s.apellidos || '')).trim() || s.nombre || p0.nombre || '',
    email:  s.email || (pm && pm.email) || p0.email || '',
    tel:    s.telefono || '',
    rut:    (pm && pm.rut) || s.rut || p0.rut || '',
  };
  const txt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'RESERVANDO…'; }
  try {
    const { data, error } = await sb.functions.invoke('crear-pago', { body: { items, comprador, medio: 'mercadopago' } });
    if (error) {
      let m = error.message || 'No se pudo reservar.', code = null, faltan = null;
      try { const c = await error.context?.json?.(); if (c?.error) m = c.error; code = c?.code || null; faltan = c?.faltan || null; } catch (_) {}
      if (code === 'REQUIERE_CUENTA') {
        // La sesión guardada en el navegador venció: se pide entrar de nuevo
        // y al entrar vuelve a este mismo evento.
        _irACuentaDesdeEvento(ev.id, items[0] && items[0].ttId, 'login');
        showToast('🔒 Tu sesión venció. Entra de nuevo para reservar tu entrada gratis.');
        return;
      }
      // Faltan datos del perfil o la entrada no corresponde: se pide o se avisa
      // ahí mismo. No se reintenta solo, para no crear dos pedidos.
      if (code && window.FratePerfil && window.FratePerfil.esCodigo(code)) {
        const ttM = (ev.tiposTicket || []).find(t => t.solo_miembros && items.some(i => String(i.ttId) === String(t.id)));
        const listo = await window.FratePerfil.manejarCodigo(code, m, faltan, ttM);
        if (listo) {
          renderPersonalizacionFormsV3(items.reduce((n, i) => n + (i.cantidad || 0), 0));
          showToast('✅ Datos guardados. Aprieta 🎁 RESERVAR GRATIS otra vez.');
        }
        return;
      }
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);
    if (data?.freeOrder) {
      window.ticketTypeQtys = {};
      window.location.href = '/pago-exitoso.html?external_reference=' + data.pedidoId;
      return;
    }
    // No debería pasar: el botón solo aparece con total $0. Si el servidor
    // calculó un cobro, no se manda a pagar a escondidas.
    throw new Error('Esta reserva no salió gratis. Revisa las entradas elegidas.');
  } catch (err) {
    showToast('⚠️ ' + (err?.message || 'No se pudo reservar.'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = txt || '🎁 RESERVAR GRATIS'; }
  }
}

// Renderiza un formulario de nombre+RUT por cada entrada seleccionada,
// agrupando por tipo de ticket para que quede claro a cuál pertenece cada persona.
function renderPersonalizacionFormsV3(qty) {
  const container = document.getElementById('ep-personas-list');
  if (!container) return;

  // Conservar lo que la persona YA escribió antes de re-dibujar
  // (al cambiar la cantidad no se pierde ningún dato ingresado)
  const prev = [...container.querySelectorAll('.persona-nombre')].map((inp, i) => ({
    nombre: inp.value,
    rut:    container.querySelectorAll('.persona-rut')[i]?.value || '',
    email:  container.querySelectorAll('.persona-email')[i]?.value || ''
  }));

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
  const perM = (window.FratePerfil && window.FratePerfil.persona()) || null;
  const hayMiembro = !!session && (ev?.tiposTicket || []).some(t => t.solo_miembros && (qtys[String(t.id)] || 0) > 0);

  if (ev && ev.tiposTicket) {
    // Recorrer cada tipo de ticket en el mismo orden que se renderizaron las cards
    ev.tiposTicket.forEach(tt => {
      const count = qtys[String(tt.id)] || 0;
      for (let i = 0; i < count; i++) {
        const esM = !!session && !!tt.solo_miembros;
        const isOwn = hayMiembro ? esM : (globalIdx === 0 && !!session);
        html += buildPersonaForm(globalIdx, tt.nombre, isOwn, session, nombreCompleto,
          esM ? (perM || { nombre: nombreCompleto, rut: session.rut || '', email: session.email || '' }) : null);
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

  // Restaurar lo que ya se había escrito (por índice de ticket)
  if (prev.length) {
    const nombres = container.querySelectorAll('.persona-nombre');
    const ruts    = container.querySelectorAll('.persona-rut');
    const emails  = container.querySelectorAll('.persona-email');
    prev.forEach((p, i) => {
      if (nombres[i] && p.nombre && !nombres[i].readOnly) nombres[i].value = p.nombre;
      if (ruts[i]    && p.rut    && !ruts[i].readOnly)    ruts[i].value    = p.rut;
      if (emails[i]  && p.email)  emails[i].value  = p.email;
    });
  }

  document.querySelectorAll('.persona-rut.rut-field').forEach(applyRUTFormat);
}

function buildPersonaForm(idx, tipoNombre, isOwn, session, nombreCompleto, miembro) {
  if (miembro) {
    // Entrada de miembro: va a nombre del dueño de la cuenta y no se regala.
    const e = v => String(v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const inp = 'background:var(--negro);border:1px solid #333;color:var(--blanco);padding:10px 12px;font-family:var(--fuente-body);font-size:0.9rem;border-radius:var(--radius);width:100%;outline:none;opacity:.75;';
    return `
  <div style="background:var(--negro-3);border:1px solid #6b5a1e;border-radius:var(--radius);padding:16px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <div style="font-size:0.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--rojo);font-weight:700;">Ticket #${idx + 1}${tipoNombre ? ' — ' + e(tipoNombre) : ''}</div>
      <span style="font-size:0.62rem;color:#E6C860;letter-spacing:1px;white-space:nowrap;">🔒 Esta entrada es para ti</span>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nombre completo</label>
        <input type="text" class="persona-nombre" data-miembro="1" readonly value="${e(miembro.nombre)}" style="${inp}" /></div>
      <div class="form-group"><label>RUT</label>
        <input type="text" class="persona-rut" data-miembro="1" readonly value="${e(miembro.rut)}" style="${inp}" /></div>
    </div>
    <input type="hidden" class="persona-email" value="${e(miembro.email || session?.email || '')}" />
    <div style="font-size:0.72rem;color:#b4a870;margin-top:8px;line-height:1.45;">Va a nombre de tu cuenta y no se puede regalar. Si tu nombre o RUT está mal, corrígelo en Mi cuenta.</div>
  </div>`;
  }
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

// Mi cuenta · sexo: si ya está, queda fijo (solo lo corrige un admin). Se lee
// en vivo desde clientes porque la sesión del navegador puede estar vieja.
function _pintarSexoCuenta(session) {
  const sel = document.getElementById('cp-sexo'), nota = document.getElementById('cp-sexo-nota');
  if (!sel || !session) return;
  const pintar = v => {
    sel.value = v || '';
    sel.disabled = !!v;
    sel.style.opacity = v ? '0.6' : '';
    if (nota) nota.textContent = v ? 'fijo · lo corrige un admin' : 'se guarda una sola vez';
  };
  pintar(session.sexo);
  if (typeof sb === 'undefined' || !session.id) return;
  sb.from('clientes').select('sexo').eq('id', session.id).maybeSingle().then(r => {
    if (r.error) { if (/sexo/i.test(r.error.message || '')) { const w = sel.closest('.profile-field'); if (w) w.style.display = 'none'; } return; }
    const v = (r.data && r.data.sexo) || null;
    if (v !== (session.sexo || null)) { session.sexo = v; try { Storage.set('frate_session', session); } catch (_) {} }
    pintar(v);
  }).catch(() => {});
}
