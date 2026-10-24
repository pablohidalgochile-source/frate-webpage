// ============================================================
// FRATE — EL ANFITRIÓN 🎧 (chatbot vinilo, burbujas en órbita)
// Diseño: handoff "Anfitrion Vinilo" (README = fuente de verdad).
// Vendedor + captador + explicador. Cerebro: edge function
// `anfitrion` (GPT-4o-mini con datos en vivo). Si la IA falla,
// cae a respuestas guionadas con las reglas REALES del portal.
// Se monta solo si config_sitio.anfitrion está visible (toggle).
// ============================================================
(function () {
  'use strict';

  const MAX_MSGS_SESION = 14;   // mensajes del usuario por sesión (anti-abuso)
  const BREAKPOINT = 640;

  // ── Respuestas de RESPALDO (reglas reales de frate.cl) ──────
  const FALLBACK = {
    comprar:  'Elige tu evento, toca sus entradas (van con nombre y RUT) y pagas seguro con MercadoPago. Tu QR llega al correo al instante 🎫',
    gratis:   'Vota tu canción en el Ranking y gana $1.000 🎵 · invita a tus amig@s y ganan $1.000 c/u · arma tu grupo y todos entran con descuento 🎁',
    devolver: 'En Mi cuenta → Mis compras pides devolución: crédito FRATE al toque para otro evento, o dinero (hasta 5 días hábiles) ↩️',
    llegar:   'Estamos en Pío Nono 430, Bellavista 📍 Toca "Llegar" en el menú y te lleva el mapa.',
    default:  'La noche tiene mil respuestas 🍇 pregúntame por entradas, devoluciones, cómo ganar gratis o cómo llegar.',
  };
  function rutear(texto) {
    const low = String(texto || '').toLowerCase();
    if (/(compr|pag|entrad|ticket|tarjeta|precio)/.test(low)) return 'comprar';
    if (/(gratis|gana|sorteo|c[oó]digo|amig|punto|ruleta|premio)/.test(low)) return 'gratis';
    if (/(devol|reembols|cancel|reactiv)/.test(low)) return 'devolver';
    if (/(lleg|ubicaci|mapa|recinto|d[oó]nde|direcci|hora)/.test(low)) return 'llegar';
    return 'default';
  }

  const _SALUDO_DEF = 'Bienvenido a la tribu 🍇 Soy BOT FRIEND, el espíritu de la noche. Cuéntame qué buscas y le ponemos música ✨';
  let _saludoActual = null;   // lo pisa el saludo configurable (config_valores.anfitrion_saludo)
  const state = { open: false, typing: false, convId: null, ultimoTs: null, estado: 'bot', polling: null, messages: [
    { from: 'bot', text: _SALUDO_DEF },
  ]};
  // Restaurar SOLO conversaciones recientes (< 90 min). Una conversación vieja que
  // quedó escalada (esperando_humano) dejaría al bot mudo para siempre; por eso, si
  // pasó mucho rato, arrancamos limpio. El ↻ también resetea a mano.
  try {
    const savedId = sessionStorage.getItem('frate_ao_conv');
    const savedAt = +(sessionStorage.getItem('frate_ao_conv_ts') || 0);
    if (savedId && savedAt && (Date.now() - savedAt) < 90 * 60 * 1000) state.convId = savedId;
    else { sessionStorage.removeItem('frate_ao_conv'); sessionStorage.removeItem('frate_ao_conv_ts'); }
  } catch (e) {}
  let raiz = null, elDisc = null, elLabel = null, elHint = null, elDock = null, elTyping = null, elInput = null;
  let esMovil = () => window.innerWidth <= BREAKPOINT;

  function contarUsuario() { return state.messages.filter(m => m.from === 'user').length; }

  // ── Estilos (tokens + keyframes del README, tal cual) ───────
  function inyectarEstilos() {
    if (document.getElementById('ao-fonts') === null) {
      const f = document.createElement('link');
      f.id = 'ao-fonts'; f.rel = 'stylesheet';
      f.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap';
      document.head.appendChild(f);
    }
    const s = document.createElement('style');
    s.textContent = `
      #ao-root { --ao-frate:#ff2d78; --ao-fluor:#3dff88; --ao-gold:#f0c84a; --ao-page:#050506;
        --ao-bg2:#111114; --ao-bg3:#18181d; --ao-border2:rgba(255,255,255,.13); --ao-text:#f0ede8;
        --ao-shadow:0 18px 40px -24px rgba(0,0,0,.70); --ao-glow:0 8px 24px rgba(255,45,120,.34);
        position:fixed; left:24px; bottom:24px; width:440px; height:560px; z-index:9000;
        font-family:'Outfit',sans-serif; color:var(--ao-text); pointer-events:none; }
      @keyframes ao-spin  { to { transform: translate(-50%,-50%) rotate(360deg); } }
      @keyframes ao-eq    { 0%,100%{transform:scaleY(.3)} 50%{transform:scaleY(1)} }
      @keyframes ao-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes ao-in    { from{opacity:0; transform:scale(.85)} to{opacity:1; transform:scale(1)} }
      #ao-root .ao-inter { pointer-events:auto; }
      #ao-disc { position:absolute; left:50%; top:56%; width:92px; height:92px; border-radius:99px;
        transform:translate(-50%,-50%); cursor:pointer; z-index:5; background:#0a0a0a; border:none; padding:0;
        box-shadow:0 30px 70px -24px #000, inset 0 0 0 1px rgba(255,255,255,.05);
        animation:ao-spin 6s linear infinite;
        transition:width .6s cubic-bezier(.5,0,.2,1), height .6s cubic-bezier(.5,0,.2,1), top .6s cubic-bezier(.5,0,.2,1); }
      #ao-root.ao-open #ao-disc { width:158px; height:158px; top:42%; animation-duration:9s; }
      #ao-disc .ao-surcos { position:absolute; inset:0; border-radius:99px;
        background:repeating-radial-gradient(circle at 50% 50%, #171717 0 1px, #0b0b0b 1px 3px); }
      #ao-disc .ao-brillo { position:absolute; inset:0; border-radius:99px;
        background:conic-gradient(from 210deg, transparent, rgba(255,255,255,.09) 26deg, transparent 62deg); }
      #ao-disc .ao-etiqueta { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width:44%; height:44%; border-radius:99px; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:radial-gradient(circle at 38% 32%, #ff8fbb, var(--ao-frate) 60%, #a01050); box-shadow:0 0 0 4px var(--ao-page); }
      #ao-disc .ao-etiqueta span { font-weight:800; font-size:13px; color:#fff; letter-spacing:.5px; }
      #ao-root.ao-open #ao-disc .ao-etiqueta span { font-size:18px; }
      #ao-disc .ao-hoyo { width:8px; height:8px; border-radius:99px; background:var(--ao-page); margin-top:3px; }
      #ao-hint { position:absolute; left:50%; top:34%; transform:translateX(-50%); display:flex; align-items:center; gap:7px;
        background:var(--ao-bg2); border:1px solid var(--ao-border2); color:var(--ao-text); border-radius:99px;
        padding:8px 14px; box-shadow:var(--ao-shadow); cursor:pointer; z-index:7; animation:ao-float 3.2s ease-in-out infinite; }
      #ao-hint b { font-weight:600; font-size:13.5px; white-space:nowrap; }
      #ao-root.ao-open #ao-hint { display:none; }
      .ao-nota { position:absolute; pointer-events:none; animation:ao-float 3s ease-in-out infinite; }
      .ao-bub { position:absolute; max-width:186px; max-height:175px; overflow-y:auto; scrollbar-width:none;
        padding:10px 14px; font-size:13px; line-height:1.4; z-index:6;
        animation:ao-in .35s ease, ao-float 4s ease-in-out infinite; display:none; }
      .ao-bub::-webkit-scrollbar { display:none; }
      #ao-root.ao-open .ao-bub { display:block; }
      .ao-bub.ao-bot  { background:var(--ao-bg2); border:1px solid var(--ao-border2); color:var(--ao-text);
        border-radius:16px 16px 16px 5px; box-shadow:var(--ao-shadow); }
      .ao-bub.ao-user { background:var(--ao-frate); color:#fff; border-radius:16px 16px 5px 16px; box-shadow:var(--ao-glow); }
      #ao-typing { position:absolute; left:50%; bottom:150px; transform:translateX(-50%); display:none;
        align-items:flex-end; gap:4px; height:18px; background:var(--ao-bg2); border:1px solid var(--ao-border2);
        border-radius:99px; padding:10px 14px; z-index:7; }
      #ao-root.ao-open.ao-escribiendo #ao-typing { display:flex; }
      #ao-typing span { width:4px; height:16px; border-radius:99px; transform-origin:bottom; animation:ao-eq .8s ease-in-out infinite; }
      #ao-typing span:nth-child(1){ background:var(--ao-frate); }
      #ao-typing span:nth-child(2){ background:var(--ao-fluor); animation-delay:.14s; }
      #ao-typing span:nth-child(3){ background:var(--ao-gold);  animation-delay:.28s; }
      #ao-dock { position:absolute; left:50%; bottom:30px; transform:translateX(-50%); width:350px; display:none; z-index:8; }
      #ao-root.ao-open #ao-dock { display:block; }
      #ao-chips { display:flex; flex-wrap:wrap; gap:7px; justify-content:center; margin-bottom:10px; }
      .ao-chip { display:flex; align-items:center; gap:5px; background:var(--ao-bg3); border:1px solid var(--ao-border2);
        border-radius:99px; padding:6px 12px; font-size:12px; font-weight:600; color:var(--ao-text); cursor:pointer; white-space:nowrap; font-family:'Outfit',sans-serif; }
      #ao-inputwrap { display:flex; align-items:center; gap:8px; background:var(--ao-bg2); border:1px solid var(--ao-border2);
        border-radius:99px; padding:7px 7px 7px 16px; box-shadow:var(--ao-shadow); }
      #ao-input { flex:1; min-width:0; background:transparent; border:none; outline:none; color:var(--ao-text);
        font-family:'Outfit',sans-serif; font-size:13.5px; }
      #ao-send { width:34px; height:34px; border-radius:99px; background:var(--ao-frate); display:flex; align-items:center;
        justify-content:center; color:#fff; font-size:14px; cursor:pointer; flex-shrink:0; border:none; }
      #ao-disc, #ao-min { touch-action:none; }   /* permite arrastrar en celular */
      /* ✕ ocultar TODO el widget (vinilo incluido) */
      #ao-cerrar { position:absolute; left:calc(50% + 38px); top:calc(56% - 52px); width:24px; height:24px;
        border-radius:99px; background:var(--ao-bg2); border:1px solid var(--ao-border2); color:rgba(240,237,232,.55);
        font-size:11px; line-height:1; cursor:pointer; z-index:9; display:flex; align-items:center; justify-content:center; }
      #ao-cerrar:hover { color:#fff; border-color:rgba(255,255,255,.3); }
      #ao-root.ao-open #ao-cerrar { left:auto; right:8px; top:2%; }
      /* Modo OCULTO: solo queda un mini-disco asomado en el borde */
      #ao-min { display:none; position:absolute; left:-16px; bottom:44px; width:36px; height:36px; border-radius:99px;
        background:repeating-radial-gradient(circle at 50% 50%, #171717 0 1px, #0b0b0b 1px 3px);
        border:1px solid rgba(255,255,255,.12); cursor:pointer; opacity:.55; animation:ao-spin 12s linear infinite;
        transition:opacity .2s; padding:0; }
      #ao-min::after { content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        width:12px; height:12px; border-radius:99px; background:radial-gradient(circle at 38% 32%, #ff8fbb, var(--ao-frate) 60%, #a01050); }
      #ao-min:hover { opacity:1; }
      #ao-root.ao-oculto > *:not(#ao-min) { display:none !important; }
      #ao-root.ao-oculto { height:120px; }
      #ao-root.ao-oculto #ao-min { display:block; }
      /* ── Estado ABIERTO = panel de chat con HILO scrolleable ── */
      #ao-panel { display:none; position:absolute; left:6px; right:6px; top:78px; bottom:14px; border-radius:24px; z-index:4;
        background:linear-gradient(180deg, rgba(20,20,24,.94), rgba(10,10,12,.97)); border:1px solid var(--ao-border2);
        box-shadow:0 24px 60px -20px rgba(0,0,0,.8); }
      #ao-root.ao-open #ao-panel { display:block; }
      #ao-root.ao-open #ao-disc { width:60px; height:60px; top:44px; animation-duration:9s; }
      #ao-root.ao-open #ao-disc .ao-etiqueta span { font-size:8px; }
      #ao-open-title { display:none; position:absolute; left:0; right:0; top:86px; text-align:center; font-size:13px; font-weight:700; color:var(--ao-text); z-index:6; }
      #ao-root.ao-open #ao-open-title { display:block; }
      #ao-reset { display:none; position:absolute; left:10px; top:2%; width:26px; height:26px; border-radius:99px; background:var(--ao-bg2); border:1px solid var(--ao-border2); color:rgba(240,237,232,.6); font-size:14px; cursor:pointer; z-index:9; align-items:center; justify-content:center; padding:0; }
      #ao-root.ao-open #ao-reset { display:flex; }
      #ao-reset:hover { color:#fff; border-color:rgba(255,255,255,.3); }
      #ao-open-title small { display:block; font-size:10.5px; font-weight:500; color:#8a8a92; margin-top:1px; }
      #ao-thread { display:none; position:absolute; left:14px; right:14px; top:118px; bottom:104px; overflow-y:auto;
        flex-direction:column; gap:8px; padding:2px 6px 6px; z-index:6;
        pointer-events:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; overscroll-behavior:contain;
        scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.22) transparent; }
      #ao-thread::-webkit-scrollbar { width:5px; }
      #ao-thread::-webkit-scrollbar-thumb { background:rgba(255,255,255,.2); border-radius:99px; }
      #ao-root.ao-open #ao-thread { display:flex; }
      #ao-root.ao-open #ao-bubs { display:none; }
      .ao-msg { max-width:84%; padding:9px 13px; font-size:13.5px; line-height:1.46; white-space:pre-wrap;
        overflow-wrap:anywhere; box-shadow:var(--ao-shadow); animation:ao-in .28s ease; }
      .ao-msg.ao-bot  { align-self:flex-start; background:var(--ao-bg2); border:1px solid var(--ao-border2); color:var(--ao-text); border-radius:15px 15px 15px 5px; }
      .ao-msg.ao-user { align-self:flex-end;  background:var(--ao-frate); color:#fff; border-radius:15px 15px 5px 15px; }
      #ao-root.ao-open #ao-typing { bottom:104px; left:22px; transform:none; }
      @media (max-width:${BREAKPOINT}px) {
        #ao-root { left:0; bottom:0; width:100vw; height:520px; }
        #ao-disc { width:82px; height:82px; }
        #ao-root.ao-open #ao-disc { width:128px; height:128px; }
        .ao-bub { max-width:56vw; max-height:150px; padding:9px 12px; font-size:12px; }
        #ao-dock { width:88%; }
        #ao-cerrar { left:calc(50% + 34px); top:calc(56% - 48px); }
        #ao-root.ao-open #ao-cerrar { left:auto; right:10px; top:1%; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── DOM ─────────────────────────────────────────────────────
  function montar() {
    raiz = document.createElement('div');
    raiz.id = 'ao-root';
    raiz.innerHTML = `
      <div id="ao-panel"></div>
      <div class="ao-nota" style="left:16%; top:22%; font-size:20px; color:var(--ao-frate); opacity:.35;">♪</div>
      <div class="ao-nota" style="right:14%; top:34%; font-size:15px; color:var(--ao-fluor); opacity:.3; animation-duration:3.6s; animation-delay:.5s;">♫</div>
      <button id="ao-disc" class="ao-inter" aria-label="Abrir el chat del Anfitrión FRATE" aria-expanded="false">
        <div class="ao-surcos"></div><div class="ao-brillo"></div>
        <div class="ao-etiqueta"><span>FRATE</span><div class="ao-hoyo"></div></div>
      </button>
      <div id="ao-hint" class="ao-inter" role="button" tabindex="0" aria-label="Abrir el chat del Anfitrión"><span style="font-size:14px;">♪</span><b>¿Dudas? Ponme play</b></div>
      <button id="ao-cerrar" class="ao-inter" aria-label="Ocultar al Anfitrión" title="Ocultar al Anfitrión">✕</button>
      <button id="ao-min" class="ao-inter" aria-label="Mostrar al Anfitrión" title="Mostrar al Anfitrión"></button>
      <div id="ao-bubs"></div>
      <div id="ao-open-title">BOT FRIEND 🍇<small>El espíritu de FRATE</small></div>
      <button id="ao-reset" class="ao-inter" title="Nueva conversación" aria-label="Nueva conversación">↻</button>
      <div id="ao-thread" role="log" aria-live="polite"></div>
      <div id="ao-typing" aria-hidden="true"><span></span><span></span><span></span></div>
      <div id="ao-dock" class="ao-inter" role="dialog" aria-label="Chat con el Anfitrión FRATE">
        <div id="ao-chips"></div>
        <div id="ao-inputwrap">
          <input id="ao-input" placeholder="Pregúntale al disco…" aria-label="Escribe tu pregunta" maxlength="300" />
          <button id="ao-send" aria-label="Enviar">➤</button>
        </div>
      </div>`;
    document.body.appendChild(raiz);
    elDisc = raiz.querySelector('#ao-disc');
    elHint = raiz.querySelector('#ao-hint');
    elInput = raiz.querySelector('#ao-input');
    elDisc.addEventListener('click', toggle);
    elHint.addEventListener('click', toggle);
    elHint.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });
    raiz.querySelector('#ao-send').addEventListener('click', enviar);
    elInput.addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) toggle(); });
    // Ocultar TODO (vinilo incluido) / volver a mostrar — con memoria
    raiz.querySelector('#ao-cerrar').addEventListener('click', e => { e.stopPropagation(); ocultarTodo(); });
    raiz.querySelector('#ao-reset').addEventListener('click', e => { e.stopPropagation(); reiniciarChat(); });
    raiz.querySelector('#ao-min').addEventListener('click', () => { if (!seArrastro) mostrarTodo(); });
    try { if (localStorage.getItem('frate_ao_oculto') === '1') raiz.classList.add('ao-oculto'); } catch (e) {}
    // Arrastrable desde el disco (abierto o cerrado) y desde el mini-disco
    hacerArrastrable(elDisc);
    hacerArrastrable(raiz.querySelector('#ao-min'));
    cargarPos();
    const CHIPS = [
      { key: 'comprar',  icon: '🎫', label: 'Comprar' },
      { key: 'gratis',   icon: '🎁', label: 'Gana gratis' },
      { key: 'devolver', icon: '↩️', label: 'Devoluciones' },
      { key: 'llegar',   icon: '📍', label: 'Cómo llegar' },
    ];
    const chipsEl = raiz.querySelector('#ao-chips');
    CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'ao-chip'; b.type = 'button';
      b.innerHTML = `<span>${c.icon}</span>${c.label}`;
      b.addEventListener('click', () => preguntar(c.label));
      chipsEl.appendChild(b);
    });
    render();
  }

  // ── Arrastrable: mueve el widget a gusto (mouse o dedo) ─────
  // Un arrastre real (>7px) mueve todo el widget y guarda la
  // posición; un toque corto sigue siendo click (abrir/mostrar).
  let seArrastro = false;
  function hacerArrastrable(handle) {
    handle.addEventListener('pointerdown', e => {
      const r = raiz.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top;
      let moviendo = false;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moviendo && Math.hypot(dx, dy) < 7) return;
        moviendo = true; seArrastro = true;
        colocar(ox + dx, oy + dy);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        if (moviendo) { guardarPos(); setTimeout(() => { seArrastro = false; }, 120); }
        else seArrastro = false;
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
  function colocar(l, t) {
    const w = raiz.offsetWidth || 440, h = raiz.offsetHeight || 560;
    l = Math.max(-w * 0.45, Math.min(l, window.innerWidth - 70));
    t = Math.max(-h * 0.55, Math.min(t, window.innerHeight - 90));
    raiz.style.left = l + 'px';
    raiz.style.top = t + 'px';
    raiz.style.bottom = 'auto';
  }
  function guardarPos() {
    try {
      const r = raiz.getBoundingClientRect();
      localStorage.setItem('frate_ao_pos', JSON.stringify({ lp: r.left / window.innerWidth, tp: r.top / window.innerHeight }));
    } catch (e) {}
  }
  function cargarPos() {
    try {
      const p = JSON.parse(localStorage.getItem('frate_ao_pos') || 'null');
      if (p && typeof p.lp === 'number' && typeof p.tp === 'number') colocar(p.lp * window.innerWidth, p.tp * window.innerHeight);
    } catch (e) {}
  }

  function ocultarTodo() {
    if (state.open) { state.open = false; raiz.classList.remove('ao-open'); elDisc.setAttribute('aria-expanded', 'false'); }
    raiz.classList.add('ao-oculto');
    try { localStorage.setItem('frate_ao_oculto', '1'); } catch (e) {}
  }
  function mostrarTodo() {
    raiz.classList.remove('ao-oculto');
    try { localStorage.removeItem('frate_ao_oculto'); } catch (e) {}
  }

  // Empezar una conversación nueva (destraba chats que quedaron con un humano/escalados)
  function reiniciarChat() {
    state.convId = null; state.estado = 'bot'; state.ultimoTs = null;
    if (state.polling) { clearInterval(state.polling); state.polling = null; }
    try { sessionStorage.removeItem('frate_ao_conv'); sessionStorage.removeItem('frate_ao_conv_ts'); } catch (e) {}
    state.messages = [{ from: 'bot', text: _saludoActual || _SALUDO_DEF }];
    const chips = raiz.querySelector('#ao-chips'); if (chips) chips.style.display = '';
    render();
    try { elInput.focus({ preventScroll: true }); } catch (e) {}
  }
  function toggle() {
    if (seArrastro) return;   // fue un arrastre, no un click
    state.open = !state.open;
    raiz.classList.toggle('ao-open', state.open);
    elDisc.setAttribute('aria-expanded', String(state.open));
    if (state.open) setTimeout(() => { try { elInput.focus({ preventScroll: true }); } catch (e) {} }, 620);
    render();
  }

  // Convierte el texto en nodos: los http(s):// quedan como <a> clicables.
  // Seguro por diseño: sólo usamos createTextNode + <a> con href http(s) (nada de innerHTML).
  function _linkify(el, texto) {
    const re = /(https?:\/\/[^\s]+)/g;
    const s = String(texto == null ? '' : texto);
    let last = 0, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)));
      let url = m[0], trail = '';
      const mt = url.match(/[),.;:!?]+$/);           // no pegar la puntuación final al link
      if (mt) { trail = mt[0]; url = url.slice(0, -trail.length); }
      const a = document.createElement('a');
      a.href = url; a.textContent = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.style.color = 'var(--ao-fluor)'; a.style.textDecoration = 'underline'; a.style.wordBreak = 'break-all';
      el.appendChild(a);
      if (trail) el.appendChild(document.createTextNode(trail));
      last = m.index + m[0].length;
    }
    if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
  }

  // Hilo de chat scrolleable: TODOS los mensajes en orden, el último abajo,
  // texto completo (nada se corta), auto-scroll al final.
  function render() {
    raiz.classList.toggle('ao-escribiendo', state.typing);
    const th = raiz.querySelector('#ao-thread');
    if (!th) return;
    th.innerHTML = '';
    state.messages.forEach(m => {
      const d = document.createElement('div');
      d.className = 'ao-msg ' + (m.from === 'bot' ? 'ao-bot' : 'ao-user');
      _linkify(d, m.text);   // texto plano + links clicables (seguro)
      th.appendChild(d);
    });
    th.scrollTop = th.scrollHeight;   // siempre ver lo último
  }

  function enviar() {
    const v = (elInput.value || '').trim();
    if (!v) return;
    elInput.value = '';
    preguntar(v);
  }

  async function preguntar(texto) {
    if (state.typing) return;
    state.open = true; raiz.classList.add('ao-open');
    // Tras la primera interacción, los chips salen de escena (queda solo el input)
    const chips = raiz.querySelector('#ao-chips');
    if (chips) chips.style.display = 'none';
    state.messages.push({ from: 'user', text: texto });
    if (contarUsuario() > MAX_MSGS_SESION) {
      state.messages.push({ from: 'bot', text: '¡Me encantó el set! 🎧 Para seguir, escríbenos por WhatsApp al +56 9 8131 1548 y te atiende el equipo.' });
      render(); return;
    }
    state.typing = true; render();
    // Fase 4: conversación persistente con handoff (con fallback al cerebro directo)
    let manejado = false;
    try {
      const { data, error } = await sb.functions.invoke('anfitrion-conversar', {
        body: { accion: 'enviar', conversacion_id: state.convId || undefined, texto: String(texto).slice(0, 400), canal: 'web' },
      });
      if (!error && data && data.conversacion_id) {
        state.convId = data.conversacion_id;
        try { sessionStorage.setItem('frate_ao_conv', state.convId); sessionStorage.setItem('frate_ao_conv_ts', String(Date.now())); } catch (e) {}
        (data.mensajes || []).forEach(m => { state.messages.push({ from: 'bot', text: m.texto }); if (m.ts) state.ultimoTs = m.ts; });
        if (data.ts) state.ultimoTs = data.ts;
        state.estado = data.estado || 'bot';
        manejado = true;
        if (state.estado !== 'bot') iniciarPolling();
      }
    } catch (e) { /* cae al respaldo */ }
    if (!manejado) {
      let respuesta = null;
      try {
        const { data, error } = await sb.functions.invoke('anfitrion', {
          body: { mensajes: state.messages.slice(-8).map(m => ({ from: m.from, text: String(m.text).slice(0, 400) })) },
        });
        if (!error && data && data.respuesta) respuesta = String(data.respuesta).slice(0, 500);
      } catch (e) { /* respaldo guionado */ }
      if (!respuesta) respuesta = FALLBACK[rutear(texto)] || FALLBACK.default;
      state.messages.push({ from: 'bot', text: respuesta });
    }
    state.typing = false;
    render();
  }

  // ── Polling: trae respuestas del humano (o del bot) cuando hay handoff ──
  function iniciarPolling() {
    if (state.polling || !state.convId) return;
    state.polling = setInterval(async () => {
      if (!state.convId) return;
      try {
        const { data } = await sb.functions.invoke('anfitrion-conversar', {
          body: { accion: 'poll', conversacion_id: state.convId, desde: state.ultimoTs || undefined },
        });
        if (data && Array.isArray(data.mensajes) && data.mensajes.length) {
          data.mensajes.forEach(m => {
            if (m.rol !== 'cliente') state.messages.push({ from: 'bot', text: (m.rol === 'humano' ? '👤 ' : '') + m.texto });
            if (m.ts) state.ultimoTs = m.ts;
          });
          state.estado = data.estado || state.estado;
          render();
        }
        if (state.estado === 'cerrado') detenerPolling();
      } catch (e) { /* reintenta al próximo tick */ }
    }, 4500);
  }
  function detenerPolling() { if (state.polling) { clearInterval(state.polling); state.polling = null; } }

  // ── Arranque: solo si el toggle 'anfitrion' está prendido ───
  async function init() {
    try {
      if (typeof sb === 'undefined') return;
      const { data } = await sb.from('config_sitio').select('visible').eq('clave', 'anfitrion').maybeSingle();
      if (!data || !data.visible) return;   // apagado → no se monta
      inyectarEstilos();
      montar();
      aplicarDisco();
    } catch (e) { /* sin bot */ }
  }
  // Logo/texto del vinilo, configurable desde el admin (config_valores).
  async function aplicarDisco() {
    try {
      if (typeof sb === 'undefined' || !raiz) return;
      const { data } = await sb.from('config_valores').select('clave,valor').in('clave', ['anfitrion_disco_texto', 'anfitrion_disco_img', 'anfitrion_saludo']);
      const m = new Map((data || []).map(x => [x.clave, x.valor]));
      const saludo = m.get('anfitrion_saludo');
      if (saludo) {
        _saludoActual = saludo;
        if (!state.convId && state.messages.length === 1 && state.messages[0].from === 'bot') { state.messages[0].text = saludo; render(); }
      }
      const et = raiz.querySelector('.ao-etiqueta'); if (!et) return;
      const img = m.get('anfitrion_disco_img'), txt = m.get('anfitrion_disco_texto');
      if (img) et.innerHTML = '<img src="' + img + '" alt="" style="width:80%;height:80%;object-fit:contain;border-radius:99px;pointer-events:none;" />';
      else if (txt) { const sp = et.querySelector('span'); if (sp) sp.textContent = txt; }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
