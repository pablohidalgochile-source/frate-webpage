// ============================================================
// FRATE APP — Lógica principal
// ============================================================

// ── HELPERS ──────────────────────────────────────────────────
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const clp = (n, min, max) => Math.min(Math.max(n, min), max);

function showToast(msg, duration = 3000) {
  let t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.classList.add('show'); });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, duration);
}

// ── STORAGE ──────────────────────────────────────────────────
const Storage = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: k => localStorage.removeItem(k)
};

// ── AGE GATE ─────────────────────────────────────────────────
function initAgeGate() {
  const gate = document.getElementById('age-gate');
  if (!gate) return;

  // Calcular max dinámico: hoy - 18 años
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 18);
  const input = document.getElementById('age-birth-input');
  if (input) input.max = maxDate.toISOString().split('T')[0];

  // Si ya verificó edad, restaurar sesión Supabase y mostrar sitio
  if (Storage.get('frate_age_ok')) {
    gate.classList.add('hidden');
    if (typeof sbRestoreSession === 'function') {
      sbRestoreSession().then(() => updateNavUser()).catch(() => updateNavUser());
    } else {
      updateNavUser();
    }
    return;
  }

  // ── helpers ──────────────────────────────────────────────
  function showStep(id) {
    document.querySelectorAll('.age-step').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function setBtn(id, loading, labelLoading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
    btn.textContent = loading ? labelLoading : btn.dataset.origLabel;
  }

  function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function dismissGate() {
    Storage.set('frate_age_ok', true);
    gate.style.opacity = '0';
    gate.style.transition = 'opacity 0.6s ease';
    setTimeout(() => {
      gate.classList.add('hidden');
      gate.style.opacity = '';
      gate.style.transition = '';
    }, 600);
    updateNavUser();
  }

  // ── PASO 1: Verificar edad ────────────────────────────────
  function checkAge() {
    showErr('age-error', '');
    const val = input?.value;
    if (!val) { showErr('age-error', 'Ingresa tu fecha de nacimiento.'); return; }
    const birth = new Date(val + 'T12:00:00');
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 18) { showErr('age-error', 'Debes ser mayor de 18 años para ingresar.'); return; }
    showStep('age-s2');
  }
  document.getElementById('age-gate-form')?.addEventListener('submit', e => { e.preventDefault(); checkAge(); });
  document.getElementById('age-verify-btn')?.addEventListener('click', checkAge);

  // ── PASO 2: Botones elección ──────────────────────────────
  document.getElementById('age-btn-register')?.addEventListener('click', () => showStep('age-s4'));
  document.getElementById('age-btn-login')?.addEventListener('click',    () => showStep('age-s3'));
  document.getElementById('age-btn-skip')?.addEventListener('click', dismissGate);

  // Botones volver
  document.querySelectorAll('.age-back-btn').forEach(btn => {
    btn.addEventListener('click', () => showStep(btn.dataset.back));
  });

  // ── PASO 3: Login con Supabase ────────────────────────────
  document.getElementById('age-login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    showErr('agl-error', '');
    const email = document.getElementById('agl-email')?.value.trim();
    const pass  = document.getElementById('agl-pass')?.value;
    setBtn('agl-submit', true, 'Ingresando...');
    try {
      const session = await sbSignIn(email, pass);
      document.getElementById('age-success-msg').textContent =
        `¡Hola de vuelta, ${session.nombre}! 🔥`;
      showStep('age-s5');
    } catch (err) {
      const msg = err.message?.includes('Invalid login credentials')
        ? 'Email o contraseña incorrectos.'
        : (err.message || 'Error al iniciar sesión.');
      showErr('agl-error', msg);
    } finally {
      setBtn('agl-submit', false);
    }
  });

  // ── PASO 4: Registro con Supabase ─────────────────────────
  document.getElementById('age-register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    showErr('agr-error', '');
    const nombre      = document.getElementById('agr-nombre')?.value.trim();
    const email       = document.getElementById('agr-email')?.value.trim();
    const pass        = document.getElementById('agr-pass')?.value;
    const telefono    = document.getElementById('agr-tel')?.value.trim();
    const rut         = document.getElementById('agr-rut')?.value.trim();
    const universidad = document.getElementById('agr-univ')?.value;
    if (pass.length < 6) { showErr('agr-error', 'La contraseña debe tener al menos 6 caracteres.'); return; }
    setBtn('agr-submit', true, 'Creando cuenta...');
    try {
      await sbSignUp({ nombre, email, password: pass, telefono, rut, universidad });
      // Login automático después del registro
      try { await sbSignIn(email, pass); } catch (_) {}
      document.getElementById('age-success-msg').textContent =
        `¡Cuenta creada, ${nombre}! Bienvenid@ a Frate 🎉`;
      showStep('age-s5');
    } catch (err) {
      const msg = err.message?.toLowerCase().includes('already registered')
        ? 'Este email ya tiene cuenta. Usa "Ya tengo cuenta".'
        : (err.message || 'Error al crear la cuenta.');
      showErr('agr-error', msg);
    } finally {
      setBtn('agr-submit', false);
    }
  });

  // ── PASO 5: Botón entrar ──────────────────────────────────
  document.getElementById('age-enter-btn')?.addEventListener('click', dismissGate);
}

// ── AUTH MODAL ────────────────────────────────────────────────
let authModal = null;
function initAuthModal() {
  authModal = $('#auth-modal');
  if (!authModal) return;

  // Tab switching
  $$('.modal-tab', authModal).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.modal-tab', authModal).forEach(t => t.classList.remove('active'));
      $$('.modal-form-panel', authModal).forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('#panel-' + tab.dataset.tab, authModal).classList.add('active');
    });
  });

  // Close
  $('#auth-modal-close').addEventListener('click', () => closeAuthModal());
  authModal.addEventListener('click', e => { if (e.target === authModal) closeAuthModal(); });

  // Login form
  $('#login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#login-email').value;
    const pass = $('#login-pass').value;
    const users = Storage.get('frate_users') || [];
    const pwHash = pass.split('').reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0, 0).toString(36);
    const user = users.find(u => u.email === email && (u.pwHash === pwHash || u.password === pass));
    if (!user) { showToast('Email o contraseña incorrectos.'); return; }
    // Migrate old plain-text password to hash
    if (user.password) { user.pwHash = user.password.split('').reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,0).toString(36); delete user.password; const us=Storage.get('frate_users')||[]; const i=us.findIndex(u=>u.email===email); if(i>=0){us[i]=user;Storage.set('frate_users',us);} }
    const safeUser = Object.assign({}, user); delete safeUser.pwHash; delete safeUser.password;
    Storage.set('frate_session', safeUser);
    closeAuthModal();
    updateNavUser();
    showToast(`¡Bienvenido de vuelta, ${user.nombre}! 🔥`);
  });

  // Register form
  $('#register-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const nombre = $('#reg-nombre').value.trim();
    const email = $('#reg-email').value.trim();
    const pass = $('#reg-pass').value;
    const pass2 = $('#reg-pass2').value;
    const rut = $('#reg-rut').value.trim();
    const telefono = $('#reg-tel').value.trim();
    const univ = $('#reg-univ').value;
    const carrera = $('#reg-carrera').value.trim();

    if (pass !== pass2) { showToast('Las contraseñas no coinciden.'); return; }
    if (pass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres.'); return; }

    const users = Storage.get('frate_users') || [];
    if (users.find(u => u.email === email)) { showToast('Este email ya está registrado.'); return; }

    // Store only a simple hash — never raw password
    const pwHash = pass.split('').reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0, 0).toString(36);
    const newUser = {
      id: Date.now(),
      nombre, email, pwHash, rut, telefono, univ, carrera,
      createdAt: new Date().toISOString(),
      tickets: [], reservas: []
    };
    users.push(newUser);
    Storage.set('frate_users', users);
    const safeSession = Object.assign({}, newUser); delete safeSession.pwHash;
    Storage.set('frate_session', safeSession);
    closeAuthModal();
    updateNavUser();
    showToast(`¡Bienvenido a Frate, ${nombre}! 🎉`);
  });

  // Nav user button: frate-cuenta.js gestiona esto vía onclick
  // Solo asignamos aquí si frate-cuenta.js no está disponible
  const navBtn = $('#nav-user-btn');
  if (navBtn && !navBtn._cuentaHandler) {
    navBtn.addEventListener('click', () => {
      const session = Storage.get('frate_session');
      if (session) {
        if (typeof openCuenta === 'function') openCuenta();
      } else {
        openAuthModal('login');
      }
    });
  }
}

function openAuthModal(tab = 'login') {
  if (!authModal) return;
  authModal.classList.add('active');
  $$('.modal-tab', authModal).forEach(t => t.classList.remove('active'));
  $$('.modal-form-panel', authModal).forEach(p => p.classList.remove('active'));
  $(`.modal-tab[data-tab="${tab}"]`, authModal)?.classList.add('active');
  $(`#panel-${tab}`, authModal)?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  authModal?.classList.remove('active');
  document.body.style.overflow = '';
}

function updateNavUser() {
  const btn = $('#nav-user-btn');
  if (!btn) return;
  const session = Storage.get('frate_session');
  if (session) {
    const display = session.username ? '@' + session.username : (session.nombres || session.nombre || '').split(' ')[0];
    btn.textContent = display + ' ↗';
    btn.title = 'Mi cuenta';
  } else {
    btn.textContent = 'Mi cuenta';
    btn.title = '';
  }
}

// ── NAVBAR ────────────────────────────────────────────────────
function initNavbar() {
  const nav = $('#navbar');
  const hamburger = $('#hamburger');
  const mobileMenu = $('#mobile-menu');
  const mobileClose = $('#mobile-menu-close');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');

    // Floating CTA
    const floater = $('#floating-cta');
    if (floater) {
      if (window.scrollY > 400) floater.classList.add('visible');
      else floater.classList.remove('visible');
    }
  }, { passive: true });

  hamburger?.addEventListener('click', () => mobileMenu?.classList.add('open'));
  mobileClose?.addEventListener('click', () => mobileMenu?.classList.remove('open'));
  $$('#mobile-menu a').forEach(a => a.addEventListener('click', () => mobileMenu?.classList.remove('open')));
}

// ── SCROLL REVEAL ─────────────────────────────────────────────
function initReveal() {
  const els = $$('.reveal');
  if (!els.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => observer.observe(el));
}

// ── EVENTOS ───────────────────────────────────────────────────
function initEventos() {
  if (typeof FRATE_EVENTOS === 'undefined') return;
  const grid = $('#eventos-grid');
  if (!grid) return;

  function formatPeso(n) { return '$' + n.toLocaleString('es-CL'); }

  function renderEventos(filter = 'Todos') {
    const filtered = filter === 'Todos' ? FRATE_EVENTOS : FRATE_EVENTOS.filter(e => e.tipo === filter);
    grid.innerHTML = filtered.map(ev => {
      const [diaNom, diaNum, ...mes] = ev.fecha.split(' ');
      return `
      <div class="evento-card reveal" data-tipo="${ev.tipo}">
        <div class="evento-fecha-block">
          <div class="evento-dia">${diaNum}</div>
          <div class="evento-mes">${diaNom}</div>
          <div class="evento-mes">${mes.join(' ')}</div>
        </div>
        <div class="evento-info">
          <div class="evento-nombre">${ev.nombre}</div>
          <div class="evento-djs">${ev.djs.join(' · ')}</div>
          <div class="evento-tags">
            <span class="evento-tag">${ev.ambiente}</span>
            <span class="evento-tag">${ev.hora} hrs</span>
          </div>
        </div>
        <div class="evento-precios">
          <div class="evento-precio-anticipada">Anticipada</div>
          <div class="evento-precio-valor">${formatPeso(ev.precio_anticipada)} <small>/ General ${formatPeso(ev.precio_general)}</small></div>
          <a href="${FRATE_CONFIG.passline}" target="_blank" class="btn-ticket">TICKETS</a>
        </div>
      </div>`;
    }).join('');
    initReveal();
  }

  renderEventos();

  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEventos(btn.dataset.filter);
    });
  });
}

// ── AMBIENTES ─────────────────────────────────────────────────
function initAmbientes() {
  if (typeof FRATE_AMBIENTES === 'undefined') return;
  const grid = $('#ambientes-grid');
  if (!grid) return;

  grid.innerHTML = FRATE_AMBIENTES.map((a, i) => `
    <div class="ambiente-card reveal reveal-delay-${i+1}">
      <div class="ambiente-placeholder" style="background: ${a.id === 'fuego' ? '#0e0608' : a.id === 'aire' ? '#060a0e' : '#06080a'}; min-height:420px;">
        <span style="font-size:0.7rem;color:#2a2a2c;z-index:1;position:relative">
          foto ${a.nombre.toLowerCase()}
        </span>
      </div>
      <div class="ambiente-overlay">
        <div class="ambiente-musica">${a.musica}</div>
        <div class="ambiente-nombre">${a.nombre}</div>
        <div class="ambiente-desc">${a.descripcion}</div>
        <div class="ambiente-capacidad">${a.capacidad}</div>
      </div>
    </div>
  `).join('');
  initReveal();
}

// ── GALERÍA ───────────────────────────────────────────────────
function initGaleria() {
  if (typeof FRATE_GALERIA === 'undefined') return;
  const grid = $('#galeria-grid');
  if (!grid) return;

  const colors = { 'Fuego': '#120608', 'Aire': '#060812', 'Schop': '#060c08' };
  grid.innerHTML = FRATE_GALERIA.map((g, i) => `
    <div class="galeria-item reveal" data-ambiente="${g.ambiente}">
      <div class="galeria-placeholder" style="height:${g.alto}px; background:${colors[g.ambiente] || '#111'};">
        <span style="z-index:1;position:relative">foto ambiente · ${g.ambiente}</span>
      </div>
      <div class="galeria-item-overlay"><span style="font-size:1.2rem">+</span></div>
    </div>
  `).join('');
  initReveal();

  $$('.galeria-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.galeria-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      $$('.galeria-item').forEach(item => {
        item.style.display = (f === 'Todos' || item.dataset.ambiente === f) ? 'block' : 'none';
      });
    });
  });
}

// ── WEBEUM ────────────────────────────────────────────────────
function initWebeum() {
  if (typeof FRATE_WEBEUM === 'undefined') return;
  const grid = $('#webeum-grid');
  if (!grid) return;

  grid.innerHTML = FRATE_WEBEUM.map((ep, i) => `
    <a href="${ep.url}" target="_blank" class="webeum-card reveal reveal-delay-${i+1}" style="text-decoration:none">
      <div class="webeum-thumb">
        <div class="webeum-play">▶</div>
      </div>
      <div class="webeum-info">
        <div class="webeum-ep">Webeum Humanum Est</div>
        <div class="webeum-titulo">${ep.titulo}</div>
        <div class="webeum-meta"><span>${ep.fecha}</span><span>${ep.duracion}</span></div>
      </div>
    </a>
  `).join('');
  initReveal();
}

// ── STATS ─────────────────────────────────────────────────────
function initStats() {
  if (typeof FRATE_STATS === 'undefined') return;
  const grid = $('#stats-grid');
  if (!grid) return;
  grid.innerHTML = FRATE_STATS.map((s, i) => `
    <div class="stat-card reveal reveal-delay-${i+1}">
      <div class="stat-num">${s.numero}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
  initReveal();
}

// ── RESERVAS ──────────────────────────────────────────────────
function initReservas() {
  const form = $('#reserva-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const session = Storage.get('frate_session');

    if (session) {
      const users = Storage.get('frate_users') || [];
      const idx = users.findIndex(u => u.id === session.id);
      if (idx >= 0) {
        users[idx].reservas.push({ ...data, id: Date.now(), estado: 'pendiente' });
        Storage.set('frate_users', users);
      }
    }

    // WhatsApp message
    const msg = encodeURIComponent(
      `*Reserva Frate*\nNombre: ${data.nombre}\nFecha: ${data.fecha}\nTipo: ${data.tipo}\nPersonas: ${data.personas}\nMensaje: ${data.mensaje || '-'}`
    );
    showToast('¡Reserva enviada! Te contactaremos pronto. 🔥');
    form.reset();
  });
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAgeGate();
  initAuthModal();
  initNavbar();
  initReveal();
  initEventos();
  initAmbientes();
  initGaleria();
  initWebeum();
  initStats();
  initReservas();
  updateNavUser();
});
