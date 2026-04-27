// ============================================================
// FRATE SUPABASE — Cliente y autenticación real
// ============================================================

// ⚠️  REEMPLAZA estos dos valores con los de tu proyecto:
//     supabase.com → tu proyecto → Settings → API
const SUPABASE_URL  = 'https://ydwlpraoaaijlfssevoh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── REGISTRO ─────────────────────────────────────────────────
async function sbSignUp({ nombre, email, password, telefono, rut, universidad }) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { nombre, telefono, rut, universidad } }
  });
  if (error) throw error;

  if (data.user) {
    await sb.from('clientes').upsert({
      id:          data.user.id,
      nombre:      nombre      || '',
      email:       email       || '',
      telefono:    telefono    || '',
      rut:         rut         || '',
      universidad: universidad || ''
    });
  }
  return data;
}

// ── LOGIN ─────────────────────────────────────────────────────
async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile } = await sb.from('clientes')
    .select('*').eq('id', data.user.id).single();

  const session = {
    id:        data.user.id,
    email:     data.user.email,
    nombre:    profile?.nombre    || email.split('@')[0],
    telefono:  profile?.telefono  || '',
    rut:       profile?.rut       || '',
    univ:      profile?.universidad || ''
  };
  Storage.set('frate_session', session);
  return session;
}

// ── LOGOUT ────────────────────────────────────────────────────
async function sbSignOut() {
  await sb.auth.signOut();
  Storage.del('frate_session');
}

// ── RESTAURAR SESIÓN AL CARGAR ────────────────────────────────
async function sbRestoreSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;

  const user = data.session.user;
  const { data: profile } = await sb.from('clientes')
    .select('*').eq('id', user.id).single();

  const session = {
    id:       user.id,
    email:    user.email,
    nombre:   profile?.nombre    || user.email.split('@')[0],
    telefono: profile?.telefono  || '',
    rut:      profile?.rut       || '',
    univ:     profile?.universidad || ''
  };
  Storage.set('frate_session', session);
  return session;
}
