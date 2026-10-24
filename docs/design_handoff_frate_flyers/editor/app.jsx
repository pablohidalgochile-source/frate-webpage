/* ============================================================
   FRATE EDITOR — APP (canvas + capas + transform + historial)
   React (Babel). Persistencia = override JSON sobre el template.
   ============================================================ */
const { useState, useRef, useEffect, useCallback } = React;
const FR = window.FRATE;

const FONT_MAP = { display: "'Anton',sans-serif", hud: "'Chakra Petch',sans-serif", mono: "'Share Tech Mono',monospace" };

function paletteColors(p) { return Array.isArray(p) ? p : (FR.PALETTES[p] || FR.PALETTES.rec).colors; }

/* resuelve capas base + overrides + extras a una lista uniforme */
function resolveLayers(doc) {
  const tpl = FR.TEMPLATES[doc.templateId];
  const dyB = FR.FORMATS[doc.format][1] - 1620; // desplazamiento del pie según formato
  const base = tpl.layers.map(l => {
    const o = doc.overrides[l.id] || {};
    const baseY = l.anchor === "bottom" ? l.y + dyB : l.y;
    return {
      ...l, isExtra: false,
      x: o.x ?? l.x, y: o.y ?? baseY, w: o.w ?? l.w,
      rot: o.rot ?? 0, scale: o.scale ?? 1, opacity: o.opacity ?? 1,
      visible: o.visible ?? true, z: o.z ?? l.z,
      selectable: l.selectable !== false && !l.locked
    };
  });
  const extras = doc.extras.map(e => ({ ...e, isExtra: true, selectable: true, role: "-" }));
  return base.concat(extras);
}

function App() {
  const [screen, setScreen] = useState("form");
  const [doc, setDocState] = useState(null);
  const [selId, setSelId] = useState(null);
  const [tool, setTool] = useState("select");
  const [tab, setTab] = useState("layers");
  const [zoom, setZoom] = useState(0.42);
  const [snapping, setSnapping] = useState(true);
  const [guides, setGuides] = useState({ vx: null, hy: null });
  const [showExport, setShowExport] = useState(false);

  const docRef = useRef(doc); useEffect(() => { docRef.current = doc; }, [doc]);
  const past = useRef([]); const future = useRef([]);
  const layerEls = useRef({});
  const fileInput = useRef(null);
  const editingRef = useRef(false);

  const setDoc = (m, hist = true) => setDocState(prev => { if (hist) { past.current.push(prev); if (past.current.length > 80) past.current.shift(); future.current = []; } return typeof m === "function" ? m(prev) : m; });
  const histPush = () => { past.current.push(docRef.current); if (past.current.length > 80) past.current.shift(); future.current = []; };
  const setLive = (m) => setDocState(prev => (typeof m === "function" ? m(prev) : m));
  const undo = () => setDocState(prev => { if (!past.current.length) return prev; future.current.push(prev); return past.current.pop(); });
  const redo = () => setDocState(prev => { if (!future.current.length) return prev; past.current.push(prev); return future.current.pop(); });

  /* ---- crear desde el formulario ---- */
  function create({ templateId, format, palette, event }) {
    const tpl = FR.TEMPLATES[templateId];
    setDocState({ templateId, format, palette: palette || tpl.defaultPalette, keywordFont: "bungee", event, overrides: {}, extras: [] });
    setSelId(null); past.current = []; future.current = [];
    const [w, h] = FR.FORMATS[format];
    setZoom(Math.min((window.innerHeight - 160) / h, (window.innerWidth - 460) / w, 0.62));
    setScreen("editor");
  }

  /* ---- mutadores de capa ---- */
  const patchLayer = (id, patch, hist = true) => {
    const isExtra = docRef.current.extras.some(e => e.id === id);
    const fn = prev => isExtra
      ? { ...prev, extras: prev.extras.map(e => e.id === id ? { ...e, ...patch } : e) }
      : { ...prev, overrides: { ...prev.overrides, [id]: { ...prev.overrides[id], ...patch } } };
    hist ? setDoc(fn) : setLive(fn);
  };

  const [W, H] = doc ? FR.FORMATS[doc.format] : [1080, 1620];
  const layers = doc ? resolveLayers(doc) : [];
  const sel = layers.find(l => l.id === selId) || null;

  /* ---- QR + barra: rellenar tras render ---- */
  useEffect(() => {
    if (!doc) return;
    const root = document.getElementById("ed-canvas");
    if (!root) return;
    root.querySelectorAll("[data-bar]").forEach(el => { el.innerHTML = FR.helpers.bar(parseInt(el.dataset.bar, 10) || 99, 24); });
    root.querySelectorAll("[data-qr]").forEach(el => {
      try {
        const qr = qrcode(0, "M"); qr.addData(el.dataset.qr || "https://frate.cl"); qr.make();
        const n = qr.getModuleCount(), s = 100 / n; let r = "";
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (qr.isDark(a, b)) r += `<rect x="${(b * s).toFixed(2)}" y="${(a * s).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}"/>`;
        el.innerHTML = `<svg viewBox="0 0 100 100" shape-rendering="crispEdges"><g fill="#0a0a0a">${r}</g></svg>`;
      } catch (e) {}
    });
  }, [doc]);

  /* ---- arrastre / escala / rotación ---- */
  function startDrag(e, layer) {
    if (editingRef.current || !layer.selectable) return;
    e.preventDefault(); e.stopPropagation();
    setSelId(layer.id);
    histPush();
    const sx = e.clientX, sy = e.clientY, ox = layer.x, oy = layer.y;
    const el = layerEls.current[layer.id];
    const hh = el ? el.getBoundingClientRect().height / zoom : 60;
    function move(ev) {
      let nx = ox + (ev.clientX - sx) / zoom, ny = oy + (ev.clientY - sy) / zoom;
      let gv = null, gh = null;
      if (snapping) {
        const cx = nx + layer.w / 2, cy = ny + hh / 2, TH = 9 / zoom;
        if (Math.abs(cx - W / 2) < TH) { nx = W / 2 - layer.w / 2; gv = W / 2; }
        else if (Math.abs(nx) < TH) { nx = 0; gv = 0; }
        else if (Math.abs(nx + layer.w - W) < TH) { nx = W - layer.w; gv = W; }
        if (Math.abs(cy - H / 2) < TH) { ny = H / 2 - hh / 2; gh = H / 2; }
        else if (Math.abs(ny) < TH) { ny = 0; gh = 0; }
      }
      setGuides({ vx: gv, hy: gh });
      patchLayer(layer.id, { x: nx, y: ny }, false);
    }
    function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setGuides({ vx: null, hy: null }); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function startResize(e, layer) {
    e.preventDefault(); e.stopPropagation(); histPush();
    const el = layerEls.current[layer.id]; const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1; const s0 = layer.scale;
    function move(ev) { const d = Math.hypot(ev.clientX - cx, ev.clientY - cy); patchLayer(layer.id, { scale: Math.max(0.2, Math.min(3, s0 * d / d0)) }, false); }
    function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function startRotate(e, layer) {
    e.preventDefault(); e.stopPropagation(); histPush();
    const el = layerEls.current[layer.id]; const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx); const r0 = layer.rot;
    function move(ev) { const a = Math.atan2(ev.clientY - cy, ev.clientX - cx); let deg = r0 + (a - a0) * 180 / Math.PI; if (snapping && Math.abs(deg % 15) < 4) deg = Math.round(deg / 15) * 15; patchLayer(layer.id, { rot: deg }, false); }
    function up() { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  /* ---- edición de texto in-situ ---- */
  function onLayerDblClick(e, layer) {
    const t = e.target.closest("[data-edit],[data-edit-extra]");
    if (!t) return;
    e.stopPropagation(); editingRef.current = true;
    t.setAttribute("contenteditable", "true"); t.focus();
    const range = document.createRange(); range.selectNodeContents(t);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    function done() {
      t.removeAttribute("contenteditable"); editingRef.current = false;
      t.removeEventListener("blur", done);
      const val = t.textContent;
      if (t.dataset.editExtra) patchLayer(layer.id, { text: val });
      else setDoc(prev => ({ ...prev, event: { ...prev.event, [t.dataset.edit]: val } }));
    }
    t.addEventListener("blur", done);
  }

  /* ---- acciones toolbar ---- */
  const nextZ = () => Math.max(0, ...layers.map(l => l.z)) + 1;
  const act = {
    addText: () => { const id = "t" + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { id, name: "Texto", type: "text", x: W / 2 - 160, y: H / 2 - 40, w: 320, rot: 0, scale: 1, opacity: 1, visible: true, z: nextZ(), text: "TEXTO NUEVO", fontSize: 64, color: "#ffffff", font: "display" }] })); setSelId(id); setTab("props"); },
    addImage: () => fileInput.current && fileInput.current.click(),
    duplicate: () => { if (!sel || !sel.isExtra) return; const id = "c" + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { ...sel, id, x: sel.x + 24, y: sel.y + 24, z: nextZ(), isExtra: undefined, selectable: undefined }] })); setSelId(id); },
    remove: () => { if (!sel) return; if (sel.isExtra) { setDoc(prev => ({ ...prev, extras: prev.extras.filter(e => e.id !== sel.id) })); setSelId(null); } else patchLayer(sel.id, { visible: false }); },
    alignH: () => { if (sel) patchLayer(sel.id, { x: W / 2 - sel.w / 2 }); },
    alignV: () => { if (!sel) return; const el = layerEls.current[sel.id]; const hh = el ? el.getBoundingClientRect().height / zoom : 60; patchLayer(sel.id, { y: H / 2 - hh / 2 }); },
    undo, redo,
    zoomIn: () => setZoom(z => Math.min(1.5, z + 0.08)),
    zoomOut: () => setZoom(z => Math.max(0.12, z - 0.08)),
    zoomFit: () => setZoom(Math.min((window.innerHeight - 160) / H, (window.innerWidth - 460) / W, 0.62))
  };

  function onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const id = "i" + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { id, name: "Imagen", type: "image", x: W / 2 - 160, y: H / 2 - 160, w: 320, h: 320, rot: 0, scale: 1, opacity: 1, visible: true, z: nextZ(), src: rd.result }] })); setSelId(id); };
    rd.readAsDataURL(f); e.target.value = "";
  }

  const setTweak = (k, v) => { histPush(); setLive(prev => ({ ...prev, [k]: v })); };
  function regen() {
    const s = FR.SAMPLES[Math.floor(Math.random() * FR.SAMPLES.length)];
    const keys = Object.keys(FR.PALETTES);
    const npal = keys[Math.floor(Math.random() * keys.length)];
    setDoc(prev => ({ ...prev, palette: npal, event: { ...prev.event, ...s } }));
  }

  /* z-order arriba/abajo */
  const bump = (id, dir) => {
    const l = layers.find(x => x.id === id); if (!l) return;
    patchLayer(id, { z: l.z + dir * 2 });
  };

  if (screen === "form") return <FormScreen onCreate={create} />;

  const pal = paletteColors(doc.palette);
  const canvasStyle = { width: W, height: H, transform: `scale(${zoom})`, "--accent": pal[0], "--accent-2": pal[1], "--accent-3": pal[2], "--f-keyword": FR.KW_FONTS[doc.keywordFont] };

  return (
    <div className="ed-app">
      <div className="ed-top">
        <div className="brand">FRATE<span>·</span></div>
        <div className="tname">{FR.TEMPLATES[doc.templateId].name} · {doc.format}</div>
        <div className="grow" />
        <div className="ed-toggle-row" style={{ gap: 8 }}>
          <span className="ed-mini">Snapping</span>
          <div className={"ed-toggle" + (snapping ? " on" : "")} onClick={() => setSnapping(s => !s)} />
        </div>
        <button className="ed-btn ghost" onClick={() => setScreen("form")}>← Formulario</button>
        <button className="ed-btn primary" onClick={() => setShowExport(true)}>Exportar</button>
      </div>

      <div className="ed-body">
        <Toolbar tool={tool} setTool={setTool} act={act} />

        <div className="ed-canvas-wrap">
          <div className="ed-canvas-scroll">
            <div className="ed-canvas-pad">
              <div className="ed-canvas-sizer" style={{ width: W * zoom, height: H * zoom }}>
              <div className="ed-canvas fr-canvas" id="ed-canvas" style={canvasStyle} onPointerDown={() => { if (!editingRef.current) setSelId(null); }}>
                {layers.map(layer => {
                  if (!layer.visible) return null;
                  const st = {
                    left: layer.x, top: layer.y, width: layer.w,
                    height: layer.h || "auto",
                    transform: `rotate(${layer.rot}deg) scale(${layer.scale})`,
                    opacity: layer.opacity, zIndex: layer.z
                  };
                  if (layer.style) layer.style.split(";").forEach(rule => { const [k, v] = rule.split(":"); if (k && v) st[k.trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v.trim(); });
                  const isSel = selId === layer.id;
                  let inner;
                  if (layer.isExtra && layer.type === "text") {
                    st.color = layer.color; st.fontSize = layer.fontSize;
                    st.fontFamily = layer.font === "keyword" ? FR.KW_FONTS[doc.keywordFont] : FONT_MAP[layer.font] || FONT_MAP.display;
                    st.lineHeight = 1; st.textShadow = "0 2px 14px rgba(0,0,0,.6)";
                    inner = <div data-edit-extra="1">{layer.text}</div>;
                  } else if (layer.isExtra && layer.type === "image") {
                    inner = <img src={layer.src} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} alt="" />;
                  } else {
                    inner = <div style={{ width: "100%", height: layer.h ? "100%" : "auto" }} dangerouslySetInnerHTML={{ __html: layer.html(doc.event) }} />;
                  }
                  return (
                    <div key={layer.id} ref={el => (layerEls.current[layer.id] = el)}
                         className={"ed-layer" + (layer.selectable ? " selectable" : "") + (layer.locked ? " locked" : "")}
                         style={st}
                         onPointerDown={e => startDrag(e, layer)}
                         onDoubleClick={e => onLayerDblClick(e, layer)}>
                      {inner}
                      {isSel && (
                        <div className="ed-sel">
                          <div className="rotstem" /><div className="h rot" onPointerDown={e => startRotate(e, layer)} />
                          <div className="h br" onPointerDown={e => startResize(e, layer)} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {guides.vx != null && <div className="ed-guide v" style={{ left: guides.vx }} />}
                {guides.hy != null && <div className="ed-guide h" style={{ top: guides.hy }} />}
              </div>
              </div>
            </div>
          </div>
          <input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        </div>

        <div className="ed-right">
          <div className="ed-tabs">
            {[["layers", "Capas"], ["props", "Propiedades"], ["tweaks", "Tweaks"]].map(([k, l]) => (
              <div key={k} className={"ed-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</div>
            ))}
          </div>
          {tab === "layers" && <LayersPanel layers={layers} selectedId={selId} onSelect={setSelId}
            onToggleVis={id => { const l = layers.find(x => x.id === id); patchLayer(id, { visible: !l.visible }); }}
            onUp={id => bump(id, 1)} onDown={id => bump(id, -1)}
            onDelete={id => { setDoc(prev => ({ ...prev, extras: prev.extras.filter(e => e.id !== id) })); if (selId === id) setSelId(null); }} />}
          {tab === "props" && <PropsPanel sel={sel} onChange={patch => patchLayer(selId, patch)} />}
          {tab === "tweaks" && <TweaksPanel doc={doc} onSet={setTweak} onRegen={regen} />}
        </div>
      </div>

      {showExport && <ExportModal doc={doc} onClose={() => setShowExport(false)} />}
    </div>
  );
}

/* ---------- Modal de exportación ---------- */
function ExportModal({ doc, onClose }) {
  const payload = { templateId: doc.templateId, format: doc.format, palette: doc.palette, keywordFont: doc.keywordFont, event: doc.event, layout_overrides: doc.overrides, extras: doc.extras };
  const json = JSON.stringify(payload, null, 2);
  const download = () => { const a = document.createElement("a"); a.href = "data:application/json;charset=utf-8," + encodeURIComponent(json); a.download = "frate-flyer.json"; a.click(); };
  return (
    <div className="ed-modal-bg" onClick={onClose}>
      <div className="ed-modal" onClick={e => e.stopPropagation()}>
        <h3>Exportar diseño</h3>
        <p>Este JSON es lo que tu app guarda/envía al render (template + datos + overrides de layout). Regenera idéntico y conserva tus ediciones.</p>
        <textarea readOnly value={json} />
        <div className="ed-modal-actions">
          <button className="ed-btn" onClick={() => window.print()}>Imprimir / PDF</button>
          <button className="ed-btn" onClick={download}>Descargar JSON</button>
          <button className="ed-btn primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
