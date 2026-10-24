/* ============================================================
   FRATE — frate-email.js: verificación de correo reutilizable.
   • suggest(email)  → sugerencia de typo OFFLINE (gmial→gmail, .con→.com)
   • checkMX(email)  → edge email-check (formato + dominio real MX)
   • attach(input,{confirm}) → engancha input de correo: sugerencia en vivo,
                       aviso "no coinciden" con el confirmar, y MX al salir (blur).
   • validate(input,confirm) → para el submit (formato + coinciden + MX conocido).
   No bloquea si la red falla (best-effort). window.FrateEmail
   ============================================================ */
(function () {
  var SB_URL = 'https://ydwlpraoaaijlfssevoh.supabase.co';
  var SB_KEY = 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt';
  // Solo se corrigen errores de tipeo CONOCIDOS de proveedores masivos.
  // Nada de adivinanza difusa: un dominio universitario (udp.cl, ucn.cl, usm.cl…)
  // o corporativo jamás debe "corregirse" a otro. Falso positivo = correo destruido.
  var TYPOS = {
    'gmial.com':'gmail.com','gmai.com':'gmail.com','gamil.com':'gmail.com','gmaill.com':'gmail.com',
    'gmail.co':'gmail.com','gmali.com':'gmail.com','gmail.cl':'gmail.com','gmil.com':'gmail.com',
    'hotmial.com':'hotmail.com','hotmai.com':'hotmail.com','hotnail.com':'hotmail.com',
    'hotmail.co':'hotmail.com','hotmaill.com':'hotmail.com','hormail.com':'hotmail.com',
    'outlok.com':'outlook.com','outloo.com':'outlook.com','outlook.co':'outlook.com','oulook.com':'outlook.com',
    'yaho.com':'yahoo.com','yahooo.com':'yahoo.com','yahoo.co':'yahoo.com',
    'iclould.com':'icloud.com','iclod.com':'icloud.com','icloud.co':'icloud.com','icoud.com':'icloud.com',
    'duocuc.com':'duocuc.cl','usach.com':'usach.cl'
  };
  // Familias de proveedores masivos: solo para estos se corrige un TLD mal escrito.
  var SLD_OK = ['gmail','hotmail','outlook','yahoo','icloud','live'];
  var TLD_MAL = { 'con':'com','cmo':'com','vom':'com','xom':'com','om':'com','comm':'com','coom':'com','cm':'com','ocm':'com' };

  function suggest(email) {
    email = String(email || '').trim().toLowerCase();
    var at = email.indexOf('@'); if (at < 1) return null;
    var dom = email.slice(at + 1); if (!dom) return null;
    // 1) error de tipeo conocido, exacto
    if (TYPOS[dom]) return email.slice(0, at + 1) + TYPOS[dom];
    // 2) proveedor masivo con el TLD mal escrito (gmail.con → gmail.com)
    var i = dom.lastIndexOf('.'); if (i < 1) return null;
    var sld = dom.slice(0, i), tld = dom.slice(i + 1);
    if (SLD_OK.indexOf(sld) >= 0 && TLD_MAL[tld]) return email.slice(0, at + 1) + sld + '.' + TLD_MAL[tld];
    return null;
  }
  function fmtOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }

  function checkMX(email) {
    return fetch(SB_URL + '/functions/v1/email-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY }, body: JSON.stringify({ email: email })
    }).then(function (r) { return r.json(); }).catch(function () { return { ok: true, formato: true, mx: true, sugerencia: null }; });
  }

  function attach(input, opts) {
    if (!input || input._feAttached) return; opts = opts || {};
    var confirm = opts.confirm || null;
    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:.72rem;margin-top:4px;line-height:1.4;display:none;';
    if (input.parentNode) input.parentNode.insertBefore(hint, input.nextSibling);
    function show(html, color) { if (!html) { hint.style.display = 'none'; hint.innerHTML = ''; return; } hint.innerHTML = html; hint.style.color = color || '#E6C860'; hint.style.display = 'block'; }
    // Corrige SOLO el campo del correo. NUNCA el de confirmación: si se pisaran
    // los dos, se anula la red de seguridad de "escríbelo dos veces".
    function apply(s) { input.value = s; show('✓ Corregido — confirma tu correo abajo', '#4ade80'); input._feMx = null; try { input.dispatchEvent(new Event('change')); } catch (e) {} }
    function onInput() {
      var v = input.value.trim(), s = suggest(v);
      input._feMx = null;
      if (s) show('¿Quisiste decir <b style="cursor:pointer;text-decoration:underline;" data-fe="1">' + s.replace(/</g, '&lt;') + '</b>?', '#E6C860');
      else if (confirm && confirm.value && confirm.value.trim().toLowerCase() !== v.toLowerCase()) show('⚠️ Los correos no coinciden.', '#ff8a8a');
      else show('');
    }
    hint.addEventListener('click', function (e) { var t = e.target.closest ? e.target.closest('[data-fe]') : null; if (t) { var s = suggest(input.value.trim()); if (s) apply(s); } });
    input.addEventListener('input', onInput);
    if (confirm) confirm.addEventListener('input', onInput);
    input.addEventListener('blur', function () {
      var v = input.value.trim(); if (!fmtOk(v)) return;
      checkMX(v).then(function (res) {
        input._feMx = res;
        if (res && res.mx === false) show('❌ Ese dominio de correo no existe. Revísalo.', '#ff8a8a');
        else if (res && res.sugerencia) show('¿Quisiste decir <b style="cursor:pointer;text-decoration:underline;" data-fe="1">' + String(v.split('@')[0] + '@' + res.sugerencia).replace(/</g, '&lt;') + '</b>?', '#E6C860');
        else if (confirm && confirm.value && confirm.value.trim().toLowerCase() !== v.toLowerCase()) show('⚠️ Los correos no coinciden.', '#ff8a8a');
        else show('');
      });
    });
    input._feAttached = true;
  }

  function val(x) { return (typeof x === 'string' ? x : (x && x.value) || '').trim(); }
  function validate(input, confirm) {
    var v = val(input);
    if (!fmtOk(v)) return { ok: false, msg: 'Escribe un correo válido.' };
    if (confirm) { var c = val(confirm); if (c && c.toLowerCase() !== v.toLowerCase()) return { ok: false, msg: 'Los correos no coinciden. Revísalos.' }; }
    var mx = input && input._feMx; if (mx && mx.mx === false) return { ok: false, msg: 'Ese dominio de correo no existe. Corrige el correo.' };
    return { ok: true };
  }

  window.FrateEmail = { suggest: suggest, checkMX: checkMX, attach: attach, validate: validate, fmtOk: fmtOk };
})();
