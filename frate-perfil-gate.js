/* ============================================================
   FRATE · Datos que faltan para las entradas de MIEMBROS
   ------------------------------------------------------------
   Las entradas solo_miembros van a nombre del dueño de la cuenta y, según
   el público del ticket, piden sexo (F/M) o institución (U). Este módulo:
     · lee el perfil EN VIVO desde clientes (nunca desde localStorage),
     · dice qué falta para una entrada (falta),
     · abre UNA sola ventana «Nos falta un dato» que pide todo lo que falta,
     · traduce los códigos que devuelve crear-pago.
   El candado real está en crear-pago; esto es para que la persona no choque
   recién al final. Si este archivo no carga, la página sigue como antes.
   Usa el `sb` global de la página (frate-supabase.js o comprar.html).
   ============================================================ */
(function () {
  var NO_EST = 'NO SOY ESTUDIANTE';
  var CODIGOS_DATOS = ['REQUIERE_PERFIL', 'REQUIERE_RUT', 'REQUIERE_SEXO', 'REQUIERE_INSTITUCION'];
  var CODIGOS_AVISO = ['SEXO_NO_CORRESPONDE', 'SEXO_RUT_INCONSISTENTE', 'NO_MEZCLAR', 'UNA_POR_PERSONA',
                       'YA_RESERVADA', 'PERFIL_NO_DISPONIBLE', 'NO_REANUDABLE'];
  var GEN_TXT = { F: 'mujeres', M: 'hombres' };
  var SEXO_TXT = { F: 'Mujer', M: 'Hombre', X: 'Prefiero no decirlo' };
  // Sexo que exige la entrada (igual que crear-pago): F/M directo; una
  // universitaria (U) con HOMBRE o MUJER en el nombre exige también ese sexo.
  function sexoReq(tt) {
    var g = String((tt && tt.genero) || '').trim().toUpperCase();
    if (g === 'F' || g === 'M') return g;
    if (g === 'U') { var n = String((tt && tt.nombre) || '').toUpperCase(), h = /HOMBRE/.test(n), m = /MUJER/.test(n); return h && !m ? 'M' : (m && !h ? 'F' : ''); }
    return '';
  }
  var cache = null;          // { uid, email, perfil, sinSexo }
  var enCurso = null;        // promesa de exigir() en curso (doble toque)

  function _sb() { try { return (typeof sb !== 'undefined') ? sb : null; } catch (_) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rutLimpio(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function rutFmt(r) { var c = rutLimpio(r); if (c.length < 2) return c; return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1); }
  function docExt(r) { return String(r || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }   // pasaporte/DNI
  function rutOk(r) {
    var c = rutLimpio(r); if (c.length < 7 || c.length > 9) return false;
    var dv = c.slice(-1), num = c.slice(0, -1), s = 0, m = 2;
    for (var i = num.length - 1; i >= 0; i--) { s += parseInt(num[i], 10) * m; m = m < 7 ? m + 1 : 2; }
    var res = 11 - (s % 11); var calc = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return calc === dv;
  }
  function aviso(texto) {
    if (typeof window.showToast === 'function') { window.showToast(texto, 6000); return; }
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;background:#1b1b20;color:#f4f4f6;border:1px solid #3a3a3c;border-radius:10px;padding:12px 16px;max-width:92vw;font:14px -apple-system,Segoe UI,Roboto,sans-serif;';
    t.textContent = texto; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 6000);
  }

  async function uidActual() {
    var s = _sb(); if (!s) return null;
    try { var r = await s.auth.getSession(); var ses = r && r.data && r.data.session; return ses ? { id: ses.user.id, email: ses.user.email || '' } : null; }
    catch (_) { return null; }
  }

  async function leer(forzar) {
    var u = await uidActual();
    if (!u) { cache = null; return { uid: null, perfil: null }; }
    if (!forzar && cache && cache.uid === u.id) return cache;
    var s = _sb(), cols = 'id,email,nombres,apellidos,rut,extranjero,universidad', sinSexo = false;
    var r = await s.from('clientes').select(cols + ',sexo').eq('id', u.id).maybeSingle();
    if (r.error && /sexo/i.test(r.error.message || '')) { sinSexo = true; r = await s.from('clientes').select(cols).eq('id', u.id).maybeSingle(); }
    if (r.error) throw r.error;
    cache = { uid: u.id, email: u.email, perfil: r.data || null, sinSexo: sinSexo };
    return cache;
  }

  // ¿Qué falta para esta entrada? → { faltan:[...], noCorresponde:bool }
  function falta(tt, c) {
    var out = { faltan: [], noCorresponde: false };
    if (!tt || !tt.solo_miembros) return out;
    var p = c && c.perfil;
    if (!p) { out.faltan = ['perfil']; return out; }
    if (!((p.nombres || '') + (p.apellidos || '')).trim()) out.faltan.push('nombre');
    // Misma regla que crear-pago: chileno con dígito verificador; extranjero, documento de 5+.
    var rut = p.extranjero ? docExt(p.rut) : rutLimpio(p.rut);
    if (!rut || (p.extranjero ? rut.length < 5 : (rut.length < 7 || !rutOk(p.rut)))) out.faltan.push('rut');
    var g = String(tt.genero || '').trim().toUpperCase();
    var sx = sexoReq(tt);
    if (sx && !c.sinSexo) {
      if (!p.sexo) out.faltan.push('sexo');
      else if (p.sexo !== sx) out.noCorresponde = true;
    }
    if (g === 'U') { var uni = String(p.universidad || '').trim(); if (!uni || uni.toUpperCase() === NO_EST) out.faltan.push('universidad'); }
    return out;
  }

  function textoNoCorresponde(tt, p) {
    var g = sexoReq(tt);
    return '«' + ((tt && tt.nombre) || 'Esta entrada') + '» es solo para ' + (GEN_TXT[g] || 'otro público')
      + ' y en tu cuenta figura «' + (SEXO_TXT[p && p.sexo] || '—') + '». Si está mal registrado, escríbenos y lo corregimos.';
  }

  // Revisa el perfil para una entrada; si falta algo abre la ventana.
  // → { ok:true } | { ok:false, motivo:'SIN_SESION'|'NO_CORRESPONDE'|'CANCELADO', texto? }
  function exigir(tt) {
    if (enCurso) return enCurso;
    enCurso = (async function () {
      try {
        for (var v = 0; v < 3; v++) {
          var c = await leer(v > 0);
          if (!c.uid) return { ok: false, motivo: 'SIN_SESION' };
          var f = falta(tt, c);
          if (f.noCorresponde) return { ok: false, motivo: 'NO_CORRESPONDE', texto: textoNoCorresponde(tt, c.perfil) };
          if (!f.faltan.length) return { ok: true };
          if (!(await ventana(f.faltan, tt))) return { ok: false, motivo: 'CANCELADO' };
        }
        return { ok: false, motivo: 'CANCELADO' };
      } finally { enCurso = null; }
    })();
    return enCurso;
  }

  function persona() {
    var p = cache && cache.perfil; if (!p) return null;
    return { nombre: ((p.nombres || '') + ' ' + (p.apellidos || '')).trim(), rut: p.extranjero ? String(p.rut || '').trim().toUpperCase() : rutFmt(p.rut), email: p.email || (cache.email || ''), extranjero: !!p.extranjero, sexo: p.sexo || null };
  }

  // Código del servidor → abre la ventana (datos) o avisa. Devuelve true si
  // se guardaron datos y conviene que la persona vuelva a apretar el botón.
  async function manejarCodigo(code, msg, faltan, tt) {
    if (CODIGOS_AVISO.indexOf(code) >= 0) { aviso(msg || 'No se pudo reservar.'); return false; }
    if (CODIGOS_DATOS.indexOf(code) < 0) return false;
    if (!(await uidActual())) { aviso(msg || 'Entra a tu cuenta para reservar.'); return false; }
    var lista = Array.isArray(faltan) && faltan.length ? faltan
      : ({ REQUIERE_PERFIL: ['perfil'], REQUIERE_RUT: ['rut'], REQUIERE_SEXO: ['sexo'], REQUIERE_INSTITUCION: ['universidad'] })[code];
    cache = null;
    return await ventana(lista, tt || {});
  }

  // ── La ventana «Nos falta un dato» ──────────────────────────────
  var INP = 'width:100%;box-sizing:border-box;background:#1b1b20;border:1px solid #26262b;border-radius:9px;padding:12px;color:#f4f4f6;font-size:.95rem;margin-bottom:9px;';
  function ventana(faltan, tt) {
    return new Promise(function (resolve) {
      var viejo = document.getElementById('fp-datos'); if (viejo) viejo.remove();
      var set = {}; (faltan || []).forEach(function (k) { set[k] = true; });
      if (set.perfil) { set.nombre = set.rut = true; if (!(cache && cache.sinSexo)) set.sexo = true; }
      var p = (cache && cache.perfil) || {};
      var n = Object.keys(set).filter(function (k) { return k !== 'perfil'; }).length;
      var g = sexoReq(tt);
      var d = document.createElement('div');
      d.id = 'fp-datos';
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;';
      var h = '<div style="background:#131316;border:1px solid #6b5a1e;border-radius:16px;padding:22px;max-width:400px;width:100%;color:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">'
        + '<div style="font-size:.66rem;letter-spacing:2px;text-transform:uppercase;color:#E6C860;">Entrada de miembro</div>'
        + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:1.8rem;line-height:1;margin:6px 0 8px;text-transform:uppercase;">' + (n > 1 ? 'Nos faltan ' + n + ' datos' : 'Nos falta un dato') + '</div>'
        + '<div style="font-size:.82rem;color:#a1a1aa;line-height:1.5;margin-bottom:14px;">La entrada queda a tu nombre y se revisa con tu cédula en la puerta.</div>';
      if (set.nombre) h += '<div style="display:flex;gap:8px;"><input id="fp-nom" placeholder="Nombres" value="' + esc(p.nombres) + '" style="' + INP + '"><input id="fp-ape" placeholder="Apellidos" value="' + esc(p.apellidos) + '" style="' + INP + '"></div>';
      if (set.rut) h += '<input id="fp-doc" inputmode="text" placeholder="RUT · 12.345.678-9" value="' + esc(p.rut ? rutFmt(p.rut) : '') + '" style="' + INP + '">'
        + '<label style="display:flex;align-items:center;gap:8px;font-size:.78rem;color:#8a8a92;margin:-2px 0 12px;cursor:pointer;"><input type="checkbox" id="fp-ext"' + (p.extranjero ? ' checked' : '') + ' style="width:auto;"> Soy extranjer@ (uso pasaporte o DNI)</label>';
      if (set.sexo) h += '<div style="font-size:.74rem;color:#E6C860;margin:4px 0 6px;">Sexo (como en tu cédula)' + (GEN_TXT[g] ? ' · esta entrada es para ' + GEN_TXT[g] : '') + '</div>'
        + '<div id="fp-sexo" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;">'
        + ['F', 'M', 'X'].map(function (k) { return '<button type="button" data-v="' + k + '" style="background:#1b1b20;color:#e4e4e7;border:1px solid #3a3a3c;border-radius:8px;padding:10px 4px;font-size:.8rem;cursor:pointer;">' + SEXO_TXT[k] + '</button>'; }).join('')
        + '</div><label style="display:flex;align-items:flex-start;gap:8px;font-size:.74rem;color:#8a8a92;margin-bottom:12px;cursor:pointer;line-height:1.4;"><input type="checkbox" id="fp-decl" style="width:auto;margin-top:2px;"> Declaro que es el sexo de mi cédula. Se guarda una sola vez; después solo FRATE puede cambiarlo.</label>';
      if (set.universidad) h += '<div style="font-size:.74rem;color:#E6C860;margin:4px 0 6px;">Institución donde estudias</div><select id="fp-uni" style="' + INP + '"></select>';
      h += '<div id="fp-err" style="font-size:.8rem;color:#E8363D;min-height:1em;margin:4px 0 10px;"></div>'
        + '<button id="fp-ok" type="button" style="width:100%;background:#E8363D;color:#fff;border:0;border-radius:10px;padding:14px;font-weight:800;letter-spacing:1px;cursor:pointer;text-transform:uppercase;">Guardar y seguir</button>'
        + '<button id="fp-no" type="button" style="width:100%;background:transparent;color:#8a8a92;border:0;padding:12px;font-size:.8rem;cursor:pointer;margin-top:4px;">Cancelar</button></div>';
      d.innerHTML = h;
      document.body.appendChild(d);

      var sexoElegido = null;
      var err = function (t) { d.querySelector('#fp-err').textContent = t || ''; };
      var cerrar = function (v) { d.remove(); resolve(v); };
      var rutIn = d.querySelector('#fp-doc');
      if (rutIn) rutIn.addEventListener('input', function () { if (!d.querySelector('#fp-ext').checked) rutIn.value = rutFmt(rutIn.value); });
      var cajaSexo = d.querySelector('#fp-sexo');
      if (cajaSexo) cajaSexo.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]'); if (!b) return;
        sexoElegido = b.getAttribute('data-v');
        [].forEach.call(cajaSexo.querySelectorAll('button'), function (x) { var on = x === b; x.style.borderColor = on ? '#E6C860' : '#3a3a3c'; x.style.color = on ? '#E6C860' : '#e4e4e7'; });
        err((GEN_TXT[g] && sexoElegido !== g) ? 'Ojo: esta entrada es solo para ' + GEN_TXT[g] + '. Con esa opción no podrás reservarla.' : '');
      });
      var uniSel = d.querySelector('#fp-uni');
      if (uniSel) {
        try { if (typeof window.poblarInstituciones === 'function') window.poblarInstituciones(uniSel, p.universidad || ''); } catch (_) {}
        if (!uniSel.options.length) (window.FRATE_INSTITUCIONES || []).forEach(function (o) { var op = document.createElement('option'); op.value = op.textContent = o; if (/^──/.test(o)) op.disabled = true; uniSel.appendChild(op); });
        [].slice.call(uniSel.options).forEach(function (o) { if (String(o.value).toUpperCase() === NO_EST) o.remove(); });
        if (!uniSel.options.length) { var op = document.createElement('option'); op.value = ''; op.textContent = 'Escribe tu institución'; uniSel.appendChild(op); }
      }
      d.querySelector('#fp-no').onclick = function () { cerrar(false); };

      d.querySelector('#fp-ok').onclick = async function () {
        var cambios = {};
        if (set.nombre) {
          var nom = d.querySelector('#fp-nom').value.trim(), ape = d.querySelector('#fp-ape').value.trim();
          if (!nom || !ape) return err('Escribe tu nombre y tu apellido.');
          cambios.nombres = nom; cambios.apellidos = ape;
        }
        if (set.rut) {
          var ext = d.querySelector('#fp-ext').checked, rv = rutIn.value.trim();
          if (ext ? docExt(rv).length < 5 : rutLimpio(rv).length < 7) return err(ext ? 'Escribe tu número de documento completo.' : 'Escribe tu RUT completo.');
          if (!ext && !rutOk(rv)) return err('Ese RUT no es válido. Revísalo, o marca que eres extranjer@.');
          cambios.rut = ext ? rv : rutFmt(rv); cambios.extranjero = ext;
        }
        if (set.sexo) {
          if (!sexoElegido) return err('Elige tu sexo.');
          if (!d.querySelector('#fp-decl').checked) return err('Marca la declaración para seguir.');
          cambios.sexo = sexoElegido;
        }
        if (set.universidad) {
          var uv = uniSel.value; if (!uv || /^──/.test(uv)) return err('Elige tu institución.');
          cambios.universidad = uv;
        }
        err('');
        var b = d.querySelector('#fp-ok'); b.disabled = true; b.textContent = 'Guardando…';
        try {
          var u = await uidActual(); if (!u) throw new Error('Tu sesión se cerró. Entra de nuevo.');
          var s = _sb();
          var r = await s.from('clientes').update(cambios).eq('id', u.id).select('id');
          if (r.error) throw r.error;
          if (!r.data || !r.data.length) {                  // cuenta sin ficha (creada en /cuenta)
            var fila = Object.assign({ id: u.id, email: u.email }, cambios);
            var r2 = await s.from('clientes').upsert(fila, { onConflict: 'id' }).select('id');
            if (r2.error) throw r2.error;
            if (!r2.data || !r2.data.length) throw new Error('No pudimos guardar tus datos. Escríbenos por WhatsApp.');
          }
          await leer(true);
          // La sesión guardada en el navegador queda igual a la base, para que
          // Mi cuenta no reenvíe un RUT viejo (chocaría con el RUT fijo).
          try {
            if (typeof Storage !== 'undefined' && Storage && typeof Storage.get === 'function' && cache && cache.perfil) {
              var ss = Storage.get('frate_session');
              if (ss && ss.id === cache.uid) {
                ['nombres', 'apellidos', 'rut', 'extranjero', 'sexo', 'universidad'].forEach(function (k) {
                  if (k in cache.perfil) ss[k] = k === 'extranjero' ? !!cache.perfil[k] : (cache.perfil[k] || (k === 'sexo' ? null : ''));
                });
                Storage.set('frate_session', ss);
              }
            }
          } catch (_) {}
          if (cambios.sexo && cache && cache.perfil && cache.perfil.sexo && cache.perfil.sexo !== cambios.sexo) {
            b.disabled = false; b.textContent = 'Guardar y seguir';
            return err('Tu cuenta ya tenía registrado «' + SEXO_TXT[cache.perfil.sexo] + '». Si está mal, escríbenos.');
          }
          cerrar(true);
        } catch (e) {
          b.disabled = false; b.textContent = 'Guardar y seguir';
          var t = String((e && e.message) || e);
          if (/RUT_FIJO/.test(t)) err('Tu RUT quedó fijo porque ya reservaste una entrada de miembro. Escríbenos para cambiarlo.');
          else if (/rut|check_violation/i.test(t)) err('Ese RUT no es válido. Revísalo, o marca que eres extranjer@.');
          else err(t);
        }
      };
    });
  }

  window.FratePerfil = {
    leer: leer, falta: falta, exigir: exigir, persona: persona, manejarCodigo: manejarCodigo,
    esCodigo: function (c) { return CODIGOS_DATOS.indexOf(c) >= 0 || CODIGOS_AVISO.indexOf(c) >= 0; },
    cacheado: function () { return cache && cache.perfil; },
    limpiar: function () { cache = null; },
    rutFmt: rutFmt,
    sexoReq: sexoReq
  };
})();
