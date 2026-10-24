/* ══════════════════════════════════════════════════════════════════
   FRATE · LECTOR DE CÉDULA — uno solo para toda la app
   ------------------------------------------------------------------
   Antes esto vivía copiado: la puerta (validacion.html) tenía la
   versión completa y lista.html una copia a medias que solo sacaba el
   RUT. Cada mejora en la puerta dejaba a la otra atrás.

   El QR del reverso del carnet chileno NO es un número: es una
   dirección del Registro Civil con los datos como parámetros.
       …/docstatus?RUN=12345678-9&type=CEDULA&serial=…&name=…&mrz=…
   De ahí salen tres cosas:
     · RUN=   el RUT (se valida con dígito verificador)
     · name=  el nombre, en LATIN-1 (%C9 es É — con UTF-8 sale basura)
     · mrz=   la banda mecánica; posiciones 30-36 = fecha de nacimiento

   Se usa así:
       <script src="/frate-cedula.js"></script>
       const p = FrateCedula.leer(textoDelQR);
       // → { rut, nombre, nacimiento, edad, esCedula, crudo }

   ⚠️ Si el carnet no trae la fecha, `nacimiento` viene null. NUNCA se
      inventa la edad: quien atiende la confirma a ojo.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function rutLimpio(r) {
    return String(r || '').replace(/[.\s]/g, '').replace(/-/g, '').toUpperCase();
  }

  function rutValido(r) {
    const c = rutLimpio(r);
    if (!/^\d{7,8}[0-9K]$/.test(c)) return false;
    const cuerpo = c.slice(0, -1), dv = c.slice(-1);
    let suma = 0, mul = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) { suma += parseInt(cuerpo[i], 10) * mul; mul = mul === 7 ? 2 : mul + 1; }
    const res = 11 - (suma % 11);
    const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return dvCalc === dv;
  }

  function rutFormato(r) {
    const c = rutLimpio(r);
    if (!/^\d{7,8}[0-9K]$/.test(c)) return String(r || '');
    return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
  }

  // ¿Es un carnet y no un ticket nuestro?
  function esCedula(s) {
    s = String(s || '');
    if (/FCC-/i.test(s)) return false;              // eso es un ticket, no un carnet
    if (/RUN\s*=/i.test(s)) return true;
    const c = s.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[0-9kK]/gi) || [];
    return c.some(x => rutValido(x));
  }

  function extraerRut(s) {
    s = String(s || '');
    const m = s.match(/RUN\s*=\s*([0-9.\-]+[0-9kK])/i);
    if (m && rutValido(m[1])) return rutLimpio(m[1]);
    const c = s.match(/\d{1,2}\.?\d{3}\.?\d{3}-?[0-9kK]/gi) || [];
    const v = c.find(x => rutValido(x));
    return v ? rutLimpio(v) : null;
  }

  function extraerNombre(s) {
    s = String(s || '');
    const m = s.match(/[?&]name=([^&]+)/i);
    if (!m) return null;
    let v = m[1].replace(/\+/g, ' ');
    // Latin-1 a mano: decodeURIComponent revienta con %C9 porque no es UTF-8.
    v = v.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    v = v.replace(/\s+/g, ' ').trim();
    return v || null;
  }

  function fecha6(yymmdd) {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    const yy = +yymmdd.slice(0, 2), mm = +yymmdd.slice(2, 4), dd = +yymmdd.slice(4, 6);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const hoy = new Date();
    let anio = 2000 + yy;
    // Solo se va al siglo pasado si el año 20xx todavía no llega. NO se
    // descarta a los muy jóvenes: un carnet de alguien de 6 años es un dato
    // válido, y es justo el que tiene que salir como menor de edad.
    if (anio > hoy.getFullYear()) anio = 1900 + yy;
    if (hoy.getFullYear() - anio > 100) return null;
    return anio + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }

  function extraerNacimiento(s) {
    s = String(s || '');
    const m = s.match(/[?&]mrz=([A-Z0-9<]+)/i);
    if (m) {
      const mrz = m[1].toUpperCase();
      if (mrz.length >= 36) { const d = fecha6(mrz.slice(30, 36)); if (d) return d; }
    }
    const iso = s.match(/(?:nac|birth|fnac)[^0-9]{0,4}(\d{4})-(\d{2})-(\d{2})/i);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    return null;
  }

  function edadDe(fechaISO) {
    if (!fechaISO) return null;
    const p = String(fechaISO).split('-').map(Number);
    if (p.length !== 3) return null;
    const hoy = new Date();
    let e = hoy.getFullYear() - p[0];
    const cumplioYa = (hoy.getMonth() + 1 > p[1]) || (hoy.getMonth() + 1 === p[1] && hoy.getDate() >= p[2]);
    if (!cumplioYa) e--;
    return (e >= 0 && e < 120) ? e : null;
  }

  // Parte el nombre completo en nombres y apellidos. El carnet chileno
  // trae «NOMBRES  APELLIDOS» con doble espacio entre medio; si viene con
  // uno solo se asume que los dos últimos son apellidos.
  function partirNombre(completo) {
    const v = String(completo || '').replace(/\s+/g, ' ').trim();
    if (!v) return { nombres: '', apellidos: '' };
    const dobles = String(completo || '').split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
    if (dobles.length === 2) return { nombres: dobles[0], apellidos: dobles[1] };
    const w = v.split(' ');
    if (w.length <= 2) return { nombres: w[0] || '', apellidos: w.slice(1).join(' ') };
    return { nombres: w.slice(0, w.length - 2).join(' '), apellidos: w.slice(-2).join(' ') };
  }

  // Lo único que la mayoría necesita llamar.
  function leer(texto) {
    const crudo = String(texto || '');
    const rut = extraerRut(crudo);
    const nombre = extraerNombre(crudo);
    const nacimiento = extraerNacimiento(crudo);
    const p = partirNombre(nombre);
    return {
      esCedula: esCedula(crudo),
      rut, rutBonito: rut ? rutFormato(rut) : null,
      nombre, nombres: p.nombres, apellidos: p.apellidos,
      nacimiento, edad: edadDe(nacimiento),
      crudo
    };
  }

  global.FrateCedula = {
    leer, esCedula, extraerRut, extraerNombre, extraerNacimiento,
    partirNombre, edadDe, rutValido, rutLimpio, rutFormato
  };
})(window);
