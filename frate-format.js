/* ============================================================
   FRATE · frate-format.js
   Formateo EN VIVO de los campos que rellena el usuario final
   (y los modales del admin). Se auto-conecta por delegación:
   funciona con campos creados dinámicamente, sin llamar a nada.

   Detecta el tipo de campo por, en orden:
     1. data-fmt="rut|tel|email|ig|miles|nombre"   (explícito, gana)
     2. data-rut / type=email / type=tel
     3. palabras en id/name/data-k (rut, correo, whatsapp, instagram, presupuesto…)

   RUT → 24.070.804-3 + valida dígito verificador al salir (✓ / rojo).
   Excepción: si hay un check de "extranjer@" marcado, el RUT no se toca.
   Marca `data-no-fmt` en un input (o su contenedor) para excluirlo.
   ============================================================ */
(function () {
  'use strict';
  if (window.FrateFmt) return;

  var F = {};

  // ---------- RUT ----------
  F.rutClean = function (v) { return String(v == null ? '' : v).toUpperCase().replace(/[^0-9K]/g, ''); };
  F.rutFmt = function (v) {
    var c = F.rutClean(v);
    if (c.length < 2) return c;
    var body = c.slice(0, -1).replace(/^0+/, ''), dv = c.slice(-1);
    if (!/^\d+$/.test(body)) return c;
    body = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return body + '-' + dv;
  };
  F.rutValido = function (v) {
    var c = F.rutClean(v);
    if (!/^\d{7,8}[0-9K]$/.test(c)) return false;
    var body = c.slice(0, -1), dv = c.slice(-1), sum = 0, mul = 2;
    for (var i = body.length - 1; i >= 0; i--) { sum += parseInt(body[i], 10) * mul; mul = mul === 7 ? 2 : mul + 1; }
    var r = 11 - (sum % 11);
    var calc = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    return calc === dv;
  };

  // ---------- Teléfono ----------
  // Chile: +56 9 1234 5678. Con selector de país (data-cc) formatea el número local.
  F.telLocal = function (v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 9);
    if (d.length <= 1) return d;
    if (d.length <= 5) return d[0] + ' ' + d.slice(1);
    return d[0] + ' ' + d.slice(1, 5) + ' ' + d.slice(5);
  };
  F.telFull = function (v) {
    var s = String(v == null ? '' : v);
    var d = s.replace(/\D/g, '');
    if (d.indexOf('569') === 0) d = d.slice(2);        // +56 9…
    else if (d.indexOf('56') === 0 && d.length >= 10 && d[2] === '9') d = d.slice(2);
    if (d.length === 9 && d[0] === '9') return '+56 ' + F.telLocal(d);
    if (d.length && d[0] === '9') return '+56 ' + F.telLocal(d);   // parcial chileno
    return s;                                          // desconocido: no lo mangleamos
  };

  // ---------- Otros ----------
  F.email = function (v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ''); };
  F.igHandle = function (v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '').replace(/[^a-z0-9._]/g, ''); };
  F.ig = function (v) { var h = F.igHandle(v); return h ? '@' + h : ''; };
  F.igUrl = function (v) { var h = F.igHandle(v); return h ? 'https://instagram.com/' + h : ''; };
  F.igLink = function (v, extra) { var h = F.igHandle(v); if (!h) return ''; return '<a href="https://instagram.com/' + h + '" target="_blank" rel="noopener"' + (extra || '') + '>@' + h + '</a>'; };
  F.miles = function (v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    return d ? '$' + d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  };
  F.nombre = function (v) { return String(v == null ? '' : v).toUpperCase().replace(/\s{2,}/g, ' '); };

  window.FrateFmt = F;

  // ---------- estilos mínimos (independientes del CSS de la página) ----------
  try {
    var st = document.createElement('style');
    st.textContent =
      '.frate-bad{border-color:#E8363D !important;box-shadow:0 0 0 1px rgba(232,54,61,.35) !important;}' +
      '.frate-hint{color:#ff8b8f;font-size:.76rem;margin-top:5px;line-height:1.3;}' +
      '.frate-hint.ok{color:#22c55e;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  // ---------- detección de tipo ----------
  function fmtOf(el) {
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return null;
    var ty = (el.type || '').toLowerCase();
    if (ty === 'checkbox' || ty === 'radio' || ty === 'date' || ty === 'time' || ty === 'datetime-local' || ty === 'password' || ty === 'range' || ty === 'color' || ty === 'file') return null;
    if (el.hasAttribute('data-no-fmt') || (el.closest && el.closest('[data-no-fmt]'))) return null;
    if (el.readOnly || el.disabled) return null;

    var explicit = el.getAttribute('data-fmt');
    if (explicit) return explicit;
    // number solo si pide 'miles' explícito (arriba); de lo contrario no lo tocamos
    if (ty === 'number') return null;
    if (el.hasAttribute('data-rut')) return 'rut';
    if (el.hasAttribute('data-up')) return 'nombre';

    var t = (el.getAttribute('type') || 'text').toLowerCase();
    var hay = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('data-k') || '')).toLowerCase();

    // email: solo type=email o palabras claras de dirección (NO el 'mail' de mail_intro/mail_subject del admin)
    if (t === 'email' || /correo|e-?mail/.test(hay)) return 'email';
    if (/(^|[^a-z])rut([^a-z]|$)|_rut|-rut/.test(hay)) return 'rut';
    if (t === 'tel' || /whatsapp|telefono|tel(?![a-z])|fono|celular|movil|m[oó]vil/.test(hay)) return 'tel';
    if (/instagram|(^|[^a-z])ig(?![a-z])/.test(hay)) return 'ig';
    // miles: solo por id/keyword seguro (los precios del admin son type=number → ya excluidos). 'monto' suele ser numérico allí, así que solo 'presupuesto'.
    if (/presupuesto/.test(hay)) return 'miles';
    return null;
  }

  function esExtranjero(el) {
    var scope = (el.closest && (el.closest('form') || el.closest('#campos') || el.closest('.modal') || el.closest('.mb') || el.closest('.card'))) || document;
    var ex = scope.querySelector('#f-ext, #b-ext, [data-k="extranjero"], [data-k="ext"], [data-ext]');
    return !!(ex && ex.checked);
  }

  // reformatea preservando el cursor por conteo de caracteres útiles
  function reformat(el, fn, keepClass) {
    var start = el.selectionStart;
    var useCaret = start != null && document.activeElement === el;
    var before = useCaret ? el.value.slice(0, start).replace(/[^0-9a-zA-Z]/g, '').length : 0;
    var out = fn(el.value);
    if (out === el.value) return;
    el.value = out;
    if (useCaret) {
      var pos = 0, seen = 0;
      while (pos < out.length && seen < before) { if (/[0-9a-zA-Z]/.test(out[pos])) seen++; pos++; }
      try { el.setSelectionRange(pos, pos); } catch (e) {}
    }
  }

  function hintEl(el, create) {
    var sib = el.nextElementSibling;
    if (sib && sib.classList && sib.classList.contains('frate-hint')) return sib;
    if (!create) return null;
    var h = document.createElement('div');
    h.className = 'frate-hint';
    if (el.parentNode) el.parentNode.insertBefore(h, el.nextSibling);
    return h;
  }

  function validarRut(el) {
    if (esExtranjero(el)) { el.classList.remove('frate-bad'); var h0 = hintEl(el); if (h0) h0.remove(); return; }
    var val = el.value.trim();
    var h = hintEl(el);
    if (!val) { el.classList.remove('frate-bad'); if (h) h.remove(); return; }
    if (F.rutValido(val)) {
      el.classList.remove('frate-bad');
      if (h) h.remove();
    } else {
      el.classList.add('frate-bad');
      var hh = hintEl(el, true);
      hh.className = 'frate-hint';
      hh.textContent = '⚠️ Revisa el RUT — no calza el dígito verificador.';
    }
  }

  // ---------- delegación ----------
  function limpiarRut(el) { el.classList.remove('frate-bad'); var h = hintEl(el); if (h) h.remove(); }

  document.addEventListener('input', function (e) {
    var el = e.target, k = fmtOf(el);
    if (!k) return;
    if (k === 'rut') { if (esExtranjero(el)) { limpiarRut(el); return; } reformat(el, F.rutFmt); limpiarRut(el); }
    else if (k === 'tel') {
      var cc = el.closest && el.closest('div') && el.closest('div').querySelector('[data-cc]');
      if (cc) { if (cc.value === '+56' || !cc.value) reformat(el, F.telLocal); }
      else reformat(el, F.telFull);
    }
    else if (k === 'email') reformat(el, F.email);
    else if (k === 'ig') reformat(el, F.ig);
    else if (k === 'miles') reformat(el, F.miles);
    else if (k === 'nombre') reformat(el, F.nombre);
  }, true);

  document.addEventListener('focusout', function (e) {
    var el = e.target, k = fmtOf(el);
    if (!k) return;
    if (k === 'rut') { if (!esExtranjero(el)) { reformat(el, F.rutFmt); validarRut(el); } else limpiarRut(el); }
    else if (k === 'tel') { var cc = el.closest && el.closest('div') && el.closest('div').querySelector('[data-cc]'); if (cc) { if (cc.value === '+56' || !cc.value) reformat(el, F.telLocal); } else reformat(el, F.telFull); }
    else if (k === 'email') reformat(el, F.email);
    else if (k === 'ig') reformat(el, F.ig);
    else if (k === 'miles') reformat(el, F.miles);
    else if (k === 'nombre') reformat(el, F.nombre);
  }, true);

  // al marcar/desmarcar "extranjer@", re-evaluar el RUT del mismo formulario
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.type !== 'checkbox') return;
    var k = (el.getAttribute && el.getAttribute('data-k')) || '';
    if (el.id !== 'f-ext' && el.id !== 'b-ext' && k !== 'extranjero' && k !== 'ext' && !el.hasAttribute('data-ext')) return;
    var scope = (el.closest && (el.closest('form') || el.closest('#campos') || el.closest('.modal') || el.closest('.mb') || el.closest('.card'))) || document;
    var ruts = scope.querySelectorAll('[data-rut],[data-fmt="rut"],#f-rut,#b-rut');
    for (var i = 0; i < ruts.length; i++) {
      if (el.checked) limpiarRut(ruts[i]);
      else validarRut(ruts[i]);
    }
  }, true);
})();
