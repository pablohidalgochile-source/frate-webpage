// ============================================================
// FRATE CART — Sistema de tickets propio
// Reemplaza Passline — plataforma nativa frate.cl
// ============================================================

// ── ESTADO DEL CARRITO ───────────────────────────────────────
let cart = Storage.get('frate_cart') || [];

function saveCart() { Storage.set('frate_cart', cart); }

function cartTotal() {
  return cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
}

function cartItemCount() {
  return cart.reduce((sum, item) => sum + item.cantidad, 0);
}

// ── ACTUALIZAR BADGE ─────────────────────────────────────────
// 🏷️ Etiqueta para el cliente: «PREV 3 MUJER…» se muestra como «MUJER… · PREVENTA 3».
// El nombre real del tipo NO se toca — la puerta y el servidor siguen usando ese.
//
// ⚠️ Va a nivel de ARCHIVO a propósito. Estuvo declarada dentro de
//    renderCartItems() y la usa también renderCheckoutSummary(), que es otra
//    función: ahí reventaba con «_etq is not defined» y el modal de pago no
//    terminaba de dibujarse, así que desde el carrito no se podía pagar.
function _etq(n) {
  try {
    return (window.FrateAfiche && FrateAfiche.etiquetaPublica)
      ? FrateAfiche.etiquetaPublica(n)
      : (n || '');
  } catch (_) { return n || ''; }
}

function updateCartBadge() {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  const count = cartItemCount();
  badge.textContent = count;
  if (count > 0) badge.classList.add('visible');
  else badge.classList.remove('visible');
}

// ── AGREGAR AL CARRITO ───────────────────────────────────────
function addToCart(eventoId, tipo, cantidad) {
  const ev = FRATE_EVENTOS.find(e => e.id === eventoId);
  if (!ev) return;
  const precio = tipo === 'Anticipada' ? ev.precio_anticipada : ev.precio_general;
  const existing = cart.find(i => i.eventoId === eventoId && i.tipo === tipo);
  if (existing) {
    existing.cantidad = Math.min(existing.cantidad + cantidad, 10);
  } else {
    cart.push({
      eventoId, tipo, cantidad,
      precio,
      nombre: ev.nombre,
      fecha: ev.fecha,
      hora: ev.hora,
      ambiente: ev.ambiente
    });
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
  // Bounce animation
  const btn = document.getElementById('nav-cart-btn');
  if (btn) { btn.classList.add('cart-bounce'); setTimeout(() => btn.classList.remove('cart-bounce'), 300); }
  showToast(`🎟️ ${ev.nombre} agregado al carrito`);
}

// ── QUITAR DEL CARRITO ────────────────────────────────────────
function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart(); updateCartBadge(); renderCartItems();
}

function updateQty(index, delta) {
  cart[index].cantidad = Math.max(1, Math.min(10, cart[index].cantidad + delta));
  saveCart(); updateCartBadge(); renderCartItems();
}

// ── RENDER CART ITEMS ────────────────────────────────────────
function formatCLP(n) { return '$' + n.toLocaleString('es-CL'); }

function renderCartItems() {
  const container = document.getElementById('cart-items-list');
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🎟️</div>
        <div class="cart-empty-title">Tu carrito está vacío</div>
        <p style="font-size:0.8rem;color:#444">Agrega tickets desde la sección de eventos</p>
      </div>`;
    const totalEl = document.getElementById('cart-total-value');
    if (totalEl) totalEl.textContent = '$0';
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  // Color y etiqueta por tipo de item
  function itemColor(item) {
    if (item.tipo === 'carta')  return '#D4A832';
    if (item.tipo === 'merch')  return '#8B1A1E';
    if (item.eventoId)          return '#E8363D'; // ticket de evento
    return '#555';
  }
  function itemLabel(item) {
    if (item.tipo === 'carta') return '🍹 Carta';
    if (item.tipo === 'merch') return '🛍️ Tiendita' + (item.detalle ? ' · ' + item.detalle : '');
    return '🎟️ ' + (_etq(item.tipo) || 'Ticket');
  }
  function itemSubtitle(item) {
    if (item.tipo === 'carta') return 'Pre-compra en barra';
    if (item.tipo === 'merch') return '';
    return (item.fecha || '') + (item.hora ? ' · ' + item.hora + ' hrs' : '');
  }
  // Qty editable solo para carta/merch (los tickets tienen qty fija por personas asignadas)
  function canEditQty(item) { return item.tipo === 'carta' || item.tipo === 'merch'; }

  container.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-color" style="background:${itemColor(item)}"></div>
      <div class="cart-item-info">
        <div class="cart-item-evento">${item.nombre}</div>
        ${itemSubtitle(item) ? `<div class="cart-item-fecha">${itemSubtitle(item)}</div>` : ''}
        <span class="cart-item-tipo">${itemLabel(item)}</span>
        <div class="cart-item-controls">
          ${canEditQty(item) ? `
            <button class="qty-btn" onclick="updateQty(${i},-1)">−</button>
            <span class="qty-num">${item.cantidad}</span>
            <button class="qty-btn" onclick="updateQty(${i},1)">+</button>
          ` : `<span class="qty-num" style="margin:0;">${item.cantidad} entrada${item.cantidad>1?'s':''}</span>`}
        </div>
      </div>
      <div class="cart-item-price">
        <div class="cart-item-unit">${formatCLP(item.precio)} c/u</div>
        <div class="cart-item-total">${formatCLP(item.precio * item.cantidad)}</div>
        <button class="cart-item-remove" onclick="removeFromCart(${i})" title="Eliminar">✕</button>
      </div>
    </div>
  `).join('');

  const total = cartTotal();
  const totalEl = document.getElementById('cart-total-value');
  if (totalEl) totalEl.textContent = formatCLP(total);
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  if (checkoutBtn) checkoutBtn.disabled = false;
}

// ── ABRIR/CERRAR CART ─────────────────────────────────────────
function openCart() {
  document.getElementById('cart-backdrop')?.classList.add('open');
  document.getElementById('cart-drawer')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCartItems();
}

function closeCart() {
  document.getElementById('cart-backdrop')?.classList.remove('open');
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── CHECKOUT ─────────────────────────────────────────────────
let selectedPayMethod = 'mercadopago';

function openCheckout() {
  if (cart.length === 0) return;
  const session = Storage.get('frate_session');
  closeCart();

  // Auto-fill from session
  if (session) {
    const fullName = ((session.nombres||'') + ' ' + (session.apellidos||'')).trim() || session.nombre || '';
    const n = document.getElementById('co-nombre');
    const e = document.getElementById('co-email');
    const t = document.getElementById('co-tel');
    const r = document.getElementById('co-rut');
    if (n) n.value = fullName;
    if (e) e.value = session.email    || '';
    if (t) t.value = session.telefono || '';
    if (r) r.value = session.rut      || '';
  }

  // Autocompletar con los datos del Ticket #1 (ya los escribió al
  // elegir sus entradas) — cubre a los invitados sin sesión y
  // completa lo que falte aunque haya sesión.
  try {
    const conPersonas = cart.find(c => Array.isArray(c.personas) && c.personas.length);
    const p0 = (conPersonas && conPersonas.personas[0]) || {};
    const cn = document.getElementById('co-nombre');
    const cr = document.getElementById('co-rut');
    const ce = document.getElementById('co-email');
    if (cn && !cn.value.trim() && p0.nombre) cn.value = p0.nombre;
    if (cr && !cr.value.trim() && p0.rut)    cr.value = p0.rut;
    if (ce && !ce.value.trim() && p0.email)  ce.value = p0.email;
  } catch(e) {}

  // Verificación de correo: sugerencia de typo + confirmar + dominio real
  try { if (window.FrateEmail) { const em = document.getElementById('co-email'); if (em) FrateEmail.attach(em, { confirm: document.getElementById('co-email2') }); } } catch(e) {}

  // Resetear código aplicado al abrir
  window._codigoAplicado = null;
  const coCod = document.getElementById('co-codigo'); if (coCod) coCod.value = '';
  const coMsg = document.getElementById('co-codigo-msg'); if (coMsg) coMsg.textContent = '';

  // Cargar crédito del usuario — el usuario decide si usarlo (opt-in, NO automático)
  window._creditoUsuario = 0;
  window._usarCredito = false;

  // 🍹 Cross-sell "Suma a tu noche" (solo si está prendido en Secciones)
  window._crossItems = null;
  sb.from('config_sitio').select('visible').eq('clave', 'crosssell').maybeSingle().then(async ({ data }) => {
    if (!data || !data.visible) return;
    const { data: carta } = await sb.from('carta').select('id,nombre,precio').gt('precio', 0).limit(3);
    if (carta && carta.length) { window._crossItems = carta; renderCheckoutSummary(); }
  }).catch(() => {});

  // ✨ Extras / Add-ons configurables — se cobran junto con las entradas.
  //
  // ⚠️ Se filtran por las NOCHES que hay en el carrito. Antes se traían todos los
  //    activos y, con un vaso por evento, el carrito de un sábado ofrecía TAMBIÉN
  //    el vaso del jueves: dos líneas idénticas, y si elegías la equivocada el
  //    pago se caía en el servidor, que sí valida el evento. Mismo criterio que
  //    usa comprar.html.
  //    `eventos` en null = extra de siempre, se ofrece en todo (comportamiento viejo).
  window._addons = null;
  sb.from('tiendita').select('id,nombre,descripcion,precio,stock,eventos,max_por_entrada,emoji').eq('disponible', true).eq('en_checkout', true).order('orden').then(({ data }) => {
    const evs = [...new Set((cart || []).map(i => i.eventoId).filter(Boolean))];
    const sirve = (a) => {
      if (a.stock !== null && a.stock !== undefined && a.stock <= 0) return false;   // agotado: no se ofrece
      if (!Array.isArray(a.eventos) || !a.eventos.length) return true;               // sin restricción
      return a.eventos.some(e => evs.includes(e));
    };
    const vis = (data || []).filter(sirve);
    if (vis.length) { window._addons = vis; renderCheckoutSummary(); }
  }).catch(() => {});
  if (session?.id) {
    sb.from('clientes').select('credito').eq('id', session.id).maybeSingle().then(({ data }) => {
      window._creditoUsuario = data?.credito || 0;
      renderCheckoutSummary();
    });
  }

  renderCheckoutSummary();

  document.getElementById('checkout-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkout-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Descuento del código aplicado (calculado sobre el subtotal). El servidor
// recalcula de forma autoritativa; esto es solo para mostrar al usuario.
function calcDescuento(subtotal) {
  const c = window._codigoAplicado;
  if (!c || !c.descuento_tipo) return 0;
  if (c.descuento_tipo === 'porcentaje') return Math.round(subtotal * (c.descuento_valor || 0) / 100);
  if (c.descuento_tipo === 'monto')      return Math.min(c.descuento_valor || 0, subtotal);
  return 0;
}

// ¿El checkout quedó en $0? Mismo cálculo que renderCheckoutSummary.
function _cartEsGratis() {
  const subtotal = cartTotal();
  const base = subtotal - calcDescuento(subtotal);
  const cred = window._usarCredito ? Math.min(window._creditoUsuario || 0, base) : 0;
  const b2 = base - cred;
  const fee = Math.round(b2 * (window.COMISION || 0.04));
  return cart.length > 0 && (b2 + fee) <= 0;
}
function _txtBotonCheckout() {
  if (_cartEsGratis()) return 'RESERVAR GRATIS';
  return (window._medioPago === 'khipu') ? 'PAGAR POR TRANSFERENCIA' : 'PAGAR CON MERCADO PAGO';
}

function renderCheckoutSummary() {
  const summary = document.getElementById('checkout-summary');
  if (!summary) return;
  const subtotal    = cartTotal();
  const descuento   = calcDescuento(subtotal);
  const base        = subtotal - descuento;
  const creditoDisp = window._creditoUsuario || 0;      // crédito disponible del usuario
  const usar        = !!window._usarCredito;             // ¿el usuario eligió usarlo?
  const credito     = usar ? Math.min(creditoDisp, base) : 0;
  const base2       = base - credito;
  const fee         = Math.round(base2 * (window.COMISION||0.04));
  const total       = base2 + fee;
  // Total $0 (entradas de regalo): no se muestra nada de pago.
  const gratis      = cart.length > 0 && total <= 0;

  let html = '';

  // ── Crédito opt-in: sólo si el usuario TIENE crédito. NO se aplica solo. ──
  if (creditoDisp > 0) {
    html += `
    <div style="background:rgba(74,222,128,0.08);border:1px solid ${usar ? '#4ade80' : '#2a4a35'};border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="min-width:0;">
        <div style="color:#4ade80;font-weight:700;font-size:0.88rem;">🎁 Tienes ${formatCLP(creditoDisp)} de crédito</div>
        <div style="color:var(--gris);font-size:0.72rem;margin-top:2px;">${usar ? 'Aplicado a esta compra ✓' : '¿Usarlo en esta compra?'}</div>
      </div>
      <button type="button" onclick="toggleUsarCredito()" style="flex-shrink:0;background:${usar ? 'transparent' : '#4ade80'};color:${usar ? '#4ade80' : '#0a0a0a'};border:1px solid #4ade80;font-weight:800;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;padding:8px 16px;border-radius:6px;cursor:pointer;">${usar ? 'Quitar' : 'Usar'}</button>
    </div>`;
  }

  html += cart.filter(item => item.tipo !== 'addon').map(item => `
    <div class="checkout-order-row">
      <span>${item.nombre} × ${item.cantidad} (${_etq(item.tipo)})</span>
      <span>${formatCLP(item.precio * item.cantidad)}</span>
    </div>`).join('');

  // ✨ Extras / Add-ons (toggle 1 clic; se suman al total y al pago)
  if (Array.isArray(window._addons) && window._addons.length) {
    html += `<div style="margin:12px 0 2px;padding-top:11px;border-top:1px dashed #2a2a2c;">
      <div style="font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;color:var(--dorado);margin-bottom:6px;">✨ Extras — opcional</div>`;
    window._addons.forEach(a => {
      const on = cart.some(i => i.tipo === 'merch' && String(i.productoId) === String(a.id));
      html += `<label onclick="toggleAddon(${a.id})" style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;">
        <span style="width:18px;height:18px;border-radius:4px;border:1px solid ${on ? '#E8363D' : '#3f3f46'};background:${on ? '#E8363D' : 'transparent'};color:#fff;text-align:center;line-height:16px;font-size:0.66rem;flex-shrink:0;">${on ? '✓' : ''}</span>
        <span style="flex:1;font-size:0.82rem;color:#e4e4e7;">${a.emoji || '✨'} ${a.nombre}${a.descripcion ? `<span style="display:block;font-size:0.68rem;color:var(--gris);">${a.descripcion}</span>` : ''}</span>
        <b style="color:var(--dorado);font-size:0.8rem;white-space:nowrap;">+${formatCLP(a.precio)}</b>
      </label>`;
    });
    html += `</div>`;
  }

  if (descuento > 0) {
    const c = window._codigoAplicado;
    html += `<div class="checkout-order-row" style="color:#4ade80;"><span>Descuento (${c.codigo})</span><span>−${formatCLP(descuento)}</span></div>`;
  }
  if (credito > 0) {
    html += `<div class="checkout-order-row" style="color:#4ade80;"><span>🎁 Crédito aplicado</span><span>−${formatCLP(credito)}</span></div>`;
  }
  html += `
    ${gratis ? '' : `<div class="checkout-order-row"><span>Cargo por servicio (${Math.round((window.COMISION||0.04)*1000)/10}%)</span><span>${formatCLP(fee)}</span></div>`}
    <div class="checkout-order-row"><span>TOTAL</span><span>${gratis ? 'Gratis' : formatCLP(total)}</span></div>
    <div style="font-size:0.66rem;color:var(--muted,#9a9a9a);opacity:.85;margin-top:8px;line-height:1.5;">Entradas nominativas. En caso de <b>devolución</b> se retiene un <b>${window.RETENCION_PCT||10}%</b> por gastos de gestión y transacción (la comisión de MercadoPago no es reembolsable). Al pagar aceptas esta condición.</div>`;

  // ── Cómo pagar: Tarjeta (MercadoPago) o Transferencia (Khipu) ──
  const medio = window._medioPago || 'mercadopago';
  const esKhipu = medio === 'khipu';
  const cbtn = document.getElementById('checkout-confirm-btn');
  if (cbtn) cbtn.textContent = gratis ? 'RESERVAR GRATIS' : (esKhipu ? 'PAGAR POR TRANSFERENCIA' : 'PAGAR CON MERCADO PAGO');
  const dlead = document.getElementById('disc-lead');
  if (dlead) dlead.textContent = gratis
    ? 'No se cobra nada. Tu QR llega a tu correo al instante.'
    : (esKhipu
    ? 'Serás redirigido a Khipu para pagar por transferencia desde tu banco.'
    : 'Serás redirigido a la página segura de Mercado Pago para completar tu pago.');
  if (!gratis) html += `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #2a2a2c;">
      <div style="font-size:0.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--gris);margin-bottom:8px;">Cómo quieres pagar</div>
      <div style="display:flex;gap:8px;">
        <button type="button" onclick="setMedioPago('mercadopago')" style="flex:1;background:${medio==='mercadopago'?'rgba(232,54,61,0.12)':'transparent'};border:1px solid ${medio==='mercadopago'?'#E8363D':'#2a2a2c'};color:#e4e4e7;border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;">💳 Tarjeta<div style="font-size:0.62rem;color:var(--gris);margin-top:2px;">crédito / débito</div></button>
        <button type="button" onclick="setMedioPago('khipu')" style="flex:1;background:${medio==='khipu'?'rgba(232,54,61,0.12)':'transparent'};border:1px solid ${medio==='khipu'?'#E8363D':'#2a2a2c'};color:#e4e4e7;border-radius:8px;padding:10px 8px;cursor:pointer;text-align:center;">🏦 Transferencia<div style="font-size:0.62rem;color:var(--gris);margin-top:2px;">Khipu · banco</div></button>
      </div>
    </div>`;

  // 🍹 Suma a tu noche (cross-sell — 1 toque agrega al carrito)
  if (Array.isArray(window._crossItems) && window._crossItems.length) {
    const enCarro = new Set(cart.filter(i => i.tipo === 'carta').map(i => String(i.productoId)));
    const opciones = window._crossItems.filter(c => !enCarro.has(String(c.id)));
    if (opciones.length) {
      html += `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #2a2a2c;">
        <div style="font-size:0.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--dorado);margin-bottom:8px;">🍹 Suma a tu noche</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${opciones.map(c => `<button type="button" onclick="agregarCross(${c.id})" style="background:transparent;border:1px solid #2a2a2c;color:#e4e4e7;border-radius:20px;padding:7px 12px;font-size:0.75rem;cursor:pointer;">+ ${c.nombre} · ${formatCLP(c.precio)}</button>`).join('')}
        </div></div>`;
    }
  }
  summary.innerHTML = html;
  // Con total $0 no hay nada que cobrar: se esconde el código de descuento y
  // el paso «Pago», para que no parezca que igual te van a cobrar.
  try {
    const cod = document.getElementById('co-codigo');
    const fila = cod && cod.parentElement, tit = fila && fila.previousElementSibling, msgEl = document.getElementById('co-codigo-msg');
    [fila, tit, msgEl].forEach(el => { if (el) el.style.display = gratis ? 'none' : ''; });
    document.querySelectorAll('#checkout-overlay .checkout-step').forEach(st => {
      if (st.textContent.trim().toLowerCase() !== 'pago') return;
      st.style.display = gratis ? 'none' : '';
      const flecha = st.previousElementSibling;
      if (flecha && flecha.textContent.trim() === '→') flecha.style.display = gratis ? 'none' : '';
    });
  } catch (_) {}
}

// ✨ Suma/quita un extra (add-on) del carrito. Se cobra junto con las entradas.
function toggleAddon(id) {
  const a = (window._addons || []).find(x => x.id === id);
  if (!a) return;
  const idx = cart.findIndex(i => i.tipo === 'merch' && String(i.productoId) === String(id));
  if (idx >= 0) cart.splice(idx, 1);
  else {
    // Va como `merch` porque ahora es un producto de la tiendita. `eventoId`
    // acompaña para que el servidor pueda validar que ese producto se vende
    // esa noche.
    const evs = [...new Set((cart || []).map(i => i.eventoId).filter(Boolean))];
    cart.push({ tipo: 'merch', productoId: a.id, nombre: a.nombre, precio: a.precio, cantidad: 1, eventoId: evs[0] || null });
  }
  saveCart(); updateCartBadge(); renderCheckoutSummary();
}

// Agrega un producto del cross-sell al carrito (1 toque)
function agregarCross(id) {
  const c = (window._crossItems || []).find(x => x.id === id);
  if (!c) return;
  cart.push({ tipo: 'carta', productoId: c.id, nombre: c.nombre, precio: c.precio, cantidad: 1 });
  saveCart(); updateCartBadge(); renderCheckoutSummary();
  if (typeof showToast === 'function') showToast('🍹 ' + c.nombre + ' agregado a tu noche');
}

// El usuario decide usar (o quitar) su crédito. No se aplica automáticamente.
function toggleUsarCredito() {
  window._usarCredito = !window._usarCredito;
  renderCheckoutSummary();
}

// Valida el código contra Supabase (RPC) y lo aplica al resumen.
async function aplicarCodigo() {
  const input = document.getElementById('co-codigo');
  const msg   = document.getElementById('co-codigo-msg');
  const code  = (input?.value || '').trim().toUpperCase();
  if (!code) { window._codigoAplicado = null; renderCheckoutSummary(); if(msg) msg.textContent=''; return; }
  if (msg) { msg.style.color = 'var(--gris)'; msg.textContent = 'Validando...'; }
  // evento del carrito (primer ticket); si no hay, null → códigos globales
  const ticket = cart.find(i => i.eventoId);
  const eventoId = ticket ? Number(ticket.eventoId) : null;
  try {
    const { data, error } = await sb.rpc('validar_codigo', { p_codigo: code, p_evento_id: eventoId });
    const c = Array.isArray(data) ? data[0] : data;
    if (error || !c) {
      window._codigoAplicado = null;
      if (msg) { msg.style.color = '#f87171'; msg.textContent = '✕ Código inválido, vencido o no aplicable.'; }
      renderCheckoutSummary();
      return;
    }
    window._codigoAplicado = c;
    if (msg) {
      msg.style.color = '#4ade80';
      const desc = c.descuento_tipo === 'porcentaje' ? `${c.descuento_valor}% de descuento`
                 : c.descuento_tipo === 'monto' ? `${formatCLP(c.descuento_valor)} de descuento` : 'aplicado';
      msg.textContent = `✓ Código ${c.codigo} — ${desc}${c.tipo==='rrpp' && c.rrpp_nombre ? ' · RRPP '+c.rrpp_nombre : ''}`;
    }
    renderCheckoutSummary();
  } catch (e) {
    window._codigoAplicado = null;
    if (msg) { msg.style.color = '#f87171'; msg.textContent = '✕ No se pudo validar el código.'; }
    renderCheckoutSummary();
  }
}

function selectPayMethod(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.method === method);
  });
}

// ── CONFIRMAR COMPRA ──────────────────────────────────────────
// Flujo MercadoPago (Checkout Pro):
//   1) Llama a la Edge Function `crear-pago`, que calcula el total en el
//      servidor, valida stock, crea el pedido PENDIENTE y genera la
//      preferencia de pago.
//   2) Redirige al usuario a la página segura de MercadoPago.
//   3) El ticket NO se emite aquí — se emite cuando MercadoPago confirma
//      el pago por webhook (mp-webhook). Así nadie obtiene entradas gratis.
function setMedioPago(m) { window._medioPago = m; renderCheckoutSummary(); }
window.setMedioPago = setMedioPago;

async function confirmPurchase() {
  const nombre = document.getElementById('co-nombre')?.value?.trim();
  const email  = document.getElementById('co-email')?.value?.trim();
  const tel    = document.getElementById('co-tel')?.value?.trim();
  const rut    = document.getElementById('co-rut')?.value?.trim();

  if (!nombre || !email || !tel) { showToast('⚠️ Completa todos los campos requeridos.'); return; }
  if (cart.length === 0)         { showToast('🛒 Carrito vacío.'); return; }
  // La cortesía de miembro se reserva sola (el servidor responde NO_MEZCLAR).
  {
    const _ttDe = c => { try { return (typeof FRATE_EVENTOS !== 'undefined' ? FRATE_EVENTOS : []).flatMap(e => e.tiposTicket || []).find(t => String(t.id) === String(c.ttId)); } catch (_) { return null; } };
    const _esCortM = c => !!c.ttId && !(c.precio > 0) && !!(_ttDe(c) || {}).solo_miembros;
    if (cart.some(_esCortM) && cart.some(c => !_esCortM(c))) {
      showToast('🎁 Tu cortesía de miembro se reserva por separado. Quítala del carrito y resérvala desde el evento con 🎁 RESERVAR GRATIS.');
      return;
    }
  }
  // Verificación de correo (formato + coinciden + dominio real) para que SÍ llegue el QR
  if (window.FrateEmail) {
    const ev = FrateEmail.validate(document.getElementById('co-email'), document.getElementById('co-email2'));
    if (!ev.ok) { showToast('⚠️ ' + ev.msg); return; }
    try { const chk = await FrateEmail.checkMX(email); if (chk && chk.mx === false) { showToast('❌ Ese correo no existe. Corrígelo para recibir tu QR.'); return; } } catch(_) {}
  }

  const btn = document.getElementById('checkout-confirm-btn');
  if (btn) { btn.textContent = _cartEsGratis() ? 'RESERVANDO…' : 'REDIRIGIENDO A PAGO...'; btn.disabled = true; }

  try {
    const session = Storage.get('frate_session');

    // Guarda datos del comprador por si vuelve de un pago fallido
    Storage.set('frate_last_checkout', { nombre, email, tel, rut });

    // Llama a la Edge Function que crea el pedido + preferencia MercadoPago
    const { data, error } = await sb.functions.invoke('crear-pago', {
      body: {
        items: cart,
        comprador: { nombre, email, tel, rut: rut || '', clienteId: session?.id || null },
        codigo: window._codigoAplicado?.codigo || null,
        usarCredito: !!window._usarCredito,
        medio: window._medioPago || 'mercadopago',
      },
    });

    if (error) {
      // Mismo caso: el motivo real (sin stock, solo miembros, RUT repetido)
      // viene en el cuerpo, no en error.message.
      let m = error.message || 'No se pudo iniciar el pago.', code = null, faltan = null;
      try { const c = await error.context?.json?.(); if (c?.error) m = c.error; code = c?.code || null; faltan = c?.faltan || null; } catch (_) {}
      if (code === 'REQUIERE_CUENTA') {
        // Entrada solo para miembros sin sesión (o con la sesión vencida).
        if (btn) { btn.disabled = false; btn.textContent = _txtBotonCheckout(); }
        closeCheckout();
        if (typeof openAuthModal === 'function') openAuthModal('register');
        showToast('🔒 ' + m);
        return;
      }
      if (code && window.FratePerfil && window.FratePerfil.esCodigo(code)) {
        if (btn) { btn.disabled = false; btn.textContent = _txtBotonCheckout(); }
        const listo = await window.FratePerfil.manejarCodigo(code, m, faltan);
        if (listo) showToast('✅ Datos guardados. Aprieta el botón de nuevo.');
        return;
      }
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);

    // Vacía el carrito local (el pedido ya quedó guardado en el servidor)
    cart = [];
    saveCart();
    updateCartBadge();

    // Pedido gratis (entrada cubierta por membresía) → no pasa por MercadoPago
    if (data?.freeOrder) {
      window.location.href = '/pago-exitoso.html?external_reference=' + data.pedidoId;
      return;
    }
    if (!data?.initPoint) throw new Error('MercadoPago no devolvió un link de pago.');

    // Redirige a la página segura de MercadoPago
    window.location.href = data.initPoint;

  } catch (err) {
    console.error('[FRATE] Error en confirmPurchase:', err);
    let msg = err?.message || 'Error al iniciar el pago. Intenta de nuevo.';
    if (msg.includes('SIN_STOCK')) {
      msg = msg.replace(/.*SIN_STOCK:\s*/, '') + ' — alguien lo compró justo antes que tú.';
    }
    showToast('⚠️ ' + msg);
    if (btn) { btn.textContent = _txtBotonCheckout(); btn.disabled = false; }
  }
}

// ── TICKET DIGITAL ─────────────────────────────────────────────
// 1 recibo por orden, con 1 QR individual por cada producto comprado.
// ─────────────────────────────────────────────────────────────────
function showTicket(order) {
  const overlay = document.getElementById('ticket-overlay');
  if (!overlay) return;

  const fee      = Math.round(order.total * (window.COMISION||0.04));
  const totalCon = order.total + fee;
  const fechaStr = new Date(order.fecha).toLocaleString('es-CL',
    { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Expandir: 1 entrada por persona de ticket, 1 por unidad de carta/merch
  const entries = buildTicketEntries(order);

  overlay.innerHTML = `
  <div style="background:var(--negro);min-height:100vh;padding:0;overflow-y:auto;">
    <!-- Header recibo -->
    <div style="background:#0e0e10;border-bottom:1px solid #1a1a1c;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10;">
      <div>
        <div style="font-family:var(--fuente-display);font-weight:900;font-size:1.4rem;letter-spacing:2px;color:var(--blanco);">FRATE</div>
        <div style="font-size:0.6rem;letter-spacing:3px;color:var(--rojo);text-transform:uppercase;">Comprobante de compra</div>
      </div>
      <button onclick="closeTicket()" style="background:transparent;border:1px solid #333;color:var(--blanco);width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:1rem;">✕</button>
    </div>

    <!-- Info orden -->
    <div style="padding:20px 24px;border-bottom:1px solid #1a1a1c;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><div style="font-size:0.6rem;letter-spacing:2px;color:var(--gris);text-transform:uppercase;margin-bottom:4px;">Orden</div>
          <div style="font-family:var(--fuente-display);font-weight:700;color:var(--dorado);">${order.id}</div></div>
        <div><div style="font-size:0.6rem;letter-spacing:2px;color:var(--gris);text-transform:uppercase;margin-bottom:4px;">Fecha</div>
          <div style="font-size:0.85rem;color:var(--blanco);">${fechaStr}</div></div>
        <div><div style="font-size:0.6rem;letter-spacing:2px;color:var(--gris);text-transform:uppercase;margin-bottom:4px;">Comprador</div>
          <div style="font-size:0.85rem;color:var(--blanco);">${order.comprador.nombre}</div>
          <div style="font-size:0.75rem;color:var(--gris);">${order.comprador.email}</div></div>
        <div><div style="font-size:0.6rem;letter-spacing:2px;color:var(--gris);text-transform:uppercase;margin-bottom:4px;">Total</div>
          <div style="font-family:var(--fuente-display);font-weight:900;font-size:1.2rem;color:var(--blanco);">${formatCLP(totalCon)}</div>
          <div style="font-size:0.7rem;color:var(--gris);">Incluye cargo servicio ${Math.round((window.COMISION||0.04)*1000)/10}%</div></div>
      </div>
    </div>

    <!-- Entries (1 por producto) -->
    <div style="padding:16px 24px;">
      <div style="font-size:0.6rem;letter-spacing:3px;text-transform:uppercase;color:var(--rojo);margin-bottom:16px;">
        ${entries.length} producto${entries.length>1?'s':''} — escaneables individualmente
      </div>
      ${entries.map(entry => renderTicketEntry(entry)).join('')}
    </div>

    <!-- Footer -->
    <div style="padding:20px 24px;border-top:1px solid #1a1a1c;text-align:center;">
      <button onclick="downloadTicket()" style="background:var(--rojo);color:#fff;border:none;padding:14px 40px;font-family:var(--fuente-display);font-weight:900;font-size:1rem;letter-spacing:3px;text-transform:uppercase;border-radius:2px;cursor:pointer;width:100%;max-width:400px;">
        📧 GUARDAR / ENVIAR
      </button>
      <div style="font-size:0.7rem;color:var(--gris);margin-top:12px;">Muestra el QR de cada producto en la entrada · frate.cl</div>
    </div>
  </div>`;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Dibujar QRs después del render
  requestAnimationFrame(() => {
    entries.forEach(entry => {
      const canvas = document.getElementById('qr-' + entry.qrId);
      if (canvas) drawQR(canvas, entry.qrId);
    });
  });
}

// Expande los items de la orden en entradas individuales (1 por persona/unidad)
function buildTicketEntries(order) {
  const entries = [];
  (order.items || []).forEach(item => {
    if (item.tipo === 'carta' || item.tipo === 'merch') {
      // 1 QR por unidad
      for (let u = 0; u < item.cantidad; u++) {
        const uid = order.id + '-' + (item.productoId || item.tipo) + '-' + u;
        entries.push({
          qrId:    uid,
          icon:    item.tipo === 'carta' ? '🍹' : '🛍️',
          titulo:  item.nombre,
          subtit:  item.tipo === 'carta' ? 'Pre-compra en barra' : (item.detalle || ''),
          precio:  item.precio,
          tipo:    item.tipo === 'carta' ? 'CARTA' : 'TIENDITA',
          color:   item.tipo === 'carta' ? '#D4A832' : '#8B1A1E',
          persona: null
        });
      }
    } else {
      // Ticket de evento — 1 QR por persona asignada
      const personas = item.personas || [];
      for (let p = 0; p < item.cantidad; p++) {
        const persona = personas[p] || null;
        const uid = order.id + '-' + (item.ttId || item.tipo) + '-' + p;
        entries.push({
          qrId:    uid,
          icon:    '🎟️',
          titulo:  item.nombre,
          subtit:  (item.fecha || '') + (item.hora ? ' · ' + item.hora + ' hrs' : ''),
          precio:  item.precio,
          tipo:    item.tipo || 'TICKET',
          color:   '#E8363D',
          persona: persona
        });
      }
    }
  });
  return entries;
}

function renderTicketEntry(e) {
  return `
  <div style="background:var(--negro-3);border:1px solid #1a1a1c;border-left:3px solid ${e.color};border-radius:2px;padding:16px;margin-bottom:12px;display:flex;gap:16px;align-items:flex-start;">
    <div style="flex-shrink:0;">
      <canvas id="qr-${e.qrId}" width="100" height="100" style="display:block;border-radius:2px;"></canvas>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:0.55rem;letter-spacing:2px;text-transform:uppercase;color:${e.color};margin-bottom:4px;">${e.tipo}</div>
      <div style="font-family:var(--fuente-display);font-weight:700;font-size:1rem;color:var(--blanco);line-height:1.2;margin-bottom:4px;">${e.icon} ${e.titulo}</div>
      ${e.subtit ? `<div style="font-size:0.75rem;color:var(--gris);margin-bottom:6px;">${e.subtit}</div>` : ''}
      ${e.persona ? `
        <div style="font-size:0.75rem;color:var(--blanco);margin-bottom:2px;">👤 ${e.persona.nombre || '—'}</div>
        ${e.persona.rut ? `<div style="font-size:0.7rem;color:var(--gris);">RUT: ${e.persona.rut}</div>` : ''}
      ` : ''}
      <div style="font-family:var(--fuente-display);font-weight:900;font-size:1.1rem;color:var(--dorado);margin-top:8px;">${formatCLP(e.precio)}</div>
      <div style="font-size:0.6rem;color:#333;margin-top:6px;word-break:break-all;">${e.qrId}</div>
    </div>
  </div>`;
}

function closeTicket() {
  document.getElementById('ticket-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Genera QR visual determinista en un canvas
function drawQR(canvas, code) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0A0A0B';
  const cells = 17;
  const cell  = Math.floor(W / cells);
  const off   = (W - cells * cell) / 2;

  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) & 0xffffffff;
  function rng() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 4294967296; }

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inFP = (r < 7 && c < 7) || (r < 7 && c >= cells-7) || (r >= cells-7 && c < 7);
      if (inFP) {
        const edge = r===0||r===6||c===0||c===6||
          (r>=cells-7&&(r===cells-7||r===cells-1||c===0||c===6))||
          (c>=cells-7&&(c===cells-7||c===cells-1||r===0||r===6));
        const inner = (r>=2&&r<=4&&c>=2&&c<=4)||
          (r>=2&&r<=4&&c>=cells-5&&c<=cells-3)||
          (r>=cells-5&&r<=cells-3&&c>=2&&c<=4);
        if (edge||inner) ctx.fillRect(off+c*cell, off+r*cell, cell-1, cell-1);
      } else {
        if (rng() > 0.48) ctx.fillRect(off+c*cell, off+r*cell, cell-1, cell-1);
      }
    }
  }
}

// Alias para compatibilidad con llamadas existentes
function generateQR(code) {
  const canvas = document.getElementById('ticket-qr-canvas');
  if (canvas) drawQR(canvas, code);
}

function downloadTicket() {
  showToast('📧 Ticket guardado — llévalo en tu pantalla el día del evento.');
}

// ── INIT CART ────────────────────────────────────────────────
function initCart() {
  // Comisión configurable (config_valores.comision_pct = "4" → 0.04). Fallback 4%.
  window.COMISION = window.COMISION || 0.04;
  try { sb.from('config_valores').select('valor').eq('clave','comision_pct').maybeSingle().then(({ data }) => { const n = parseFloat(data && data.valor); if (!isNaN(n) && n >= 0 && n <= 30) window.COMISION = n / 100; }); } catch(e){}
  window.RETENCION_PCT = window.RETENCION_PCT || 10;
  try { sb.from('config_valores').select('valor').eq('clave','devolucion_retencion_pct').maybeSingle().then(({ data }) => { const n = parseFloat(data && data.valor); if (!isNaN(n) && n >= 0 && n <= 100) window.RETENCION_PCT = n; }); } catch(e){}

  // Cart button en navbar
  document.getElementById('nav-cart-btn')?.addEventListener('click', openCart);
  document.getElementById('cart-backdrop')?.addEventListener('click', closeCart);
  document.getElementById('cart-close-btn')?.addEventListener('click', closeCart);

  // Checkout
  document.getElementById('cart-checkout-btn')?.addEventListener('click', openCheckout);
  document.getElementById('checkout-close-btn')?.addEventListener('click', closeCheckout);
  document.getElementById('checkout-confirm-btn')?.addEventListener('click', confirmPurchase);

  // Métodos de pago
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPayMethod(btn.dataset.method));
  });

  // Ticket close
  document.getElementById('ticket-close-btn')?.addEventListener('click', closeTicket);

  updateCartBadge();
  renderCartItems();
}

// ── EVENTO CARDS EXPAND ───────────────────────────────────────
function initEventoExpand() {
  document.addEventListener('click', e => {
    const card = e.target.closest('.evento-card');
    const ticketBtn = e.target.closest('.btn-ticket-expand');
    const addBtn = e.target.closest('.ticket-add-btn');
    const typeBtn = e.target.closest('.ticket-type-btn');

    if (ticketBtn && card) {
      e.preventDefault();
      // Cerrar otras cards
      document.querySelectorAll('.evento-card.expanded').forEach(c => {
        if (c !== card) c.classList.remove('expanded');
      });
      card.classList.toggle('expanded');
    }

    if (typeBtn) {
      const parent = typeBtn.closest('.ticket-type-options');
      parent?.querySelectorAll('.ticket-type-btn').forEach(b => b.classList.remove('selected'));
      typeBtn.classList.add('selected');
    }

    if (addBtn && card) {
      const selected = card.querySelector('.ticket-type-btn.selected');
      if (!selected) { showToast('Selecciona el tipo de entrada.'); return; }
      const tipo = selected.dataset.tipo;
      const qty = parseInt(card.querySelector('.ticket-qty-display')?.textContent || '1');
      const evId = parseInt(card.dataset.evid);
      addToCart(evId, tipo, qty);
      card.classList.remove('expanded');
    }
  });

  document.addEventListener('click', e => {
    const qtyUp = e.target.closest('.ticket-qty-up');
    const qtyDn = e.target.closest('.ticket-qty-down');
    if (qtyUp || qtyDn) {
      const display = (qtyUp || qtyDn).closest('.ticket-qty-controls').querySelector('.ticket-qty-display');
      let v = parseInt(display.textContent);
      if (qtyUp) v = Math.min(10, v + 1);
      if (qtyDn) v = Math.max(1, v - 1);
      display.textContent = v;
    }
  });
}
