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

  const colores = { 'Anticipada': '#D4A832', 'General': '#E8363D' };
  container.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-color" style="background:${colores[item.tipo] || '#E8363D'}"></div>
      <div class="cart-item-info">
        <div class="cart-item-evento">${item.nombre}</div>
        <div class="cart-item-fecha">${item.fecha} · ${item.hora} hrs</div>
        <span class="cart-item-tipo">${item.tipo}</span>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="updateQty(${i},-1)">−</button>
          <span class="qty-num">${item.cantidad}</span>
          <button class="qty-btn" onclick="updateQty(${i},1)">+</button>
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
let selectedPayMethod = 'webpay';

function openCheckout() {
  if (cart.length === 0) return;
  const session = Storage.get('frate_session');
  closeCart();

  // Auto-fill from session
  if (session) {
    const n = document.getElementById('co-nombre');
    const e = document.getElementById('co-email');
    const t = document.getElementById('co-tel');
    const r = document.getElementById('co-rut');
    if (n) n.value = session.nombre || '';
    if (e) e.value = session.email || '';
    if (t) t.value = session.telefono || '';
    if (r) r.value = session.rut || '';
  }

  // Render summary
  const summary = document.getElementById('checkout-summary');
  if (summary) {
    const fee = Math.round(cartTotal() * 0.04);
    summary.innerHTML = cart.map(item => `
      <div class="checkout-order-row">
        <span>${item.nombre} × ${item.cantidad} (${item.tipo})</span>
        <span>${formatCLP(item.precio * item.cantidad)}</span>
      </div>
    `).join('') + `
      <div class="checkout-order-row"><span>Cargo por servicio (4%)</span><span>${formatCLP(fee)}</span></div>
      <div class="checkout-order-row"><span>TOTAL</span><span>${formatCLP(cartTotal() + fee)}</span></div>
    `;
  }

  document.getElementById('checkout-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  document.getElementById('checkout-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function selectPayMethod(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.method === method);
  });
}

// ── CONFIRMAR COMPRA ──────────────────────────────────────────
function confirmPurchase() {
  const nombre = document.getElementById('co-nombre')?.value?.trim();
  const email = document.getElementById('co-email')?.value?.trim();
  const tel = document.getElementById('co-tel')?.value?.trim();
  const rut = document.getElementById('co-rut')?.value?.trim();

  if (!nombre || !email || !tel) { showToast('Completa todos los campos requeridos.'); return; }

  // Simular procesamiento
  const btn = document.getElementById('checkout-confirm-btn');
  if (btn) { btn.textContent = 'PROCESANDO...'; btn.disabled = true; }

  setTimeout(() => {
    const orderId = 'FCC-' + Date.now().toString(36).toUpperCase();
    const orderData = {
      id: orderId,
      items: [...cart],
      comprador: { nombre, email, tel, rut },
      metodoPago: selectedPayMethod,
      total: cartTotal(),
      fecha: new Date().toISOString()
    };

    // Guardar en historial del usuario
    const session = Storage.get('frate_session');
    if (session) {
      const users = Storage.get('frate_users') || [];
      const idx = users.findIndex(u => u.id === session.id);
      if (idx >= 0) {
        if (!users[idx].tickets) users[idx].tickets = [];
        users[idx].tickets.push(orderData);
        Storage.set('frate_users', users);
      }
    }

    // Guardar orden
    const orders = Storage.get('frate_orders') || [];
    orders.push(orderData);
    Storage.set('frate_orders', orders);

    // Mostrar ticket
    closeCheckout();
    showTicket(orderData);

    // Vaciar carrito
    cart = [];
    saveCart();
    updateCartBadge();

    if (btn) { btn.textContent = 'CONFIRMAR COMPRA'; btn.disabled = false; }
  }, 1800);
}

// ── TICKET DIGITAL ────────────────────────────────────────────
function showTicket(order) {
  const overlay = document.getElementById('ticket-overlay');
  if (!overlay) return;

  // Primer evento (o resumen)
  const firstItem = order.items[0];
  const totalItems = order.items.reduce((s, i) => s + i.cantidad, 0);
  const fee = Math.round(order.total * 0.04);

  document.getElementById('ticket-evento-name').textContent = firstItem.nombre;
  document.getElementById('ticket-evento-date').textContent =
    firstItem.fecha + ' · ' + firstItem.hora + ' hrs';
  document.getElementById('ticket-order-id').textContent = order.id;
  document.getElementById('ticket-buyer-name').textContent = order.comprador.nombre;
  document.getElementById('ticket-buyer-email').textContent = order.comprador.email;
  document.getElementById('ticket-qty').textContent = totalItems + ' entrada' + (totalItems > 1 ? 's' : '');
  document.getElementById('ticket-total').textContent = formatCLP(order.total + fee);
  document.getElementById('ticket-ambiente').textContent = firstItem.ambiente;

  // Generar QR simple con canvas
  generateQR(order.id);

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTicket() {
  document.getElementById('ticket-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function generateQR(code) {
  const canvas = document.getElementById('ticket-qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 140; canvas.height = 140;

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 140, 140);

  // Patrón QR simulado (cuadrícula determinista basada en el código)
  ctx.fillStyle = '#0A0A0B';
  const size = 7;
  const cells = 18;
  const cell = Math.floor(140 / cells);
  const offset = (140 - cells * cell) / 2;

  // Seed simple del código
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) & 0xffffffff;

  function rng() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 4294967296; }

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Esquinas de finder patterns (siempre negras)
      if ((r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)) {
        const inBorder = r === 0 || c === 0 || r === 6 || c === 6 ||
          (r >= cells - 7 && (c === 0 || c === 6 || r === cells - 7 || r === cells - 1)) ||
          (c >= cells - 7 && (r === 0 || r === 6 || c === cells - 7 || c === cells - 1));
        const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
          (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3) ||
          (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4);
        if (inBorder || inInner) ctx.fillRect(offset + c * cell, offset + r * cell, cell - 1, cell - 1);
      } else {
        if (rng() > 0.5) ctx.fillRect(offset + c * cell, offset + r * cell, cell - 1, cell - 1);
      }
    }
  }
}

function downloadTicket() {
  showToast('📧 Ticket enviado a tu email registrado.');
}

// ── INIT CART ────────────────────────────────────────────────
function initCart() {
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
