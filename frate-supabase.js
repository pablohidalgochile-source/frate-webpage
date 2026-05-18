// ============================================================
// FRATE SUPABASE — Cliente, auth y operaciones completas
// ============================================================

const SUPABASE_URL  = 'https://ydwlpraoaaijlfssevoh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── REGISTRO ─────────────────────────────────────────────────
async function sbSignUp({ nombres, apellidos, nombre, username, email, password, telefono, rut, universidad, carrera }) {
  // Verificar que el username no esté tomado
  if (username) {
    const { data: existing } = await sb.from('clientes').select('id').eq('username', username.toLowerCase()).maybeSingle();
    if (existing) throw new Error('Ese nombre de usuario ya está en uso. Elige otro.');
  }
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    const n = nombres || (nombre || '').split(' ')[0] || '';
    const a = apellidos || (nombre || '').split(' ').slice(1).join(' ') || '';
    await sb.from('clientes').upsert({
      id:          data.user.id,
      username:    (username || '').toLowerCase(),
      nombres:     n,
      apellidos:   a,
      email:       email       || '',
      telefono:    telefono    || '',
      rut:         rut         || '',
      universidad: universidad || '',
      carrera:     carrera     || ''
    });
  }
  return data;
}

// ── LOGIN (email O username) ───────────────────────────────────
async function sbSignIn(emailOrUser, password) {
  let email = emailOrUser.trim();
  // Si no tiene @ → es username, buscar el email
  if (!email.includes('@')) {
    const { data: profile, error: lookupErr } = await sb.from('clientes')
      .select('email').eq('username', email.toLowerCase()).maybeSingle();
    if (lookupErr || !profile) throw new Error('Nombre de usuario no encontrado.');
    email = profile.email;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: profile } = await sb.from('clientes')
    .select('*').eq('id', data.user.id).single();
  const nombres   = profile?.nombres   || '';
  const apellidos = profile?.apellidos || '';
  const session = {
    id:          data.user.id,
    email:       data.user.email,
    username:    profile?.username    || '',
    nombre:      profile?.username    || (nombres + ' ' + apellidos).trim() || email.split('@')[0],
    nombres,
    apellidos,
    telefono:    profile?.telefono    || '',
    rut:         profile?.rut         || '',
    universidad: profile?.universidad || '',
    carrera:     profile?.carrera     || '',
    rol:         profile?.rol         || 'usuario'
  };
  Storage.set('frate_session', session);
  return session;
}

// ── LOGOUT ────────────────────────────────────────────────────
async function sbSignOut() {
  await sb.auth.signOut();
  Storage.del('frate_session');
}

// ── RECUPERAR CONTRASEÑA ──────────────────────────────────────
// Envía un email con link mágico para restablecer.
async function sbResetPassword(emailOrUser) {
  let email = (emailOrUser || '').trim();
  if (!email) throw new Error('Ingresa tu email o nombre de usuario.');
  // Si es username, buscar el email
  if (!email.includes('@')) {
    const { data: profile } = await sb.from('clientes')
      .select('email').eq('username', email.toLowerCase()).maybeSingle();
    if (!profile?.email) throw new Error('No encontramos esa cuenta.');
    email = profile.email;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset.html'
  });
  if (error) throw error;
  return { email };
}

// ── ACTUALIZAR CONTRASEÑA (después del reset) ─────────────────
async function sbUpdatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Mínimo 6 caracteres.');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return true;
}

// ── RESTAURAR SESIÓN ──────────────────────────────────────────
async function sbRestoreSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  const user = data.session.user;
  const { data: profile } = await sb.from('clientes')
    .select('*').eq('id', user.id).single();
  const nombres   = profile?.nombres   || '';
  const apellidos = profile?.apellidos || '';
  const session = {
    id:          user.id,
    email:       user.email,
    username:    profile?.username    || '',
    nombre:      profile?.username    || (nombres + ' ' + apellidos).trim() || user.email.split('@')[0],
    nombres,
    apellidos,
    telefono:    profile?.telefono    || '',
    rut:         profile?.rut         || '',
    universidad: profile?.universidad || '',
    carrera:     profile?.carrera     || '',
    rol:         profile?.rol         || 'usuario'
  };
  Storage.set('frate_session', session);
  return session;
}

// ── EVENTOS ───────────────────────────────────────────────────
async function sbGetEventos() {
  const { data, error } = await sb.from('eventos')
    .select('*, tipos_ticket(*)')
    .eq('activo', true)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data;
}

// ── CREAR PEDIDO ──────────────────────────────────────────────
// Acepta items del carrito (tickets de evento, carta y merch unificados).
// Cada item del carrito puede tener: { tipo, eventoId, ttId, nombre, precio,
//   cantidad, personas[], fecha, hora, ambiente, productoId, detalle }
async function sbCrearPedido({ clienteId, nombreCliente, emailCliente, telefono, rut, items, total, feeServicio, metodoPago }) {
  const totalPagado = total + (feeServicio || 0);

  // 1) Insertar pedido
  const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
    cliente_id:     clienteId || null,
    nombre_cliente: nombreCliente,
    email_cliente:  emailCliente,
    estado:         'pendiente',
    total:          total,
    fee_servicio:   feeServicio || 0,
    total_pagado:   totalPagado,
    metodo_pago:    metodoPago || null
  }).select().single();
  if (e1) throw e1;

  // 2) Mapear cada item del carrito al schema items_pedido
  const rows = items.map(i => {
    const isTicket = !!i.eventoId;
    const isCarta  = i.tipo === 'carta';
    const isMerch  = i.tipo === 'merch';

    // Generar QR ids únicos por unidad/persona
    const qrIds = [];
    const personas = Array.isArray(i.personas) ? i.personas : [];
    for (let u = 0; u < i.cantidad; u++) {
      const key = i.ttId || i.productoId || i.tipo;
      qrIds.push(`FCC-${pedido.id}-${key}-${u}`);
    }

    return {
      pedido_id:        pedido.id,
      producto_tipo:    isTicket ? 'ticket' : (isCarta ? 'carta' : (isMerch ? 'merch' : 'otro')),
      producto_id:      isTicket ? null : (i.productoId || null),
      evento_id:        isTicket ? i.eventoId : null,
      tipo_ticket_id:   isTicket ? (i.ttId || null) : null,
      nombre_evento:    isTicket ? i.nombre : null,
      nombre_ticket:    isTicket ? i.tipo  : (isCarta || isMerch ? i.nombre : null),
      detalle:          i.detalle || null,
      cantidad:         i.cantidad,
      precio_unitario:  i.precio,
      personas:         personas,
      qr_ids:           qrIds,
      // Compatibilidad legacy: si hay una sola persona, llenar los campos antiguos
      nombre_asistente: personas[0]?.nombre || '',
      rut_asistente:    personas[0]?.rut    || ''
    };
  });

  const { error: e2 } = await sb.from('items_pedido').insert(rows);
  if (e2) {
    // Rollback: borrar el pedido si los items fallaron
    await sb.from('pedidos').delete().eq('id', pedido.id);
    throw e2;
  }

  return pedido;
}

// ── VALIDAR STOCK DISPONIBLE ──────────────────────────────────
// Recibe el carrito, devuelve { ok: bool, errores: [] }
async function sbValidarStockCarrito(items) {
  const ticketItems = items.filter(i => i.ttId);
  if (!ticketItems.length) return { ok: true, errores: [] };

  const ttIds = ticketItems.map(i => i.ttId);
  const { data, error } = await sb.from('tipos_ticket')
    .select('id, nombre, disponible, estado')
    .in('id', ttIds);
  if (error) throw error;

  const errores = [];
  for (const item of ticketItems) {
    const tt = data.find(t => t.id === item.ttId);
    if (!tt) {
      errores.push(`"${item.tipo}": no encontrado (puede haber sido eliminado).`);
      continue;
    }
    if (tt.estado === 'Agotado' || tt.estado === 'Cerrado') {
      errores.push(`"${tt.nombre}": ${tt.estado.toLowerCase()}.`);
      continue;
    }
    if (tt.disponible < item.cantidad) {
      errores.push(`"${tt.nombre}": solo quedan ${tt.disponible} (pediste ${item.cantidad}).`);
    }
  }
  return { ok: errores.length === 0, errores };
}

// ── MARCAR PEDIDO COMO PAGADO ─────────────────────────────────
// Esto dispara el trigger SQL que descuenta el stock automáticamente.
async function sbMarcarPedidoPagado(pedidoId, referenciaPago) {
  const { data, error } = await sb.from('pedidos')
    .update({
      estado:          'pagado',
      referencia_pago: referenciaPago || null,
      fecha_pago:      new Date().toISOString()
    })
    .eq('id', pedidoId)
    .select().single();
  if (error) throw error;
  return data;
}

// ── MIS PEDIDOS ───────────────────────────────────────────────
async function sbMisPedidos(clienteId) {
  const { data, error } = await sb.from('pedidos')
    .select('*, items_pedido(*)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── CREAR RESERVA ─────────────────────────────────────────────
async function sbCrearReserva({ clienteId, nombre, email, telefono, fecha, tipo, personas, mensaje }) {
  const { data, error } = await sb.from('reservas')
    .insert({ cliente_id: clienteId||null, nombre, email, telefono, fecha, tipo, personas, mensaje })
    .select().single();
  if (error) throw error;
  return data;
}

// ── CARTA DE TRAGOS ───────────────────────────────────────────
async function sbGetCarta() {
  const { data, error } = await sb.from('carta')
    .select('*').eq('disponible', true).order('categoria').order('orden').order('id');
  if (error) throw error;
  return data;
}

// ── TIENDITA ──────────────────────────────────────────────────
async function sbGetTiendita() {
  const { data, error } = await sb.from('tiendita')
    .select('*').eq('disponible', true).order('orden').order('id');
  if (error) throw error;
  return data;
}

// ── WEBEUM ────────────────────────────────────────────────────
async function sbGetWebeum() {
  const { data, error } = await sb.from('webeum')
    .select('*').order('orden', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── AMBIENTES ─────────────────────────────────────────────────
async function sbGetAmbientes() {
  const { data, error } = await sb.from('ambientes')
    .select('*').order('orden').order('id');
  if (error) throw error;
  return data;
}

// ── MAILING — Edge Functions ───────────────────────────────────

// Envía email de bienvenida al registrar un nuevo usuario.
// Llama a supabase/functions/send-welcome
async function sbSendWelcomeEmail({ nombre, apellidos, username, email }) {
  try {
    const { data, error } = await sb.functions.invoke('send-welcome', {
      body: { nombre, apellidos, username, email }
    });
    if (error) throw error;
    console.log('[FRATE] Welcome email enviado:', data);
    return data;
  } catch (err) {
    // No bloquear el registro si el email falla
    console.warn('[FRATE] No se pudo enviar welcome email:', err?.message || err);
    return null;
  }
}

// Envía comprobante de compra con QR individuales por producto.
// Llama a supabase/functions/send-receipt
async function sbSendReceiptEmail(order) {
  try {
    const { data, error } = await sb.functions.invoke('send-receipt', {
      body: { order }
    });
    if (error) throw error;
    console.log('[FRATE] Receipt email enviado:', data);
    return data;
  } catch (err) {
    console.warn('[FRATE] No se pudo enviar receipt email:', err?.message || err);
    return null;
  }
}
