/* ============================================================
 * FRATE · LEER GENTE PEGADA — un solo lugar
 *
 * Había TRES parsers distintos haciendo esto con reglas distintas:
 * `_parseListaPegada` en admin.html, `parseLineas` en pase.html, y el de la
 * importación masiva. Se desincronizaron: arreglamos uno y los otros siguieron
 * partiendo a una persona en dos filas.
 *
 * REGLA: una persona nueva empieza cuando aparece un SEGUNDO nombre, cuando la
 * ficha ya está completa (nombre + rut + correo), o cuando se repite un dato
 * que ya estaba. El RUT NO cierra: puede venir al medio, y lo que va después
 * —el correo— se estaba perdiendo.
 * ============================================================ */
(function (raiz) {
  'use strict';

  function esRut(t) {
    var d = String(t || '').replace(/[^0-9kK]/g, '');
    return d.length >= 8 && d.length <= 9 && /^[0-9]+[0-9kK]$/i.test(d);
  }
  function esMail(t) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t || '').trim()); }
  function esTel(t) {
    var d = String(t || '').replace(/[^0-9]/g, '');
    return (d.length === 9 && d[0] === '9') || (d.length === 11 && d.slice(0, 3) === '569');
  }
  // Un nombre: tiene letras, no es RUT ni correo ni teléfono, y no es una
  // frase larga (más de 6 palabras casi siempre es una nota, no un nombre).
  function esNombre(t) {
    var x = String(t || '').trim();
    return x.length >= 3 && !esRut(x) && !esMail(x) && !esTel(x)
        && !/^https?:\/\//.test(x) && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x)
        && x.split(/\s+/).length <= 6;
  }

  // Formatea 161275603 → 16.127.560-3. Si no calza, devuelve lo que vino.
  function fmtRut(t) {
    var d = String(t || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (d.length < 8 || d.length > 9) return String(t || '').trim();
    var dv = d.slice(-1), n = d.slice(0, -1);
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  }
  function limpiaNombre(t) {
    return String(t || '').replace(/^\d+[.)]\s*/, '')     // «1) Camila»
                          .replace(/[,\-–|]+/g, ' ')
                          .replace(/\s+/g, ' ').trim();
  }

  function vacia() { return { nombre: '', rut: '', email: '', telefono: '' }; }

  function leer(txt) {
    var lineas = String(txt || '').replace(/\r/g, '').split('\n')
                   .map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lineas.length) return [];

    // Excel / CSV: si la MAYORÍA de las líneas trae separador, es una fila por
    // persona con columnas. Se detecta por mayoría, no por la primera línea.
    var conSep = lineas.filter(function (l) { return /\t|[,;]/.test(l); }).length;
    if (conSep >= lineas.length * 0.6) {
      return lineas.map(function (l) {
        var p = vacia();
        l.split(/\t|[,;]/).map(function (x) { return x.trim(); }).filter(Boolean)
         .forEach(function (t) {
           if (esRut(t) && !p.rut) p.rut = fmtRut(t);
           else if (esMail(t) && !p.email) p.email = t.toLowerCase();
           else if (esTel(t) && !p.telefono) p.telefono = t;
           else if (!p.nombre) p.nombre = limpiaNombre(t);
         });
        return p;
      }).filter(function (p) { return p.nombre; });
    }

    // WhatsApp / pegado suelto: se agrupa por patrón, con o sin líneas en blanco.
    var out = [], b = vacia();
    var completa = function (x) { return x.nombre && x.rut && x.email; };
    var cerrar = function () { if (b.nombre || b.rut) out.push(b); b = vacia(); };

    lineas.forEach(function (l) {
      if (/^https?:\/\//.test(l)) return;
      if ((esNombre(l) && b.nombre) || completa(b)) cerrar();
      if (esRut(l))        { if (b.rut) cerrar();      b.rut = fmtRut(l); }
      else if (esMail(l))  { if (b.email) cerrar();    b.email = l.toLowerCase(); }
      else if (esTel(l))   { if (b.telefono) cerrar(); b.telefono = l; }
      else if (esNombre(l)) b.nombre = limpiaNombre(l);
      // Lo que no calza en nada (una nota, un emoji suelto) se ignora.
    });
    cerrar();
    return out;
  }

  // Para la vista previa: qué se entendió y qué falta.
  function revisar(personas) {
    var p = personas || [];
    return {
      total: p.length,
      sinRut:   p.filter(function (x) { return !x.rut; }).length,
      sinMail:  p.filter(function (x) { return !x.email; }).length,
      sinNada:  p.filter(function (x) { return !x.rut && !x.email; }).length,
      repetidos: (function () {
        var vistos = {}, n = 0;
        p.forEach(function (x) {
          var k = (x.rut || x.email || x.nombre || '').toLowerCase();
          if (!k) return;
          if (vistos[k]) n++; else vistos[k] = 1;
        });
        return n;
      })(),
    };
  }

  raiz.FratePegar = { leer: leer, revisar: revisar, esRut: esRut, esMail: esMail, fmtRut: fmtRut };
})(typeof window !== 'undefined' ? window : globalThis);
