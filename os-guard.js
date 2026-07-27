/* ============================================================
   FRATE OS · control de acceso + navegación de los manuales.
   Los manuales explican el sistema por dentro → solo staff logueado.
   Se incluye DESPUÉS de supabase-js en cada manual.
   ============================================================ */
(function () {
  var SB_URL = 'https://ydwlpraoaaijlfssevoh.supabase.co';
  var SB_KEY = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';
  var sb = window.supabase.createClient(SB_URL, SB_KEY);
  window.osSb = sb;

  var MANUALES = [
    { id: '00', url: '/os',        t: 'El mapa' },
    { id: '01', url: '/os-entrada', t: 'La entrada' },
    { id: '02', url: '/os-dinero',  t: 'El dinero' },
    { id: '03', url: '/os-persona', t: 'La persona' },
    { id: '04', url: '/os-noche',   t: 'La noche' },
    { id: '05', url: '/os-panel',   t: 'El panel' },
    { id: '06', url: '/os-reglas',  t: 'Reglas de oro' },
    { id: '07', url: '/os-besucona', t: 'BESUCONA' },
    { id: '08', url: '/os-comparar', t: 'Dos noches' },
    { id: '09', url: '/os-cliente',  t: 'Un cliente' }
  ];
  window.OS_MANUALES = MANUALES;

  // Serie del ERP. Cada sistema tiene su propia serie; el conmutador de arriba
  // permite saltar entre ellas sin volver al índice.
  var MANUALES_ERP = [
    { id: '00', url: '/os-erp',         t: 'El mapa' },
    { id: '01', url: '/os-erp-persona', t: 'La persona' },
    { id: '02', url: '/os-erp-noche',   t: 'La noche' },
    { id: '03', url: '/os-erp-dinero',  t: 'El dinero' },
    { id: '04', url: '/os-erp-caja',    t: 'La caja' },
    { id: '05', url: '/os-erp-bodega',  t: 'La bodega' },
    { id: '06', url: '/os-erp-reglas',  t: 'Reglas de oro' }
  ];
  window.OS_MANUALES_ERP = MANUALES_ERP;

  // Serie de FLYER. Donde nace el evento: la campaña, el flyer, el reel y el
  // brief que despierta a los otros tres sistemas.
  var MANUALES_FLY = [
    { id: '00', url: '/os-flyer',        t: 'El mapa' },
    { id: '01', url: '/os-flyer-evento', t: 'Un evento' },
    { id: '02', url: '/os-flyer-diseno', t: 'Un flyer' },
    { id: '03', url: '/os-flyer-reel',   t: 'Un reel' },
    { id: '04', url: '/os-flyer-brief',  t: 'El brief' },
    { id: '05', url: '/os-flyer-mesa',   t: 'La mesa' },
    { id: '06', url: '/os-flyer-reglas', t: 'Reglas de oro' }
  ];
  window.OS_MANUALES_FLY = MANUALES_FLY;

  var SERIES = {
    web: { k: 'web', l: 'Web',   home: '/os',       lista: MANUALES },
    erp: { k: 'erp', l: 'ERP',   home: '/os-erp',   lista: MANUALES_ERP },
    pos: { k: 'pos', l: 'POS',   home: null,        lista: [] },
    fly: { k: 'fly', l: 'Flyer', home: '/os-flyer', lista: MANUALES_FLY }
  };

  // ── Barra superior: conmutador de sistema + manuales de la serie actual ──
  // osBarra('03')         → serie de la Web (como siempre)
  // osBarra('03', 'erp')  → serie del ERP
  window.osBarra = function (actual, sistema) {
    var s = SERIES[sistema] || SERIES.web;
    var sw = ['web', 'erp', 'pos', 'fly'].map(function (k) {
      var o = SERIES[k];
      var cls = k === s.k ? 'here' : k;
      if (!o.home) return '<span class="' + cls + '" title="Todavía no está escrito">' + o.l + '</span>';
      return '<a href="' + o.home + '" class="' + cls + '">' + o.l + '</a>';
    }).join('');
    var links = s.lista.map(function (m) {
      return '<a href="' + m.url + '"' + (m.id === actual ? ' class="on"' : '') + '>' +
             m.id + ' · ' + m.t + '</a>';
    }).join('');
    return '<div class="topbar"><div class="in">' +
      '<span class="mark">F<em>R</em>ATE <span style="color:var(--gris2);font-size:.72rem;letter-spacing:3px;">OS</span></span>' +
      '<span class="sysw">' + sw + '</span>' +
      '<nav class="navman">' + links + '<a href="/admin" style="color:var(--gris2)">← Panel</a></nav>' +
      '</div></div>';
  };

  // ── Puerta: solo personal con cuenta ──
  function pintarGate(msg) {
    var d = document.createElement('div');
    d.id = 'os-gate';
    d.innerHTML =
      '<div class="box">' +
      '<div class="mark" style="font-size:1.4rem;">F<em>R</em>ATE <span style="color:var(--gris2);font-size:.8rem;letter-spacing:3px;">OS</span></div>' +
      '<p style="color:var(--gris);font-size:.86rem;margin-top:8px;">Manual interno del sistema.<br>Entra con tu cuenta de FRATE.</p>' +
      '<input id="os-mail" type="email" placeholder="Tu correo" autocomplete="email">' +
      '<input id="os-pass" type="password" placeholder="Tu contraseña" autocomplete="current-password">' +
      '<button class="btn" id="os-btn">Entrar</button>' +
      '<div class="err" id="os-err">' + (msg || '') + '</div>' +
      '</div>';
    document.body.appendChild(d);
    var btn = document.getElementById('os-btn');
    var entrar = function () {
      var em = (document.getElementById('os-mail').value || '').trim().toLowerCase();
      var pw = document.getElementById('os-pass').value || '';
      if (!em || !pw) { document.getElementById('os-err').textContent = 'Escribe tu correo y contraseña.'; return; }
      btn.disabled = true; btn.textContent = 'Verificando…';
      sb.auth.signInWithPassword({ email: em, password: pw }).then(function (r) {
        if (r.error) { document.getElementById('os-err').textContent = r.error.message || 'No pudimos entrar.'; btn.disabled = false; btn.textContent = 'Entrar'; return; }
        location.reload();
      });
    };
    btn.addEventListener('click', entrar);
    document.getElementById('os-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  }

  window.osProteger = function () {
    document.body.style.visibility = 'hidden';
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s) { document.body.style.visibility = 'visible'; pintarGate(''); return; }
      return sb.from('clientes').select('rol').eq('id', s.user.id).maybeSingle().then(function (p) {
        var rol = p && p.data && p.data.rol;
        if (['admin', 'rrpp', 'portero'].indexOf(String(rol)) < 0) {
          sb.auth.signOut();
          document.body.style.visibility = 'visible';
          pintarGate('Esa cuenta no es del equipo. Pide acceso al administrador.');
          return;
        }
        document.body.style.visibility = 'visible';
        var g = document.getElementById('os-gate'); if (g) g.remove();
      });
    }).catch(function () { document.body.style.visibility = 'visible'; pintarGate(''); });
  };
})();
