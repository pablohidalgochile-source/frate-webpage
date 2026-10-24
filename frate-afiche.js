/* ══════════════════════════════════════════════════════════════════════
   FRATE · PORTADA DE EVENTO — decoración generada
   ══════════════════════════════════════════════════════════════════════
   Tres piezas que se combinan:

     textura(txt)  el nombre repetido MUY chico y MUY poblado, de fondo.
                   Es decoración: va al 20% y nunca compite con el título.
     titulo(txt)   el nombre plano y gigante, en SVG con textLength, así
                   «ME ESCAPÉ» y «QUE TE VAYA SUPER BIEN» ocupan EXACTAMENTE
                   el mismo ancho. Sin eso, el corto queda enano y el largo
                   se achica para caber: dos portadas que no se parecen.
     mosaico(emo)  el equivalente para los enlaces, con emoji en vez de letras.

   El primer intento hacía que el título FUERA el caligrama (letras rellenas
   de la palabra). No se leía: una letra hecha de palabras nunca compite con
   una letra sólida. Por eso ahora el caligrama es fondo y el título va plano.

   Lo usan comprar.html, index.html y links.html — uno solo para que las tres
   pantallas del mismo evento no se vean distintas entre ellas.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var DOW = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  var MES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
             'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  // Paleta fluor «con cuerpo»: viva pero sin vibrar en OLED, y con el texto
  // negro encima legible (5.5 a 16.6 de contraste). La anterior estaba a media
  // saturación —el rojo daba 4.7— y por eso se veía deslavada.
  // El rojo va a #FF1744 y no a #FF2D55: el segundo tira a rosado.
  var COLORES = ['#FF1744', '#FFE600', '#18D9FF', '#9D4BFF', '#00E676', '#FF4FC3'];

  // El modo de color lo manda Configuración General (config_valores.deco_color_modo):
  //   'auto'    → lo elige el nombre. Nunca hay dos iguales seguidos.
  //   'publico' → por para-quién-es: mujeres, hombres, universitarios, mixto.
  //   'manual'  → solo el que se guardó; sin color guardado, cae a 'auto'.
  var MODO = 'auto';
  var POR_PUBLICO = { F: '#FF4FC3', M: '#18D9FF', U: '#FFE600', '': '#FF1744' };
  function setModo(m, paleta) {
    if (m) MODO = m;
    if (paleta && paleta.length) COLORES = paleta.slice();
  }

  function hash(txt) {
    var h = 2166136261, s = String(txt || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Color por defecto: lo elige el nombre, para que un evento sin color
  // configurado igual se vea distinto a los otros de la semana.
  function colorDe(txt, cfg) {
    cfg = cfg || {};
    if (cfg.color) return cfg.color;                       // lo guardado manda siempre
    if (MODO === 'manual') return COLORES[0];
    if (MODO === 'publico' && cfg.publico != null) {
      return POR_PUBLICO[cfg.publico] || POR_PUBLICO[''];
    }
    return COLORES[hash(txt) % COLORES.length];
  }

  // 🏷️ La etiqueta que ve el CLIENTE. El nombre real del tipo NO se toca nunca:
  //    lo usan la puerta (arma sus mapas por nombre), el ERP (lo recibe congelado
  //    en cada venta) y el importador de briefs (empareja por nombre). Acá sólo se
  //    reordena para pintarlo, porque «PREV 3 MUJER» la gente lo lee como «3
  //    entradas de mujer» — el número parece cantidad.
  //      PREV 3 MUJER + COVER HALLOWEEN → MUJER + COVER HALLOWEEN · PREVENTA 3
  //    Si el nombre no empieza con PREV/PREVENTA + número, vuelve igual que entró.
  function etiquetaPublica(nombre) {
    var n = String(nombre == null ? '' : nombre);
    var m = n.match(/^\s*PREV(?:ENTA)?\s*(\d+)\s+(.+)$/i);
    return m ? (m[2].trim() + ' · PREVENTA ' + m[1]) : n;
  }

  // La FAMILIA de un tipo: su nombre sin el prefijo «PREV N». «PREV 1 MUJER…» y
  // «PREV 3 MUJER…» son el MISMO producto en dos momentos, así que son una familia.
  // Un tipo sin prefijo es una familia de uno, y por eso la regla de abajo le
  // sirve igual sin un caso aparte: se agota y, como no hay hermanos, ya no
  // queda nada que vender.
  function familiaDe(nombre) {
    var n = String(nombre == null ? '' : nombre);
    var m = n.match(/^\s*PREV(?:ENTA)?\s*\d+\s+(.+)$/i);
    return (m ? m[1] : n).trim().toUpperCase();
  }

  /**
   * ¿A este ticket hay que mandarlo a la puerta?
   *
   * Sí cuando NO queda NADA que comprar online de su familia — ni ahora ni más
   * adelante. La regla la dictó el dueño y tiene una razón comercial clara:
   *   · Si otro tramo todavía vende, NO se manda a la puerta. Que compre online,
   *     que es más barato para él y cobrado por adelantado para nosotros. Por eso
   *     una PREVENTA 1 agotada con la 3 abierta dice sólo «Agotado».
   *   · Si un tramo abre MÁS ADELANTE, tampoco: todavía va a poder comprar.
   *   · Si el evento está EN VIVO, cualquier bloqueo manda a la puerta, porque el
   *     local está abierto ahora y es la única vía que queda.
   *
   * Mira `venta_hasta` y no `venta_desde`: un tramo que todavía no abrió igual
   * cuenta como camino online futuro. Y sólo cuenta los `Activo`: los tipos de
   * puerta viven como `Oculto` y contarlos diría «hay stock» para siempre.
   */
  function enPuertaPara(ticket, todos, o) {
    o = o || {};
    if (o.enVivo) return true;
    var fam = familiaDe((ticket || {}).nombre);
    var ahora = o.ahora || Date.now();
    var lista = todos || [];
    for (var i = 0; i < lista.length; i++) {
      var x = lista[i] || {};
      if (familiaDe(x.nombre) !== fam) continue;
      // Se excluye por lo que NO vende, no por una lista blanca: hay varios
      // estados vendibles ('Solo venta WEB', 'Venta solo RRPP'…) y con una
      // lista blanca un hermano con stock quedaba fuera y se mandaba gente a
      // la puerta teniendo dónde comprar.
      var est = String(x.estado || 'Activo');
      if (est === 'Oculto' || est === 'Cerrado') continue;
      if (!((x.disponible == null ? 1 : x.disponible) > 0)) continue;
      // Las dos pantallas traen el campo con distinta ortografía: comprar.html
      // usa la fila cruda (`venta_hasta`) y el popup la versión mapeada
      // (`ventaHasta`). Se leen las dos, igual que hace normTicket().
      var crudo = x.venta_hasta != null ? x.venta_hasta : x.ventaHasta;
      var hasta = crudo ? +new Date(crudo) : null;
      if (hasta && !isNaN(hasta) && ahora > hasta) continue;
      return false;   // un hermano con stock que todavía vende o va a abrir
    }
    return true;
  }

  // El rótulo del escalón (REBAJADA / GENERAL / PRO). Si el tipo no lo trae
  // guardado, se deduce del nombre — pero el guardado siempre gana.
  function rotuloDe(tk) {
    var g = String((tk && tk.rotulo) || '').trim();
    if (g) return g;
    var n = String((tk && (tk.nombre || tk.titulo)) || '').toUpperCase();
    if (/REBAJAD|PROMO|EARLY/.test(n)) return 'REBAJADA';
    if (/\bPRO\b|PREMIUM|VIP/.test(n)) return 'PRO';
    if (/GRAL|GENERAL/.test(n))         return 'GENERAL';
    if (/CORTES|LISTA|INVITAD/.test(n)) return 'CORTESÍA';
    if (/PUERTA|INGRESO/.test(n))       return 'PUERTA';
    return '';
  }

  // ── Fondo · el vocabulario de la marca ────────────────────────────
  // `textura()` repite UN nombre. Esta reparte las palabras con F de FRATE,
  // que es lo que se ve en el afiche impreso. La semilla es el nombre del
  // evento: mismo evento → misma portada siempre; otro evento → otro orden
  // y otros colores. Nadie sube una imagen.
  var PALABRAS_F = ['FAMILIA', 'FIESTA', 'FORTALEZA', 'F\u00d3RMULA', 'FRANQUEZA', 'FIEREZA',
    'FANT\u00c1STICA', 'FELICIDAD', 'FRESCURA', 'FLECHAZO', 'FLUIR', 'FLORECER', 'FUSI\u00d3N',
    'FUEGO', 'FUERZA', 'FE', 'FOCO', 'FIRMEZA', 'FAVOR', 'FESTEJO', 'FUTURO', 'FULGOR',
    'FIEL', 'FORTUNA', 'FRATERNIDAD', 'FANTAS\u00cdA', 'FLUIDEZ', 'FASCINACI\u00d3N', 'FRECUENCIA'];

  function texturaF(semilla, o) {
    o = o || {};
    var W = o.w || 620, H = o.h || 190, op = o.op == null ? 0.20 : o.op;
    var s = String(semilla || 'FRATE');
    var filas = '', y = 14, k = 0;
    while (y < H + 16) {
      var tam = (k % 2 === 1) ? 11 : 17;          // alterna chica y grande
      var x = -(hash(s + 'x' + k) % 90);          // cada fila entra corrida
      while (x < W + 40) {
        var p = PALABRAS_F[hash(s + 'w' + k + '_' + x) % PALABRAS_F.length];
        var col = COLORES[hash(s + 'c' + k + '_' + x) % COLORES.length];
        filas += '<text x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" fill="' + col +
                 '" font-size="' + tam + '">' + esc(p) + '</text>';
        x += p.length * tam * 0.62 + tam * 0.9;
      }
      y += tam * 1.55; k++;
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;display:block;background:' +
      (o.papel || '#0a0a0d') + ';">' +
      '<g opacity="' + op + '" font-family="Inter,system-ui,sans-serif" font-weight="800">' +
      filas + '</g></svg>';
  }

  // ── Fondo ─────────────────────────────────────────────────────────
  function textura(txt, o) {
    o = o || {};
    var W = o.w || 620, H = o.h || 250;
    var t = String(txt || 'FRATE').toUpperCase();
    var col = o.color || '#E8363D', op = o.op == null ? 0.2 : o.op;
    var tam = o.tam || 8, paso = tam * 1.22;
    var frase = t + ' · ';
    var veces = Math.ceil((W * 2.6) / (frase.length * tam * 0.47)) + 2;
    var linea = new Array(veces + 1).join(frase), filas = '';
    for (var y = tam, k = 0; y < H + tam; y += paso, k++) {
      filas += '<text x="' + (-(hash(t + k) % 150) - 30) + '" y="' + y.toFixed(1) + '">' + esc(linea) + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;display:block;background:' + (o.papel || '#0a0a0d') + ';">' +
      '<g fill="' + col + '" opacity="' + op + '" font-family="Inter,system-ui,sans-serif" font-size="' + tam +
      '" font-weight="800">' + filas + '</g></svg>';
  }

  // ── Texto que SIEMPRE llena el ancho ──────────────────────────────
  function fitText(txt, o) {
    o = o || {};
    var W = o.w || 440, color = o.color || '#fff';
    var t = String(txt || '').toUpperCase();
    var L = o.lineas;
    if (!L) {
      var p = t.split(/\s+/).filter(Boolean);
      if (t.length <= (o.corte || 13) || p.length < 2) L = [t];
      else {
        // Parte en dos por la mitad REAL del texto, no por cantidad de
        // palabras: si no, «QUE TE VAYA / SUPER BIEN» queda desbalanceado.
        var mitad = t.length / 2, mejor = 1, dif = 1e9;
        for (var i = 1; i < p.length; i++) {
          var a = p.slice(0, i).join(' ').length;
          if (Math.abs(a - mitad) < dif) { dif = Math.abs(a - mitad); mejor = i; }
        }
        L = [p.slice(0, mejor).join(' '), p.slice(mejor).join(' ')];
      }
    }
    var fs = o.fs || Math.min(W * 0.30, 150 / L.length);
    var H = Math.round(fs * 1.02 * L.length);
    var F = "Impact,'Arial Narrow','Haettenschweiler',sans-serif";
    var tx = L.map(function (l, i) {
      return '<text x="0" y="' + (fs * 0.82 + fs * 1.02 * i).toFixed(1) + '" textLength="' + W +
        '" lengthAdjust="spacingAndGlyphs" font-size="' + fs.toFixed(1) + '" font-family="' + F +
        '" font-weight="900" fill="' + color + '">' + esc(l) + '</text>';
    }).join('');
    // xMinYMid cuando se pide `izq`: si el contenedor le pone un tope de
    // alto, el SVG se encoge y con xMid queda centrado, separado del borde.
    var pa = (o.align === 'izq' ? 'xMinYMid' : 'xMidYMid') + ' meet';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="' + pa + '" ' +
      'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(t) + '" ' +
      'style="width:100%;height:auto;display:block;' + (o.sombra === false ? '' : 'filter:drop-shadow(0 3px 14px rgba(0,0,0,.9));') + '">' +
      tx + '</svg>';
  }

  // ── Mosaico de emoji, para los enlaces ────────────────────────────
  function mosaico(emojis, o) {
    o = o || {};
    var W = o.w || 620, H = o.h || 92, tam = o.tam || 12, op = o.op == null ? 0.32 : o.op;
    var E = [].concat(emojis || ['✨']);
    var pY = tam * 1.12, pX = tam * 1.28, out = '';
    for (var y = tam, r = 0; y < H + tam; y += pY, r++) {
      for (var x = (r % 2 ? -pX / 2 : 0) - 3, c = 0; x < W + tam; x += pX, c++) {
        out += '<text x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '">' + E[(r * 3 + c) % E.length] + '</text>';
      }
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;display:block;background:' + (o.papel || '#0f0f12') + ';">' +
      '<g opacity="' + op + '" font-size="' + tam + '">' + out + '</g></svg>';
  }

  // Emoji por defecto según lo que diga el enlace. Solo aplica cuando el
  // admin no cargó los suyos.
  var EMO = [
    [/mujer|femenin|chicas|girls/i,        ['👩', '💃', '👯', '💋', '👛']],
    [/universitar|estudiante|campus/i,     ['🎓', '📚', '✏️', '🏫', '📐']],
    [/cumple/i,                            ['🎂', '🕯️', '🎉', '🎁', '🧁']],
    [/reserva|mesa|vip/i,                  ['🍾', '🥂', '🍸', '🪑', '✨']],
    [/despedida|solter/i,                  ['💍', '👰', '🥳', '🎊', '💐']],
    [/frecuente|club|premio|punto/i,       ['⭐', '🏆', '💎', '🔥', '👑']],
    [/convenio|empresa/i,                  ['🤝', '🏢', '📋', '💼', '✅']],
    [/hombre|masculin/i,                   ['🕺', '🍻', '😎', '🎧', '👟']],
    [/entrada|ticket|cortes/i,             ['🎟️', '🎫', '✨', '🔥', '🎉']]
  ];
  function emojisDe(item) {
    var propios = String((item && item.emojis) || '').trim();
    if (propios) return Array.from(propios).filter(function (c) { return c.trim(); });
    var txt = String((item && (item.titulo || item.nombre)) || '');
    for (var i = 0; i < EMO.length; i++) if (EMO[i][0].test(txt)) return EMO[i][1];
    var uno = (item && item.emoji) || '✨';
    return [uno, '✨', '🔥'];
  }

  // ── La portada completa de un evento ──────────────────────────────
  // Orden: lo que forzó el admin → video → foto/flyer → decoración generada.
  function fondoHTML(ev, o) {
    ev = ev || {}; o = o || {};
    var cfg = (ev.brief && ev.brief.portada) || {};
    var modo = cfg.modo || 'auto';
    var vid = cfg.video_url || ev.video_url;
    var img = cfg.imagen_url || ev.imagen_url;
    var cls = o.clase || 'heroimg';
    if (modo !== 'caligrama') {
      if ((modo === 'video' || modo === 'auto') && vid)
        return '<video autoplay muted loop playsinline class="' + cls + '" src="' + esc(vid) + '"></video>';
      if ((modo === 'foto' || modo === 'flyer' || modo === 'auto') && img)
        return '<img class="' + cls + '" src="' + esc(img) + '" alt="" loading="lazy"/>';
    }
    return textura(ev.nombre || 'FRATE', {
      w: o.w, h: o.h, color: colorDe(ev.nombre, cfg),
      op: cfg.op, tam: cfg.tam
    });
  }

  // El bloque de fecha. `fondo`: 'color' (relleno, texto negro) | 'negro'.
  // Va con los estilos EN LÍNEA a propósito: lo usan tres páginas distintas
  // y no quiero el mismo bloque de CSS copiado en las tres, desincronizándose.
  function fechaHTML(ev, o) {
    o = o || {};
    var cfg = (ev && ev.brief && ev.brief.portada) || {};
    var col = colorDe(ev && ev.nombre, cfg);
    var negro = (cfg.fecha_fondo || o.fondo || 'color') === 'negro';
    var m = String((ev && ev.fecha) || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var tinta = negro ? col : '#0a0a0d';         // sobre el color, el texto va NEGRO
    var ancho = o.ancho || 132;
    var caja = 'flex:0 0 ' + ancho + 'px;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;line-height:1;padding:14px 11px;color:' + tinta + ';' +
      (negro ? 'background:rgba(6,6,8,.9);border-left:2px solid ' + col + ';' : 'background:' + col + ';');
    return '<div style="' + caja + '">' +
      '<div style="width:100%;margin-bottom:4px;">' +
        fitText(DOW[d.getDay()], { w: 100, fs: 13, color: tinta, sombra: false }) + '</div>' +
      '<div style="font-size:' + (o.num || 70) + 'px;font-family:Impact,sans-serif;line-height:.84;margin:2px 0;font-weight:900;">' +
        String(d.getDate()).padStart(2, '0') + '</div>' +
      '<div style="font-size:13px;letter-spacing:3px;font-weight:900;font-family:Impact,sans-serif;">' +
        MES[d.getMonth()].slice(0, 3) + '</div>' +
      '<div style="font-size:10.5px;letter-spacing:1.5px;font-weight:800;width:82%;text-align:center;' +
        'border-top:1px solid ' + (negro ? col + '66' : 'rgba(0,0,0,.35)') + ';margin-top:9px;padding-top:7px;">' +
        esc((ev && ev.hora) || '23:00') + '</div></div>';
  }

  // ── La fila de una entrada ────────────────────────────────────────
  // Vivía DUPLICADA en comprar.html (renderTks) y en frate-cuenta.js
  // (renderTicketTypes). Cada arreglo había que hacerlo dos veces, y cada
  // vez que se hacía una sola las dos pantallas se separaban: el afiche, la
  // fecha grande y los colores fluor quedaron en una y no en la otra.
  //
  // Acepta los DOS juegos de nombres que usaban las dos pantallas
  // (max_por_compra / maxPorCompra, hora_max_ingreso / horaMaxIngreso…),
  // así ninguna tiene que traducir su objeto antes de llamar.
  function normTicket(t) {
    t = t || {};
    var v = function () {
      for (var i = 0; i < arguments.length; i++) if (t[arguments[i]] != null && t[arguments[i]] !== '') return t[arguments[i]];
      return undefined;
    };
    return {
      id:      v('id'),
      nombre:  v('nombre', 'titulo') || 'Entrada',
      precio:  Number(v('precio') || 0),
      disponible: Number(t.disponible != null ? t.disponible : 99),
      estado:  v('estado') || 'Activo',
      max:     Number(v('max_por_compra', 'maxPorCompra') || 10),
      genero:  v('genero', 'publico') || '',
      instrucciones: v('instrucciones') || '',
      horaMax: v('hora_max_ingreso', 'horaMaxIngreso') || '',
      venceHora: v('vence_hora', 'venceHora') || '',
      descripcion: v('descripcion') || '',
      color:   v('color') || '',
      soloMiembros:  !!t.solo_miembros,     // 🎁 entrada de regalo: hay que tener cuenta
      unoPorPersona: !!t.uno_por_persona,
      emojis:  v('emojis') || '',
      rotulo:  v('rotulo') || ''
    };
  }

  var GEN = { F: '👩 Solo mujeres', M: '👨 Solo hombres', U: '🎓 Solo universitarios' };

  /**
   * entradaHTML(ticket, o) → la tarjeta completa de una entrada.
   * o: { cerrado, cantidad, onMenos, onMas, precioTxt, qtyId }
   *    `qtyId` importa: comprar.html busca «q9» y el popup busca «qty-9».
   *    Si acá se fijara uno, el contador de la otra pantalla no se movería.
   *    `cerrado` lo decide cada página (cada una calcula distinto la hora
   *    límite), pero el aspecto lo decide esta función y nadie más.
   */
  function entradaHTML(ticket, o) {
    o = o || {};
    var t = normTicket(ticket);
    var e = function (x) { return esc(x); };
    var agotado = t.estado === 'Agotado' || t.disponible <= 0;
    var cerrado = !!o.cerrado || t.estado === 'Cerrado';
    var bloq = agotado || cerrado;
    var pocas = !bloq && t.disponible > 0 && t.disponible < 10;
    // «Venta cerrada» se lee como «no vengas». Cuando ya no queda nada online
    // pero SÍ se vende en la puerta, el mismo estado tiene que leerse como una
    // instrucción y no como un portazo. `enPuerta` lo decide la página con
    // enPuertaPara(); acá sólo se pinta.
    // El «Agotado» NO cambia de texto: el dueño lo quiere siempre así. Lo que
    // se le suma es la línea de abajo.
    var enPuerta = !!o.enPuerta;
    var st = agotado ? { t: 'Agotado', bg: 'rgba(161,161,170,.18)', c: '#a1a1aa', b: '#3a3a3c' }
           : cerrado ? (enPuerta
               ? { t: 'Solo en puerta', bg: 'rgba(239,159,39,.16)', c: '#EF9F27', b: 'rgba(239,159,39,.45)' }
               : { t: 'Venta cerrada',  bg: 'rgba(161,161,170,.18)', c: '#a1a1aa', b: '#3a3a3c' })
           : pocas   ? { t: 'Quedan pocas', bg: 'rgba(245,158,11,.14)', c: '#f59e0b', b: 'rgba(245,158,11,.4)' }
           :           { t: 'Activo', bg: 'rgba(34,197,94,.1)', c: '#22c55e', b: 'rgba(34,197,94,.3)' };

    var col = bloq ? '#6b6b73' : colorDe(t.nombre, { color: t.color, publico: t.genero });
    var emos = emojisDe({ titulo: t.nombre, emojis: t.emojis, emoji: '🎟️' });
    var rot = rotuloDe(t);
    var gTxt = GEN[t.genero] || '';
    var gMini = gTxt ? ' <span class="tt-pub" style="color:' + col + ';background:' + col + '22;border:1px solid ' + col + ';">' + gTxt + '</span>' : '';

    var bullets = t.instrucciones
      ? String(t.instrucciones).split('\n').filter(function (l) { return l.trim(); })
          .map(function (l) { return '<div style="line-height:1.45;">• ' + e(l.trim()) + '</div>'; }).join('')
      : '';
    var hay = !!(t.instrucciones || t.horaMax || gTxt || t.descripcion || t.soloMiembros);
    var det = (t.soloMiembros ? '<div style="color:#E6C860;font-weight:700;margin-bottom:4px;">Solo para miembros de FRATE' + (t.unoPorPersona ? ' · una por persona' : '') + '</div>' : '')
      + (gTxt ? '<div style="color:' + col + ';font-weight:700;margin-bottom:4px;">' + gTxt + ' · se verifica en la puerta con tu cédula</div>' : '')
      + (t.horaMax ? '<div style="color:#E6C860;font-weight:600;margin-bottom:4px;">🕐 Ingreso válido hasta las ' + e(t.horaMax) + '</div>' : '')
      + (bullets || ((!gTxt && !t.horaMax && t.descripcion) ? '<div>' + e(t.descripcion) + '</div>' : ''))
      + (!bloq ? '<div style="color:#71717a;margin-top:6px;">Máx. ' + t.max + ' por compra'
          + (t.venceHora ? ' · 🕐 venta hasta las ' + e(t.venceHora) : '') + '</div>' : '');

    var q = o.cantidad || 0;
    var step = bloq
      ? '<div class="step" style="opacity:.4;pointer-events:none;"><button>−</button><b>0</b><button class="plus">＋</button></div>'
      : '<div class="step"><button onclick="' + (o.onMenos || '') + '">−</button>'
        + '<b id="' + e(o.qtyId || ('q' + t.id)) + '">' + q + '</b>'
        + '<button class="plus" style="border-color:' + col + ';color:' + col + ';" onclick="' + (o.onMas || '') + '">＋</button></div>';

    return '<div class="ttc' + (bloq ? ' agot' : '') + '" data-ttid="' + e(t.id) + '" style="border-color:' + col + '55;">'
      + (bloq ? '' : '<div class="tt-deco">' + mosaico(emos, { w: 560, h: 150, tam: 11, op: 0.26, papel: '#0d0d10' }) + '</div>')
      + '<div class="tt-franja" style="background:' + col + ';box-shadow:0 0 16px ' + col + '99;"></div>'
      + '<div class="tt-head"><div>'
      + (rot ? '<div class="tt-rot" style="color:' + col + ';text-shadow:0 0 12px ' + col + '55;">' + e(rot) + '</div>' : '')
      + '<div class="tt-title">' + e(etiquetaPublica(t.nombre)) + gMini
      + (t.soloMiembros ? ' <span class="tt-pub" style="color:#E6C860;background:#E6C86022;border:1px solid #E6C860;">Solo miembros</span>' : '')
      + '</div></div>'
      + '<span class="tt-status" style="background:' + st.bg + ';color:' + st.c + ';border-color:' + st.b + ';">' + st.t + '</span></div>'
      + (hay ? '<div class="tt-details" style="display:none;max-height:0;overflow:hidden;">' + det + '</div>' : '')
      + '<div class="tt-foot">'
      + '<div class="tt-price" style="color:' + col + ';text-shadow:0 0 18px ' + col + '44;">'
      + (o.precioTxt != null ? e(o.precioTxt) : (t.precio ? '$' + t.precio.toLocaleString('es-CL') : 'Gratis')) + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + (hay ? '<button type="button" class="tt-more" onclick="event.stopPropagation();FrateAfiche.toggle(this)">Condiciones <span class="tt-chev">▾</span></button>' : '')
      + step + '</div></div>'
      + (pocas ? '<div class="tt-pocas">🔥 ¡Solo quedan ' + t.disponible + '!</div>' : '')
      + (bloq && enPuerta ? '<div class="tt-puerta">🚪 Entradas solo en puerta</div>' : '')
      + '</div>';
  }
  // Abre/cierra las condiciones. Pone el display EN LÍNEA además de la
  // clase: las dos pantallas tienen hojas de estilo distintas para
  // `.tt-details` (una usa display:none, la otra max-height) y cuál gana
  // depende del orden de carga. Con el estilo en línea no depende de nadie.
  function toggle(el) {
    var c = el && el.closest && el.closest('.ttc');
    if (!c) return;
    var abierto = c.classList.toggle('open');
    var d = c.querySelector('.tt-details');
    if (d) {
      d.style.display = abierto ? 'block' : 'none';
      d.style.maxHeight = abierto ? '400px' : '0';
      d.style.overflow = 'hidden';
      if (abierto && !d.style.padding) d.style.padding = '8px 10px';
    }
    var ch = c.querySelector('.tt-chev');
    if (ch) ch.textContent = abierto ? '▴' : '▾';
  }

  // El CSS de la fila, para la página que no lo tenga. Se inyecta una sola vez.
  var CSS = '.ttc{position:relative;border:1px solid #26262b;border-radius:13px;overflow:hidden;margin-bottom:9px;background:#0d0d10;}'
    + '.ttc.agot{opacity:.55;}'
    + '.tt-deco{position:absolute;inset:0;}'
    + '.tt-deco::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,10,13,.92) 44%,rgba(10,10,13,.5));}'
    + '.tt-franja{position:absolute;left:0;top:0;bottom:0;width:4px;z-index:3;}'
    + '.tt-head{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:11px 13px 0 16px;}'
    + '.tt-rot{font-size:.56rem;letter-spacing:2.5px;font-weight:900;margin-bottom:2px;}'
    + '.tt-title{font-family:"Barlow Condensed",Impact,sans-serif;font-size:1.12rem;font-weight:800;line-height:1.2;color:#f4f4f6;}'
    + '.tt-pub{font-family:Inter,sans-serif;font-size:.56rem;font-weight:800;border-radius:99px;padding:2px 8px;white-space:nowrap;}'
    + '.tt-status{flex:none;font-size:.56rem;letter-spacing:1.5px;font-weight:800;border:1px solid;border-radius:6px;padding:3px 9px;text-transform:uppercase;}'
    + '.tt-details{position:relative;z-index:2;max-height:0;overflow:hidden;transition:max-height .22s;font-size:.72rem;color:#c9c9d1;padding:0 13px 0 16px;}'
    + '.ttc.open .tt-details{max-height:280px;padding-top:8px;}'
    + '.tt-foot{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 13px 12px 16px;flex-wrap:wrap;}'
    + '.tt-price{font-family:"Barlow Condensed",Impact,sans-serif;font-size:1.85rem;font-weight:900;line-height:1;}'
    + '.tt-more{background:transparent;border:1px solid #26262b;color:#8a8a92;border-radius:99px;padding:6px 11px;font-size:.6rem;letter-spacing:1.5px;font-weight:700;cursor:pointer;text-transform:uppercase;font-family:inherit;}'
    + '.tt-chev{display:inline-block;transition:transform .2s;}.ttc.open .tt-chev{transform:rotate(180deg);}'
    + '.ttc .step{display:flex;align-items:center;gap:8px;}'
    + '.ttc .step button{width:33px;height:33px;border:1px solid #26262b;background:transparent;color:#8a8a92;border-radius:8px;font-size:17px;cursor:pointer;}'
    + '.ttc .step b{min-width:20px;text-align:center;font-size:16px;color:#f4f4f6;}'
    + '.tt-pocas{position:relative;z-index:2;font-size:.66rem;color:#f59e0b;padding:0 16px 10px;font-weight:700;}'
    + '.tt-puerta{position:relative;z-index:2;font-size:.66rem;color:#EF9F27;padding:0 16px 10px;font-weight:700;}';
  function estilos(id) {
    id = id || 'frate-afiche-css';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    var e = document.createElement('style'); e.id = id; e.textContent = CSS;
    document.head.appendChild(e);
  }

  // Lee el modo y la paleta de config_valores con el cliente de cada página.
  // Va acá y no repetido en las tres para que no se desincronicen; si falla,
  // se queda con el automático y la paleta fluor, que es lo correcto por defecto.
  function cargarConfig(sb) {
    if (!sb || !sb.from) return Promise.resolve(false);
    return sb.from('config_valores').select('clave,valor').in('clave', ['deco_color_modo', 'deco_paleta'])
      .then(function (r) {
        var modo = null, paleta = null;
        (r && r.data || []).forEach(function (x) {
          if (x.clave === 'deco_color_modo' && x.valor) modo = x.valor;
          if (x.clave === 'deco_paleta' && x.valor) { try { var p = JSON.parse(x.valor); if (p && p.length) paleta = p; } catch (e) {} }
        });
        if (modo || paleta) setModo(modo, paleta);
        return true;
      })
      .catch(function () { return false; });
  }

  global.FrateAfiche = {
    setModo: setModo, cargarConfig: cargarConfig, rotuloDe: rotuloDe, POR_PUBLICO: POR_PUBLICO,
    etiquetaPublica: etiquetaPublica, familiaDe: familiaDe, enPuertaPara: enPuertaPara,
    entradaHTML: entradaHTML, normTicket: normTicket, toggle: toggle, estilos: estilos, CSS: CSS,
    textura: textura, texturaF: texturaF, PALABRAS_F: PALABRAS_F,
    titulo: fitText, fitText: fitText, mosaico: mosaico,
    emojisDe: emojisDe, colorDe: colorDe, fondoHTML: fondoHTML, fechaHTML: fechaHTML,
    // se mantiene el nombre viejo para no romper nada que ya lo llame
    portadaHTML: fondoHTML, afiche: textura,
    DOW: DOW, MES: MES, COLORES: COLORES
  };
})(typeof window !== 'undefined' ? window : this);
