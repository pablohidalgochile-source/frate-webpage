/* ============================================================
   FRATE EDITOR — PANELES (form + sidebar).  React (Babel).
   ============================================================ */
const { useState: useStateP } = React;

/* ---------- Pantalla de formulario ---------- */
function FormScreen({ onCreate }) {
  const F = window.FRATE;
  const [templateId, setTpl] = useStateP("rec");
  const [format, setFormat] = useStateP("poster");
  const [palette, setPalette] = useStateP("rec");
  const [vals, setVals] = useStateP(() => {
    const v = {};
    F.FORM_SECTIONS.forEach(s => s.fields.forEach(f => { v[f.k] = F.EVENT[f.k] || ""; }));
    return v;
  });
  const set = (k, val) => setVals(o => ({ ...o, [k]: val }));

  function create() {
    const event = { ...F.EVENT };
    Object.keys(vals).forEach(k => { if (vals[k] !== "") event[k] = vals[k]; });
    onCreate({ templateId, format, palette, event });
  }

  return (
    <div className="ed-form-screen">
      <div className="ed-form">
        <h1>FRATE <span>·</span> Generar flyer</h1>
        <div className="sub">Llena el formulario → se autorellena la plantilla → abre el editor para retocar todo.</div>

        <div className="ed-card">
          <h3>Plantilla</h3>
          <div className="ed-tpl-pick">
            {Object.values(F.TEMPLATES).map(t => (
              <div key={t.id} className={"ed-tpl" + (templateId === t.id ? " sel" : "")}
                   onClick={() => { setTpl(t.id); setPalette(t.defaultPalette); }}>
                <b>{t.name.split("·")[0]}</b>
                <small>{t.name.split("·")[1] || ""}</small>
              </div>
            ))}
          </div>
          <div className="ed-grid" style={{ marginTop: 16 }}>
            <div className="ed-fg">
              <div className="ed-field"><label>Formato</label>
                <select className="ed-select" value={format} onChange={e => setFormat(e.target.value)}>
                  <option value="story">Historia 9:16</option>
                  <option value="carousel">Carrusel 4:5</option>
                  <option value="poster">Afiche 2:3</option>
                </select>
              </div>
            </div>
            <div className="ed-fg">
              <label className="ed-mini" style={{ display: "block", marginBottom: 6 }}>Paleta (3 colores)</label>
              <div className="ed-pals">
                {Object.entries(F.PALETTES).map(([k, p]) => (
                  <div key={k} className={"ed-pal" + (palette === k ? " sel" : "")} title={p.name} onClick={() => setPalette(k)}>
                    {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {F.FORM_SECTIONS.map(sec => (
          <div className="ed-card" key={sec.title}>
            <h3>{sec.title}</h3>
            <div className="ed-grid">
              {sec.fields.map(f => (
                <div className="ed-fg" key={f.k} style={f.w ? { flex: `0 0 ${f.w}px` } : null}>
                  <div className="ed-field">
                    <label>{f.label}</label>
                    <input className="ed-input" value={vals[f.k]} placeholder={f.ph}
                           onChange={e => set(f.k, e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="ed-form-actions">
          <div className="ed-mini" style={{ flex: 1, alignSelf: "center" }}>Elige plantilla y llena los textos, luego pulsa este botón →</div>
          <button className="ed-btn primary" style={{ fontSize: 15, padding: "12px 22px" }} onClick={create}>Generar y editar →</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Toolbar (herramientas) ---------- */
function Toolbar({ tool, setTool, act }) {
  const T = (id, icon, title, on) => (
    <button className={"ed-tool" + (tool === id ? " active" : "")} title={title}
            onClick={() => (on ? on() : setTool(id))}>{icon}</button>
  );
  return (
    <div className="ed-tools">
      {T("select", "▹", "Seleccionar / mover (V)")}
      {T("text", "T", "Agregar texto", act.addText)}
      {T("image", "🖼", "Agregar imagen", act.addImage)}
      <div className="ed-tool-sep" />
      {T("dup", "⧉", "Duplicar", act.duplicate)}
      {T("del", "🗑", "Borrar", act.remove)}
      <div className="ed-tool-sep" />
      {T("alignH", "⊟", "Centrar horizontal", act.alignH)}
      {T("alignV", "⊞", "Centrar vertical", act.alignV)}
      <div className="ed-tool-sep" />
      {T("undo", "↺", "Deshacer", act.undo)}
      {T("redo", "↻", "Rehacer", act.redo)}
      <div className="ed-tool-sep" />
      {T("zin", "＋", "Acercar", act.zoomIn)}
      {T("zout", "－", "Alejar", act.zoomOut)}
      {T("zfit", "⤢", "Ajustar", act.zoomFit)}
    </div>
  );
}

/* ---------- Panel de Capas ---------- */
function LayersPanel({ layers, selectedId, onSelect, onToggleVis, onUp, onDown, onDelete }) {
  const ordered = [...layers].sort((a, b) => b.z - a.z);
  return (
    <div className="ed-panel">
      <div className="ed-sec">Capas ({layers.length})</div>
      {ordered.map(l => (
        <div key={l.id} className={"ed-lyr" + (selectedId === l.id ? " sel" : "")} onClick={() => onSelect(l.id)}>
          <span className="ic" onClick={e => { e.stopPropagation(); onToggleVis(l.id); }}>{l.visible ? "👁" : "◌"}</span>
          <span className="nm">{l.name}</span>
          {l.role && l.role !== "-" ? <span className="badge">{l.role}</span> : null}
          <span className="ic" onClick={e => { e.stopPropagation(); onUp(l.id); }}>▲</span>
          <span className="ic" onClick={e => { e.stopPropagation(); onDown(l.id); }}>▼</span>
          {l.isExtra ? <span className="ic" onClick={e => { e.stopPropagation(); onDelete(l.id); }}>✕</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- Panel de Propiedades ---------- */
function PropsPanel({ sel, onChange }) {
  if (!sel) return <div className="ed-panel"><div className="ed-mini">Selecciona una capa para editar sus propiedades.</div></div>;
  const num = (label, key, min, max, step, unit) => (
    <div className="ed-field">
      <label>{label}: {Math.round((sel[key] ?? 0) * (step < 1 ? 100 : 1))}{unit || ""}</label>
      <input className="ed-range" type="range" min={min} max={max} step={step}
             value={sel[key] ?? 0} onChange={e => onChange({ [key]: parseFloat(e.target.value) })} />
    </div>
  );
  return (
    <div className="ed-panel">
      <div className="ed-sec">{sel.name}</div>
      <div className="ed-row2">
        <div className="ed-field"><label>X</label>
          <input className="ed-input" type="number" value={Math.round(sel.x)} onChange={e => onChange({ x: parseFloat(e.target.value) || 0 })} /></div>
        <div className="ed-field"><label>Y</label>
          <input className="ed-input" type="number" value={Math.round(sel.y)} onChange={e => onChange({ y: parseFloat(e.target.value) || 0 })} /></div>
      </div>
      {num("Rotación", "rot", -180, 180, 1, "°")}
      {num("Escala", "scale", 0.2, 3, 0.01)}
      {num("Opacidad", "opacity", 0, 1, 0.01)}
      {sel.type === "text" ? (
        <div>
          <div className="ed-sec">Texto</div>
          <div className="ed-field"><label>Contenido</label>
            <input className="ed-input" value={sel.text || ""} onChange={e => onChange({ text: e.target.value })} /></div>
          {num("Tamaño", "fontSize", 12, 260, 1, "px")}
          <div className="ed-field"><label>Fuente</label>
            <select className="ed-select" value={sel.font || "display"} onChange={e => onChange({ font: e.target.value })}>
              <option value="display">Display (Anton)</option>
              <option value="hud">HUD (Chakra)</option>
              <option value="mono">Mono</option>
              <option value="keyword">Lettering</option>
            </select></div>
          <div className="ed-field"><label>Color</label>
            <input type="color" style={{ width: "100%", height: 34, background: "#0d0d11", border: "1px solid #2a2a33", borderRadius: 7 }}
                   value={sel.color || "#ffffff"} onChange={e => onChange({ color: e.target.value })} /></div>
        </div>
      ) : (
        <div className="ed-mini" style={{ marginTop: 8 }}>
          Los textos internos se editan con doble clic sobre el flyer. El color de esta capa lo define su rol
          <b style={{ color: "#fff" }}> {sel.role}</b> en la paleta (pestaña Tweaks).
        </div>
      )}
    </div>
  );
}

/* ---------- Panel de Tweaks ---------- */
function TweaksPanel({ doc, onSet, onRegen }) {
  const F = window.FRATE;
  const custom = Array.isArray(doc.palette) ? doc.palette : (F.PALETTES[doc.palette] || F.PALETTES.rec).colors;
  const setCustom = (i, v) => { const c = [...custom]; c[i] = v; onSet("palette", c); };
  return (
    <div className="ed-panel">
      <div className="ed-sec">Paleta (3 colores)</div>
      <div className="ed-pals">
        {Object.entries(F.PALETTES).map(([k, p]) => (
          <div key={k} className={"ed-pal" + (doc.palette === k ? " sel" : "")} title={p.name} onClick={() => onSet("palette", k)}>
            {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
          </div>
        ))}
      </div>
      <div className="ed-colors">
        {custom.map((c, i) => <input key={i} type="color" value={c} onChange={e => setCustom(i, e.target.value)} title={["Dominante (A)", "Secundario (B)", "Detalle (C)"][i]} />)}
      </div>
      <div className="ed-mini" style={{ marginTop: 6 }}>A = título · B = HUD/archivo · C = concurso/fecha/tags</div>

      <div className="ed-sec">Formato</div>
      <div className="ed-seg">
        {[["story", "9:16"], ["carousel", "4:5"], ["poster", "2:3"]].map(([k, l]) => (
          <button key={k} className={doc.format === k ? "sel" : ""} onClick={() => onSet("format", k)}>{l}</button>
        ))}
      </div>

      <div className="ed-sec">Fuente palabra clave</div>
      <div className="ed-seg">
        {[["bungee", "Urbano"], ["marker", "Marcador"], ["spray", "Spray"]].map(([k, l]) => (
          <button key={k} className={doc.keywordFont === k ? "sel" : ""} onClick={() => onSet("keywordFont", k)}>{l}</button>
        ))}
      </div>

      <div className="ed-sec">Regeneración</div>
      <button className="ed-btn" style={{ width: "100%" }} onClick={onRegen}>⟳ Regenerar (demo)</button>
      <div className="ed-mini" style={{ marginTop: 8 }}>Cambia textos + paleta de ejemplo, como haría la app con una nueva generación.</div>
    </div>
  );
}

Object.assign(window, { FormScreen, Toolbar, LayersPanel, PropsPanel, TweaksPanel });
