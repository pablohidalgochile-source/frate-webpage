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
async function sbCrearPedido({ clienteId, nombreCliente, emailCliente, items, total }) {
  const { data: pedido, error: e1 } = await sb.from('pedidos')
    .insert({ cliente_id: clienteId||null, nombre_cliente: nombreCliente,
              email_cliente: emailCliente, estado: 'pendiente', total })
    .select().single();
  if (e1) throw e1;

  const rows = items.map(i => ({
    pedido_id:        pedido.id,
    evento_id:        i.eventoId,
    tipo_ticket_id:   i.tipoTicketId,
    nombre_evento:    i.nombreEvento,
    nombre_ticket:    i.nombreTicket,
    cantidad:         i.cantidad,
    precio_unitario:  i.precio,
    nombre_asistente: i.nombreAsistente || '',
    rut_asistente:    i.rutAsistente    || ''
  }));
  const { error: e2 } = await sb.from('items_pedido').insert(rows);
  if (e2) throw e2;
  return pedido;
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
