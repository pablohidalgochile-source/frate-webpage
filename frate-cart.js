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
    return '🎟️ ' + (item.tipo || 'Ticket');
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
let selectedPayMethod = 'webpay';

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
// Persiste el pedido en Supabase, genera QR ids únicos, envía el comprobante.
// Por ahora marca el pedido como 'pagado' directamente (sin pasarela real).
// CUANDO se integre Webpay/MercadoPago: dejar en 'pendiente' y mover el
// sbMarcarPedidoPagado al callback de pago exitoso.
async function confirmPurchase() {
  const nombre = document.getElementById('co-nombre')?.value?.trim();
  const email  = document.getElementById('co-email')?.value?.trim();
  const tel    = document.getElementById('co-tel')?.value?.trim();
  const rut    = document.getElementById('co-rut')?.value?.trim();

  if (!nombre || !email || !tel) { showToast('⚠️ Completa todos los campos requeridos.'); return; }
  if (cart.length === 0)         { showToast('🛒 Carrito vacío.'); return; }

  const btn = document.getElementById('checkout-confirm-btn');
  if (btn) { btn.textContent = 'PROCESANDO...'; btn.disabled = true; }

  try {
    const session = Storage.get('frate_session');
    const total   = cartTotal();
    const fee     = Math.round(total * 0.04);

    // 1) Validar stock disponible antes de cobrar
    if (typeof sbValidarStockCarrito === 'function') {
      const check = await sbValidarStockCarrito(cart);
      if (!check.ok) {
        showToast('⚠️ ' + check.errores.join(' · '));
        if (btn) { btn.textContent = 'CONFIRMAR COMPRA'; btn.disabled = false; }
        return;
      }
    }

    // 2) Crear pedido en Supabase
    const pedido = await sbCrearPedido({
      clienteId:     session?.id || null,
      nombreCliente: nombre,
      emailCliente:  email,
      telefono:      tel,
      rut:           rut || '',
      items:         cart,
      total:         total,
      feeServicio:   fee,
      metodoPago:    selectedPayMethod
    });

    // 3) Marcar como pagado (TODO: mover esto al callback de Webpay/MercadoPago)
    const refPago = `SIM-${Date.now().toString(36).toUpperCase()}`;
    await sbMarcarPedidoPagado(pedido.id, refPago);

    // 4) Construir orderData para UI + email
    const orderId = 'FCC-' + String(pedido.id).padStart(6, '0');
    const orderData = {
      id:         orderId,
      pedidoId:   pedido.id,
      items:      [...cart],
      comprador:  { nombre, email, tel, rut },
      metodoPago: selectedPayMethod,
      total:      total,
      fee:        fee,
      fecha:      new Date().toISOString()
    };

    // 5) Mostrar ticket digital
    closeCheckout();
    showTicket(orderData);

    // 6) Enviar email con QRs individuales (no bloquea si falla)
    if (typeof sbSendReceiptEmail === 'function') {
      sbSendReceiptEmail(orderData).then(res => {
        if (res?.ok) showToast('📧 Comprobante enviado a ' + email);
      });
    }

    // 7) Vaciar carrito
    cart = [];
    saveCart();
    updateCartBadge();

  } catch (err) {
    console.error('[FRATE] Error en confirmPurchase:', err);
    showToast('⚠️ ' + (err?.message || 'Error al procesar la compra. Intenta de nuevo.'));
  } finally {
    if (btn) { btn.textContent = 'CONFIRMAR COMPRA'; btn.disabled = false; }
  }
}

// ── TICKET DIGITAL ─────────────────────────────────────────────
// 1 recibo por orden, con 1 QR individual por cada producto comprado.
// ─────────────────────────────────────────────────────────────────
function showTicket(order) {
  const overlay = document.getElementById('ticket-overlay');
  if (!overlay) return;

  const fee      = Math.round(order.total * 0.04);
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
          <div style="font-size:0.7rem;color:var(--gris);">Incluye cargo servicio 4%</div></div>
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
