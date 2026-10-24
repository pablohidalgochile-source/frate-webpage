/* ============================================================
   FRATE · Puerta — Aforo + Pulseras EN VIVO (hermana del ERP)
   Se conecta al Supabase del ERP (zsilmm…), donde viven `aforo_live`
   + los RPC atómicos (incrementar_aforo / set_capacidad_aforo).
   Se incluye en /validacion y /admin: los dos ven y mueven la MISMA
   cuenta que el ERP, al instante (realtime sobre la misma fila).
   Diseño propio FRATE. Español de Chile.
   ============================================================ */
(function () {
  // ⚙️ CONFIG — la anon key del ERP es PÚBLICA (va en el cliente, igual que la de la web).
  // El dueño la instala: define window.FRATE_ERP_ANON antes de cargar este script,
  // o pégala aquí abajo reemplazando el placeholder.
  var ERP_URL  = (window.FRATE_ERP_URL || 'https://zsilmmixlugwawzpmayx.supabase.co');
  var ERP_ANON = (window.FRATE_ERP_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaWxtbWl4bHVnd2F3enBtYXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTIxNTUsImV4cCI6MjA5MjYyODE1NX0.hD3vODb7t8xCH84DYLRAAXHBkTOnGXzkr9BekQTdDeA');

  if (!window.supabase || !window.supabase.createClient) { try { console.warn('[pulseras] falta supabase-js en la página'); } catch (e) {} return; }
  var _configOk = ERP_ANON && ERP_ANON.indexOf('PEGA_AQUI') !== 0;
  var erp = window.supabase.createClient(ERP_URL, ERP_ANON);

  var _ev = null, _fila = null, _unsub = null, _cont = null, _mode = 'puerta';

  // ── Helpers ──
  function _totalEntregadas(pobj) { if (!pobj) return 0; return Object.keys(pobj).reduce(function (s, k) { return s + (parseInt(pobj[k]) || 0); }, 0); }
  function _pulserasDef(ev) {
    var arr = ev && ev.conteos_data && ev.conteos_data.pulseras;
    if (!Array.isArray(arr)) return [];
    var seen = {}, out = [];
    arr.forEach(function (p) {
      var c = (p.color || '').toString();
      if (c && !seen[c]) {
        seen[c] = 1;
        var inicial = parseInt(p.inicial != null ? p.inicial : (p.cantidad != null ? p.cantidad : p.entregadas)) || 0;
        var extra = parseInt(p.extra) || 0;
        out.push({ color: c, tipo: p.tipo || '', inicial: inicial, extra: extra, total: inicial + extra });
      }
    });
    return out;
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function _colorHex(name) { // color visual del chip a partir del nombre
    var n = String(name || '').toLowerCase();
    var map = { roja: '#e2444a', rojo: '#e2444a', azul: '#3b82f6', verde: '#22c55e', amarilla: '#eab308', amarillo: '#eab308', naranja: '#f97316', rosa: '#ec4899', rosada: '#ec4899', morada: '#a855f7', morado: '#a855f7', violeta: '#a855f7', negra: '#4b5563', negro: '#4b5563', blanca: '#e5e7eb', blanco: '#e5e7eb', celeste: '#38bdf8', dorada: '#d4a832', dorado: '#d4a832', fucsia: '#d946ef' };
    for (var k in map) { if (n.indexOf(k) >= 0) return map[k]; }
    return '#888';
  }

  // ── Servicio (portado 1:1 de aforoService.js, vanilla) ──
  async function findEventoActivo() {
    try {
      var r = await erp.from('eventos_operativos').select('id,nombre,fecha,hora_inicio,hora_fin,estado,conteos_data').in('estado', ['abierto', 'activo']).order('fecha', { ascending: false }).limit(1);
      var ev = (r.data || [])[0];
      if (!ev) return null;
      var cd = ev.conteos_data || {};
      var cumples  = Array.isArray(cd.cumples)  ? cd.cumples  : [];
      var reservas = Array.isArray(cd.reservas) ? cd.reservas : [];
      var sumPax = function (arr) { return arr.reduce(function (s, x) { return s + (parseInt(x && x.personas) || 0); }, 0); };
      return { id: ev.id, nombre: ev.nombre, fecha: ev.fecha, pulseras: _pulserasDef(ev),
               cumples: cumples.length, cumplesPax: sumPax(cumples),
               reservas: reservas.length, reservasPax: sumPax(reservas) };
    } catch (e) { return null; }
  }
  async function loadAforo(id) {
    try {
      var r = await erp.from('aforo_live').select('*').eq('evento_id', id).maybeSingle();
      if (r.data) return r.data;
      var n = await erp.rpc('incrementar_aforo', { p_evento: id, p_aforo: 0 });
      return Array.isArray(n.data) ? n.data[0] : n.data;
    } catch (e) { return null; }
  }
  async function darPulsera(id, color, delta) { try { var r = await erp.rpc('incrementar_aforo', { p_evento: id, p_aforo: delta, p_pulsera: color, p_delta: delta }); if (r.error) throw r.error; return Array.isArray(r.data) ? r.data[0] : r.data; } catch (e) { try { console.error('[darPulsera]', e.message || e); } catch (x) {} return null; } }
  async function incAforo(id, delta) { try { var r = await erp.rpc('incrementar_aforo', { p_evento: id, p_aforo: delta }); if (r.error) throw r.error; return Array.isArray(r.data) ? r.data[0] : r.data; } catch (e) { return null; } }
  async function setCapacidad(id, cap) { try { var r = await erp.rpc('set_capacidad_aforo', { p_evento: id, p_cap: parseInt(cap) || 0 }); if (r.error) throw r.error; return Array.isArray(r.data) ? r.data[0] : r.data; } catch (e) { return null; } }
  function subscribeAforo(id, cb) {
    var ch = erp.channel('aforo-' + id + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aforo_live', filter: 'evento_id=eq.' + id }, function (p) { try { cb(p.new); } catch (e) {} })
      .subscribe();
    return function () { try { erp.removeChannel(ch); } catch (e) {} };
  }

  // ── Acciones desde la UI (expuestas) ──
  async function _accion(fn) { if (!_ev) return; var nueva = await fn(); if (nueva) { _fila = nueva; _render(); } }
  window._plsDar    = function (color, d) { _accion(function () { return darPulsera(_ev.id, color, d); }); };
  window._plsAforo  = function (d)        { _accion(function () { return incAforo(_ev.id, d); }); };
  window._plsCap    = function ()         { var v = prompt('Capacidad máxima del evento (0 = sin tope):', (_fila && _fila.capacidad) || 0); if (v === null) return; _accion(function () { return setCapacidad(_ev.id, v); }); };
  // Modo "cuántas me quedan": tocas el número y escribes las que te QUEDAN de ese color
  window._plsQuedan = function (color) {
    if (!_ev) return;
    var d = (_ev.pulseras || []).filter(function (x) { return x.color === color; })[0];
    if (!d) return;
    var pobj = (_fila && _fila.pulseras) || {};
    var e = parseInt(pobj[color]) || 0;
    var quedanAhora = d.total - e;
    var v = prompt('¿Cuántas pulseras ' + color + ' te QUEDAN? (stock ' + d.total + ')', quedanAhora);
    if (v === null) return;
    v = parseInt(v); if (isNaN(v) || v < 0) return;
    var delta = (d.total - v) - e;          // entregadas nuevas − entregadas actuales
    if (delta === 0) return;
    _plsDar(color, delta);
  };
  // ☕ En break — contador LOCAL de la puerta (el ERP no lo guarda). Persiste por evento.
  function _breakKey() { return 'frate_break_' + (_ev ? _ev.id : '0'); }
  function _breakGet() { try { return parseInt(localStorage.getItem(_breakKey())) || 0; } catch (e) { return 0; } }
  window._plsBreak = function (d) { if (!_ev) return; var v = Math.max(0, _breakGet() + d); try { localStorage.setItem(_breakKey(), v); } catch (e) {} _render(); };

  // ── Render ──
  function _render() {
    if (!_cont) return;
    if (!_configOk) { _cont.innerHTML = '<div style="background:rgba(232,54,61,.12);border:1px solid #E8363D;border-radius:10px;padding:14px;color:#E8363D;font-size:.86rem;">🔑 Falta la <b>anon key del ERP</b> para conectar las pulseras. Instálala en <code>frate-pulseras.js</code> (o <code>window.FRATE_ERP_ANON</code>). Es pública — va en el cliente.</div>'; return; }
    if (!_ev) { _cont.innerHTML = '<div style="color:var(--gris,#888);text-align:center;padding:18px;font-size:.9rem;">🎟️ No hay evento abierto en el ERP ahora. La puerta de pulseras aparece cuando el ERP abre el evento de la noche.</div>'; return; }
    var f = _fila || { aforo: 0, pulseras: {}, capacidad: 0 };
    var aforo = f.aforo || 0, cap = f.capacidad || 0, pobj = f.pulseras || {};
    var entregadas = _totalEntregadas(pobj);
    var pct = cap > 0 ? Math.min(100, Math.round(aforo / cap * 100)) : 0;
    var cotejoDif = entregadas - aforo;
    var defs = _ev.pulseras || [];

    var head = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<div><div style="font-size:.7rem;letter-spacing:1px;text-transform:uppercase;color:var(--gris,#888);">🎟️ Puerta · Aforo en vivo · <b style="color:#22c55e;">● sincronizado con ERP</b></div>' +
      '<div style="font-size:2.4rem;font-weight:900;line-height:1;margin-top:4px;">' + aforo + (cap ? ' <span style="font-size:1.1rem;color:var(--gris,#888);font-weight:600;">/ ' + cap + ' · ' + pct + '%</span>' : '') + '</div>' +
      '<div style="font-size:.72rem;color:var(--gris,#888);margin-top:2px;">' + _esc(_ev.nombre || 'Evento') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '<button onclick="_plsAforo(1)" style="background:#22c55e;color:#04120a;font-weight:800;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;">+1 aforo</button>' +
      '<button onclick="_plsAforo(-1)" style="background:var(--bg3,#1a1a1c);color:#fff;border:1px solid var(--border,#333);border-radius:8px;padding:8px 12px;cursor:pointer;">−1</button>' +
      '<button onclick="_plsCap()" style="background:var(--bg3,#1a1a1c);color:#fff;border:1px solid var(--border,#333);border-radius:8px;padding:8px 12px;cursor:pointer;">⚙️ Capacidad</button>' +
      '</div></div>';

    // Chips: En break (local) · Cumples · Reservas
    var _pill = function (label, val, color) {
      return '<div style="background:var(--bg2,#141416);border:1px solid var(--border,#2a2a2c);border-radius:10px;padding:8px 12px;min-width:86px;">' +
        '<div style="font-size:.6rem;letter-spacing:.5px;text-transform:uppercase;color:var(--gris,#888);">' + label + '</div>' +
        '<div style="font-size:1.25rem;font-weight:900;color:' + color + ';line-height:1.15;">' + val + '</div></div>';
    };
    var _brk = _breakGet();
    var breakPill = '<div style="background:var(--bg2,#141416);border:1px solid var(--border,#2a2a2c);border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:10px;">' +
      '<div><div style="font-size:.6rem;letter-spacing:.5px;text-transform:uppercase;color:var(--gris,#888);">☕ En break</div>' +
      '<div style="font-size:1.25rem;font-weight:900;line-height:1.15;">' + _brk + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;">' +
      '<button onclick="_plsBreak(1)" style="width:30px;height:20px;border-radius:6px;background:var(--bg3,#1a1a1c);color:#fff;border:1px solid var(--border,#333);font-size:.85rem;cursor:pointer;line-height:1;">+</button>' +
      '<button onclick="_plsBreak(-1)" style="width:30px;height:20px;border-radius:6px;background:var(--bg3,#1a1a1c);color:#fff;border:1px solid var(--border,#333);font-size:.85rem;cursor:pointer;line-height:1;">−</button>' +
      '</div></div>';
    var chips = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' + breakPill +
      _pill('🎂 Cumples',  _ev.cumples  + (_ev.cumplesPax  ? ' · ' + _ev.cumplesPax  + 'p' : ''), '#D4A832') +
      _pill('🍾 Reservas', _ev.reservas + (_ev.reservasPax ? ' · ' + _ev.reservasPax + 'p' : ''), '#a855f7') +
      '</div>';

    // Cotejo
    var cotColor = cotejoDif === 0 ? '#22c55e' : '#eab308';
    var cotTxt = cotejoDif === 0 ? '✅ calzan' : (cotejoDif > 0 ? '⚠️ ' + cotejoDif + ' pulseras de más que el aforo' : '⚠️ ' + (-cotejoDif) + ' de aforo sin pulsera');
    var cotejo = '<div style="font-size:.76rem;color:' + cotColor + ';margin-bottom:12px;">🔎 Cotejo: <b>' + entregadas + '</b> pulseras · <b>' + aforo + '</b> aforo — ' + cotTxt + '</div>';

    // Pulseras por color
    var cols = defs.length ? defs.map(function (d) {
      var e = parseInt(pobj[d.color]) || 0;
      var quedan = d.total - e;
      var hex = _colorHex(d.color);
      var alerta = e > d.total;
      return '<div style="background:var(--bg2,#141416);border:1px solid var(--border,#2a2a2c);border-radius:12px;padding:12px;min-width:150px;flex:1;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="width:14px;height:14px;border-radius:99px;background:' + hex + ';flex:0 0 auto;border:1px solid rgba(255,255,255,.2);"></span><b style="font-size:.92rem;">' + _esc(d.color) + '</b>' + (d.tipo ? '<span style="font-size:.66rem;color:var(--gris,#888);">· ' + _esc(d.tipo) + '</span>' : '') + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<button onclick="_plsDar(\'' + _esc(d.color).replace(/'/g, '') + '\',-1)" style="width:44px;height:44px;border-radius:10px;background:var(--bg3,#1a1a1c);color:#fff;border:1px solid var(--border,#333);font-size:1.3rem;cursor:pointer;">−</button>' +
        '<div onclick="_plsQuedan(\'' + _esc(d.color).replace(/'/g, '') + '\')" title="Tocar para fijar cuántas te quedan" style="text-align:center;cursor:pointer;"><div style="font-size:1.5rem;font-weight:900;line-height:1;">' + e + '</div><div style="font-size:.64rem;color:' + (alerta ? '#E8363D' : 'var(--gris,#888)') + ';">' + (alerta ? '¡de más!' : 'quedan ' + quedan) + '</div></div>' +
        '<button onclick="_plsDar(\'' + _esc(d.color).replace(/'/g, '') + '\',1)" style="width:44px;height:44px;border-radius:10px;background:' + hex + ';color:#fff;border:0;font-size:1.3rem;font-weight:800;cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.4);">+</button>' +
        '</div></div>';
    }).join('') : '<div style="color:var(--gris,#888);font-size:.8rem;padding:8px;">El ERP aún no definió las pulseras (colores) de este evento.</div>';

    _cont.innerHTML = head + chips + cotejo + '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + cols + '</div>';
  }

  // ── API pública ──
  async function mount(containerId, opts) {
    _cont = document.getElementById(containerId);
    if (!_cont) return;
    _mode = (opts && opts.mode) || 'puerta';
    _render(); // pinta el estado (o el aviso de config)
    if (!_configOk) return;
    _ev = await findEventoActivo();
    if (_ev) { _fila = await loadAforo(_ev.id); if (_unsub) _unsub(); _unsub = subscribeAforo(_ev.id, function (fila) { _fila = fila; _render(); }); }
    _render();
  }
  function refresh() { if (_ev) loadAforo(_ev.id).then(function (f) { if (f) { _fila = f; _render(); } }); }

  window.FRATE_PULSERAS = { mount: mount, refresh: refresh };
})();
