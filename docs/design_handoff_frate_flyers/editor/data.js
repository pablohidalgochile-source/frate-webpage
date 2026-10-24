/* ============================================================
   FRATE EDITOR — DATOS + MODELO DE CAPAS  (plain JS, global)
   La app: formulario → EVENT → template.layers → editor.
   Cada capa = { id, name, type, x, y, w, h?, z, role, locked,
                 selectable, html(EVENT) → string }.
   Los textos editables llevan data-edit="campo".
   ============================================================ */
(function () {
  const A = "../assets";

  /* ---- Paletas (3 colores: A dominante, B, C) + libres ---- */
  const PALETTES = {
    rec:     { name: "Rosa",    colors: ["#ff2d78", "#00e5ff", "#b14bff"] },
    violeta: { name: "Violeta", colors: ["#b14bff", "#00e5ff", "#ff2d78"] },
    cyan:    { name: "Cyan",    colors: ["#00e5ff", "#ff2d78", "#b14bff"] },
    coral:   { name: "Coral",   colors: ["#ff6a3d", "#ffd23d", "#ff2d78"] },
    verde:   { name: "Verde",   colors: ["#39ff7d", "#00e5ff", "#f5ff3d"] }
  };
  const FORMATS = { story: [1080, 1920], carousel: [1080, 1350], poster: [1080, 1620] };
  const KW_FONTS = { bungee: "'Bungee', cursive", marker: "'Permanent Marker', cursive", spray: "'Rubik Spray Paint', cursive" };

  /* ---- Helpers de contenido dinámico ---- */
  function bar(pct, total) {
    const on = Math.round(total * pct / 100);
    let s = "";
    for (let i = 0; i < total; i++) s += `<span class="seg${i < on ? "" : " off"}"></span>`;
    return s + `<span class="pct">${pct}%</span>`;
  }
  function songPlayer(d) {
    return `<div class="song-player"><div class="sp-play">▶</div><div class="sp-info">`
      + `<div class="sp-kicker">SONANDO EN LA PISTA</div>`
      + `<div class="sp-title" data-edit="songTitle">${d.songTitle}</div>`
      + `<div class="sp-artist" data-edit="songArtist">${d.songArtist}</div>`
      + `<div class="sp-bar"><i></i></div></div></div>`;
  }
  function prizesInline(arr) {
    return arr.map((p, i) => `${i ? '<span class="fr-plus">+</span>' : ""}<div class="fr-prize"><b>${p.n}</b><small>${p.label}</small></div>`).join("");
  }

  /* ============================================================
     EVENT por defecto (demo) — todo es parámetro
     ============================================================ */
  const EVENT = {
    rec: "REC", fps: "180FPS", timecode: "23:47:32", zone: "ZONA PISTA",
    venue: "FRATERNIDAD", venueSub: "CAMPUS CENTRAL",
    hudEyeLabel: "SU MIRADA",
    impactoLabel: "NIVEL DE IMPACTO", impacto: "99.7%",
    peligroLabel: "PELIGROSIDAD", peligro: "EXTREMA",
    ubicLabel: "UBICACIÓN", ubic: "FRATE", ubicSub: "PISTA CENTRAL",
    horaLabel: "HORA DETECTADA", hora: "01:47 AM",
    typing: "ESCRIBIENDO…",
    chat: [
      { side: "in",  text: "No sé cómo decírtelo…", time: "23:47" },
      { side: "out", text: "pero cada vez que sonríes se me olvida todo", time: "23:48", seen: true },
      { side: "in",  text: "Nos vemos en FRATE?", time: "23:48" },
      { side: "out", text: "sí.", time: "23:48", seen: true }
    ],
    titlePre: "DIAGNÓSTICO:", titleLine1: "ME ENCANTA", titleTu: "TU", titleKeyword: "SONRISA",
    analysisLabel: "ANÁLISIS COMPLETO", analysisPct: 99,
    dateDay: "JUEVES", dateNum: "30", dateMonth: "ABRIL", time: "11 PM – 05 AM",
    tags: ["PERREO", "AMIGOS", "HISTORIAS"],
    concursoTitle: "CONCURSO", concursoText: "Etiqueta a quien te hace sonreír y gana:",
    prizes: [{ n: "4", label: "ENTRADAS" }, { n: "1", label: "BOTELLA DESTILADO A ELECCIÓN" }],
    songTitle: "SI ANTES TE HUBIERA CONOCIDO", songArtist: "KAROL G",
    handle: "@FRATERNIDADCAMPUSCENTRAL",
    entUrl: "WWW.FRATE.CL", qrUrl: "https://www.frate.cl",
    // scanner
    fileTitle: "ARCHIVO ENCONTRADO", caso: "MIRADA 7.2B",
    objetivo: "OBJETIVO IDENTIFICADO",
    concept: "PERO ME ENAMORA MÁS COMO BAILAS.",
    polas: ["#REC", "#02A", "#02B", "#EC"],
    metaAcceso: "ACCESO +18", metaDress: "TU MEJOR VERSIÓN"
  };

  /* ============================================================
     PLANTILLA 1 — REC / DIAGNÓSTICO  (base poster 1080×1620)
     roles de color: A=título · B=hud/chat · C=fecha/concurso/tags/qr/song
     ============================================================ */
  const REC = {
    id: "rec", name: "REC · Diagnóstico forense", css: ["../styles.css"],
    format: "poster", defaultPalette: "rec",
    layers: [
      { id: "photo", name: "Foto (fondo)", type: "image", x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: "-",
        html: () => `<div class="fr-photo" style="position:absolute;inset:0"><image-slot id="ed-face" shape="rect" placeholder="ARRASTRA EL ROSTRO"></image-slot></div>` },
      { id: "recbar", name: "REC · FPS", type: "group", x: 48, y: 48, w: 220, z: 5, role: "A",
        html: (d) => `<div class="fr-rec"><div class="fr-rec-row"><span class="fr-dot"></span><span class="fr-rec-label" data-edit="rec">${d.rec}</span></div><span class="fr-mono-sm" data-edit="fps">${d.fps}</span></div>` },
      { id: "logo", name: "Logo Fraternidad", type: "image", x: 372, y: 34, w: 336, h: 132, z: 5, role: "-",
        html: () => `<img src="${A}/logo-fraternidad.png" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 14px rgba(0,0,0,.6))" alt="Fraternidad">` },
      { id: "cam", name: "Cámara (batería)", type: "group", x: 842, y: 48, w: 188, z: 5, role: "-",
        html: (d) => `<div class="fr-cam"><div class="fr-battery"><i></i><i></i><i></i><i></i></div><span class="fr-mono-sm" data-edit="timecode">${d.timecode}</span><span class="fr-mono-sm" data-edit="zone">${d.zone}</span></div>` },
      { id: "hud", name: "HUD (tarjetas)", type: "group", x: 48, y: 300, w: 240, z: 6, role: "B",
        style: "display:flex;flex-direction:column;gap:14px",
        html: (d) => `
          <div class="fr-card"><div class="fr-card-row"><div class="fr-eye"><image-slot id="ed-eye" shape="circle" placeholder="ojo" style="width:100%;height:100%"></image-slot></div><div style="flex:1"><div class="fr-card-label" data-edit="hudEyeLabel">${d.hudEyeLabel}</div><svg class="fr-heart-line" viewBox="0 0 160 26" preserveAspectRatio="none"><polyline points="0,13 30,13 40,4 50,22 60,8 70,16 80,13 110,13 120,6 128,18 136,13 160,13"/></svg></div></div></div>
          <div class="fr-card"><div class="fr-card-label" data-edit="impactoLabel">${d.impactoLabel}</div><div class="fr-card-val fr-val-accent" data-edit="impacto">${d.impacto}</div></div>
          <div class="fr-card"><div class="fr-card-label" data-edit="peligroLabel">${d.peligroLabel}</div><div class="fr-card-val" data-edit="peligro">${d.peligro}</div></div>
          <div class="fr-card"><div class="fr-card-row"><span class="fr-pin">◈</span><div class="fr-card-label" data-edit="ubicLabel">${d.ubicLabel}</div></div><div class="fr-card-val" style="font-size:22px;margin-top:6px" data-edit="ubic">${d.ubic}</div><div class="fr-card-label" data-edit="ubicSub">${d.ubicSub}</div></div>
          <div class="fr-card"><div class="fr-card-label" data-edit="horaLabel">${d.horaLabel}</div><div class="fr-card-val fr-val-accent" style="font-size:24px" data-edit="hora">${d.hora}</div></div>` },
      { id: "chat", name: "Chat", type: "group", x: 772, y: 360, w: 262, z: 6, role: "B",
        style: "display:flex;flex-direction:column;gap:12px;align-items:flex-end",
        html: (d) => `<div class="fr-typing" data-edit="typing">${d.typing} <b></b><b></b><b></b></div>`
          + d.chat.map(m => `<div class="fr-bubble ${m.side === "out" ? "fr-out" : "fr-in"}">${m.text}<span class="t">${m.time}${m.seen ? ' <span class="fr-check">✓✓</span>' : ""}</span></div>`).join("") },
      { id: "title", name: "Título", type: "group", x: 56, y: 900, w: 980, z: 7, role: "A",
        html: (d) => `<div class="fr-title ts-aligned">`
          + `<div class="fr-title-pre" data-edit="titlePre">${d.titlePre}</div>`
          + `<div class="fr-title-1"><span data-edit="titleLine1">${d.titleLine1}</span> <span class="fr-title-tu" data-edit="titleTu">${d.titleTu}</span></div>`
          + `<div class="fr-title-2"><span data-edit="titleKeyword">${d.titleKeyword}</span><span class="fr-title-heart">♡</span></div></div>` },
      { id: "analysis", name: "Análisis", type: "group", x: 260, y: 1168, w: 560, z: 7, role: "A",
        style: "text-align:center",
        html: (d) => `<div class="fr-analysis-label" data-edit="analysisLabel">${d.analysisLabel}</div><div class="fr-bar" data-bar="${d.analysisPct}"></div>` },
      { id: "date", name: "Fecha", type: "group", x: 56, y: 1250, w: 360, z: 6, role: "C", anchor: "bottom",
        html: (d) => `<div class="fr-date-day" data-edit="dateDay">${d.dateDay}</div><div class="fr-date-main"><span class="fr-date-num" data-edit="dateNum">${d.dateNum}</span><span class="fr-date-month" data-edit="dateMonth">${d.dateMonth}</span></div><div class="fr-date-time" data-edit="time">${d.time}</div>` },
      { id: "wordmark", name: "FRATE (wordmark)", type: "group", x: 380, y: 1258, w: 320, z: 6, role: "-", anchor: "bottom",
        style: "text-align:center",
        html: () => `<div class="fr-wordmark">FRAT<span class="eq">E</span></div><div class="fr-wordmark-sub">CAMPUS CENTRAL</div>` },
      { id: "tags", name: "Tags", type: "group", x: 800, y: 1250, w: 232, z: 6, role: "C", anchor: "bottom",
        style: "text-align:right",
        html: (d) => `<div class="fr-tags">${d.tags.map(t => `<div><span>${t[0]}</span>${t.slice(1)}</div>`).join("")}</div>` },
      { id: "concurso", name: "Concurso", type: "group", x: 56, y: 1418, w: 440, z: 6, role: "C", anchor: "bottom",
        html: (d) => `<div class="fr-concurso"><h4 data-edit="concursoTitle">${d.concursoTitle}</h4><p data-edit="concursoText">${d.concursoText}</p><div class="fr-prizes">${prizesInline(d.prizes)}</div></div>` },
      { id: "song", name: "Canción + redes", type: "group", x: 520, y: 1432, w: 300, z: 6, role: "C", anchor: "bottom",
        style: "display:flex;flex-direction:column;gap:10px",
        html: (d) => songPlayer(d) + `<div class="fr-handle" data-edit="handle">${d.handle}</div><div class="fr-socials"><i>IG</i><i>TT</i><i>SP</i><i>YT</i></div>` },
      { id: "qr", name: "QR entradas", type: "group", x: 902, y: 1408, w: 130, z: 7, role: "C", anchor: "bottom",
        style: "text-align:right",
        html: (d) => `<div class="fr-qr" data-qr="${d.qrUrl}"></div><div class="fr-qr-cap">ENTRADAS · <span data-edit="entUrl">${d.entUrl}</span></div>` },
      { id: "overlay", name: "Overlays (grain)", type: "deco", x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: "-",
        html: () => `<div class="fr-flare" style="position:absolute;inset:0"></div><div class="fr-scan" style="position:absolute;inset:0"></div><div class="fr-grain" style="position:absolute;inset:0"></div>` }
    ]
  };

  /* ============================================================
     PLANTILLA 2 — SCANNER / ARCHIVO  (base poster 1080×1620)
     roles: A=título · B=archivo/crosshair/sello · C=concurso/song/tags/qr
     ============================================================ */
  const SCAN = {
    id: "scanner", name: "Scanner · Archivo encontrado", css: ["../styles.css", "../scanner.css"],
    format: "poster", defaultPalette: "violeta",
    layers: [
      { id: "photo", name: "Foto (fondo)", type: "image", x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: "-",
        html: () => `<div class="fr-photo" style="position:absolute;inset:0"><image-slot id="ed-face" shape="rect" placeholder="ARRASTRA EL ROSTRO"></image-slot></div>` },
      { id: "date", name: "Badge fecha", type: "group", x: 56, y: 50, w: 190, z: 6, role: "A",
        html: (d) => `<div class="sc-datebadge" style="position:static"><div class="sc-db-day" data-edit="dateDay">${d.dateDay}</div><div class="sc-db-num" data-edit="dateNum">${d.dateNum}</div><div class="sc-db-month" data-edit="dateMonth">${d.dateMonth}</div></div>` },
      { id: "logo", name: "Logo Fraternidad", type: "image", x: 372, y: 40, w: 336, h: 120, z: 6, role: "-",
        html: () => `<img src="${A}/logo-fraternidad.png" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 14px rgba(0,0,0,.6))" alt="Fraternidad">` },
      { id: "time", name: "Horario", type: "text", x: 56, y: 250, w: 240, z: 6, role: "-",
        html: (d) => `<div class="sc-time" style="position:static" data-edit="time">${d.time}</div>` },
      { id: "seal", name: "Sello F", type: "group", x: 64, y: 330, w: 92, h: 92, z: 6, role: "B",
        html: () => `<div class="sc-seal" style="position:static"><b>F</b></div>` },
      { id: "file", name: "Archivo encontrado", type: "group", x: 752, y: 168, w: 272, z: 7, role: "B",
        html: (d) => `<div class="sc-file" style="position:static;width:100%"><div class="sc-file-h" data-edit="fileTitle">${d.fileTitle}</div><div class="sc-file-body"><div class="sc-row"><em>CASO:</em> <b data-edit="caso">${d.caso}</b></div><div class="sc-row"><em>UBICACIÓN:</em> <span data-edit="ubic">${d.ubic}</span></div><div class="sc-row"><em>HORA:</em> <span data-edit="hora">${d.hora}</span></div><div class="sc-row"><em>NIVEL DE IMPACTO:</em></div><div class="fr-bar" data-bar="${d.analysisPct}"></div><div class="sc-danger" data-edit="peligro">PELIGROSIDAD: ${d.peligro}</div></div></div>` },
      { id: "song", name: "Canción", type: "group", x: 56, y: 560, w: 290, z: 7, role: "C",
        html: (d) => songPlayer(d) },
      { id: "cross", name: "Crosshair", type: "deco", x: 560, y: 300, w: 230, h: 230, z: 5, role: "B",
        html: () => `<div class="sc-cross" style="position:static;width:100%;height:100%"><i class="r1"></i><i class="r2"></i><i class="r3"></i><span class="h"></span><span class="v"></span></div>` },
      { id: "objetivo", name: "Tag objetivo", type: "text", x: 560, y: 548, w: 240, z: 8, role: "B",
        html: (d) => `<div class="fr-tag-float" style="position:static;display:inline-block" data-edit="objetivo">${d.objetivo}</div>` },
      { id: "title", name: "Título", type: "group", x: 60, y: 820, w: 960, z: 8, role: "A",
        style: "text-align:center",
        html: (d) => `<div class="sc-title"><div class="fr-title-1" data-edit="titleLine1">${d.titleLine1}</div><div class="sc-tline2"><div class="sc-kw-wrap"><span class="fr-title-tu" data-edit="titleTu">${d.titleTu}</span><span class="fr-title-2"><span data-edit="titleKeyword">${d.titleKeyword}</span><span class="fr-title-heart">♡</span></span></div></div><div class="sc-concept" data-edit="concept">${d.concept}</div></div>` },
      { id: "polas", name: "Polaroids", type: "group", x: 90, y: 1120, w: 900, z: 7, role: "-", anchor: "bottom",
        style: "display:flex;gap:14px;justify-content:center",
        html: (d) => d.polas.map((cap, i) => `<div class="sc-pola" style="flex:1"><image-slot id="ed-pola-${i + 1}" shape="rect" placeholder="foto"></image-slot><div class="cap">${cap}</div></div>`).join("") },
      { id: "concurso", name: "Concurso", type: "group", x: 56, y: 1360, w: 430, z: 7, role: "C", anchor: "bottom",
        html: (d) => `<div class="sc-concurso"><h4 data-edit="concursoTitle">${d.concursoTitle}</h4><p data-edit="concursoText">${d.concursoText}</p><ul class="sc-prizelist">${d.prizes.map(p => `<li>${p.n} ${p.label}</li>`).join("")}</ul></div>` },
      { id: "entradas", name: "QR entradas", type: "group", x: 820, y: 1380, w: 200, z: 7, role: "C", anchor: "bottom",
        style: "text-align:right",
        html: (d) => `<div class="sc-ent-label">ENTRADAS EN</div><div class="sc-ent-url" data-edit="entUrl">${d.entUrl}</div><div class="fr-qr" data-qr="${d.qrUrl}"></div>` },
      { id: "tags", name: "Tags", type: "text", x: 90, y: 1530, w: 900, z: 7, role: "C", anchor: "bottom",
        html: (d) => `<div class="sc-tagrow">${d.tags.map(t => `<span>${t}</span>`).join('<s>•</s>')}</div>` },
      { id: "overlay", name: "Overlays (grain)", type: "deco", x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: "-",
        html: () => `<div class="fr-flare" style="position:absolute;inset:0"></div><div class="fr-scan" style="position:absolute;inset:0"></div><div class="fr-grain" style="position:absolute;inset:0"></div>` }
    ]
  };

  const TEMPLATES = { rec: REC, scanner: SCAN };

  /* ---- Muestras demo para "Regenerar" ---- */
  const SAMPLES = [
    { titleLine1: "ME ENCANTA", titleTu: "TU", titleKeyword: "SONRISA", concept: "PERO ME ENAMORA MÁS COMO BAILAS.", dateDay: "JUEVES", dateNum: "30", dateMonth: "ABRIL", songTitle: "SI ANTES TE HUBIERA CONOCIDO", songArtist: "KAROL G", caso: "MIRADA 7.2B", peligro: "EXTREMA" },
    { titleLine1: "ME GUSTA", titleTu: "TU", titleKeyword: "CAOS", concept: "Y CÓMO LO BAILAS TODO.", dateDay: "VIERNES", dateNum: "15", dateMonth: "MAYO", songTitle: "LUNA", songArtist: "FEID, ATL JACOB", caso: "MIRADA 3.9X", peligro: "ALTA" },
    { titleLine1: "NADIE BAILA", titleTu: "", titleKeyword: "COMO TÚ", concept: "Y LO SABES BIEN.", dateDay: "SÁBADO", dateNum: "07", dateMonth: "JUNIO", songTitle: "LA FALDA", songArtist: "MYKE TOWERS", caso: "PISTA 5.5C", peligro: "EXTREMA" }
  ];

  /* ============================================================
     FORMULARIO — campos que llenan el EVENT (como el form de la app)
     ============================================================ */
  const FORM_SECTIONS = [
    { title: "Concepto", fields: [
      { k: "titleLine1", label: "Título (línea 1)", ph: "ME ENCANTA" },
      { k: "titleTu", label: "Conector", ph: "TU", w: 90 },
      { k: "titleKeyword", label: "Palabra clave (lettering)", ph: "SONRISA" },
      { k: "concept", label: "Subtítulo / concepto", ph: "Pero me enamora más cómo bailas." }
    ]},
    { title: "Evento", fields: [
      { k: "dateDay", label: "Día", ph: "JUEVES", w: 130 },
      { k: "dateNum", label: "Nº", ph: "30", w: 70 },
      { k: "dateMonth", label: "Mes", ph: "ABRIL", w: 130 },
      { k: "time", label: "Horario", ph: "11 PM – 05 AM" }
    ]},
    { title: "Música", fields: [
      { k: "songTitle", label: "Canción", ph: "Título de la canción" },
      { k: "songArtist", label: "Artista", ph: "Artista feat. Otro" }
    ]},
    { title: "Concurso", fields: [
      { k: "concursoText", label: "Mecánica del concurso", ph: "Etiqueta a quien…" }
    ]},
    { title: "Entradas / redes", fields: [
      { k: "entUrl", label: "URL entradas", ph: "WWW.FRATE.CL", w: 190 },
      { k: "handle", label: "Handle", ph: "@fraternidad" }
    ]}
  ];

  window.FRATE = { PALETTES, FORMATS, KW_FONTS, EVENT, TEMPLATES, SAMPLES, FORM_SECTIONS, helpers: { bar } };
})();
