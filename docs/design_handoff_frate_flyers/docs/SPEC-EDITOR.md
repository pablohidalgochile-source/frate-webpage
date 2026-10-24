# SPEC — Editor de flyers FRATE (para Claude Code)

App: **React 18 + Vite 5, JS puro, estilos inline.** Este documento describe cómo
replicar el prototipo de `editor/` en tu app. El prototipo es la referencia 1:1.

## Flujo
```
Formulario  →  autorelleno (form_data → EVENT)  →  Editor tipo Photoshop  →  Exportar
                                                     (capas + Tweaks + overrides)
```

## 1. Modelo de datos (el corazón)

Un diseño = **template + EVENT + tema + overrides**. Es lo que se guarda y regenera:

```jsonc
{
  "templateId": "rec",            // rec | scanner
  "format": "poster",             // story 1080×1920 | carousel 1080×1350 | poster 1080×1620
  "palette": "rec",               // preset | ["#A","#B","#C"] (3 hex libres)
  "keywordFont": "bungee",        // bungee | marker | spray
  "event": { /* todos los textos: título, fecha, canción, concurso, tags… */ },
  "layout_overrides": {           // ← ediciones manuales por capa (sobre el template)
    "title": { "x": 80, "y": 900, "rot": -2, "scale": 1.1, "opacity": 1, "visible": true, "z": 7 }
  },
  "extras": [ /* capas añadidas por el usuario: texto/imagen libres */ ]
}
```

- **EVENT** viene de `form_data` (Supabase). Ver `MAPEO-DATOS.md` para el mapeo campo↔slot.
- **layout_overrides** = solo lo que el usuario movió/cambió. Regenerar = render del template
  con nuevo EVENT + re-aplicar overrides. Así se **regenera infinito** y se conservan retoques.
- Nada de coordenadas hardcodeadas en el render final: el template define posiciones base,
  el override las ajusta.

## 2. Modelo de capas (`editor/data.js`)

Cada template = `{ id, name, css:[…], format, defaultPalette, layers:[…] }`.
Cada capa:
```js
{ id, name,
  type: "group"|"text"|"image"|"deco",
  x, y, w, h?,          // posición/tamaño base (lienzo 1080×1620)
  z,                    // orden
  role: "A"|"B"|"C"|"-",// zona de color (A=título, B=hud/archivo, C=concurso/fecha/tags)
  locked?, selectable?,
  style?,               // estilos inline extra del contenedor de capa
  html(EVENT) => string // markup (reusa clases de styles.css / scanner.css)
}
```
Los textos editables llevan `data-edit="campoDelEvent"`. El editor los vuelve
`contenteditable` al doble-clic y sincroniza a `EVENT`.

## 3. Editor (`editor/app.jsx` + `panels.jsx` + `editor.css`)

**Lienzo**: `.fr-canvas` a tamaño real (`FORMATS[format]`), escalado con
`transform: scale(zoom)` desde `top-left`, envuelto en un *sizer* de `W*zoom × H*zoom`
para que el scroll/centrado funcionen. Vars CSS `--accent/-2/-3` y `--f-keyword` en el lienzo.

**Cada capa** = `<div.ed-layer>` posicionado `left/top/width` + `transform: rotate() scale()` +
`opacity` + `zIndex`. Contenido vía `dangerouslySetInnerHTML` (base) o React (extras).
> Truco clave: como el `__html` de una capa solo depende de SUS campos, React no toca el
> DOM si el string no cambia → los `<image-slot>` con foto soltada **no se pierden** al editar
> otras capas o mover.

**Interacciones** (pointer events, sin librerías):
- Mover: `pointerdown` en la capa → delta/zoom → `x,y`. Snapping a centro/bordes del lienzo (toggle).
- Escalar: manija inferior-derecha → `scale` = s0 · (distActual/distInicial) al centro.
- Rotar: manija superior → ángulo centro→puntero; snap a 15° si snapping on.
- Texto: doble-clic → `contenteditable` → `blur` escribe en `EVENT[campo]`.
- Añadir texto/imagen → `extras[]`. Duplicar/borrar/alinear/ocultar.

**Historial**: pila `past/future` de snapshots del `doc`. `pointerdown` hace `histPush()`
antes de arrastrar; cambios discretos empujan al mutar. Undo/redo restauran snapshots.

**Paneles** (`panels.jsx`): **Capas** (lista, ojo, orden ▲▼, badge de rol), **Propiedades**
(X/Y/rot/escala/opacidad; texto: contenido/tamaño/fuente/color), **Tweaks** (paleta 3 colores
preset o 3 hex libres, formato, fuente keyword, Regenerar demo).

## 4. Color en 3 zonas
`--accent`(A) `--accent-2`(B) `--accent-3`(C) en `:root`/lienzo. El CSS (`styles.css`,
`scanner.css`) ya asigna cada zona a su variable con su glow. La IA manda preset o
`["#A","#B","#C"]`. Fondo casi neutro (no se tiñe todo).

## 5. Integración en tu app
- **Formulario**: `FORM_SECTIONS` en `data.js` define los campos; en producción reemplázalo
  por tu form real y construye `EVENT` desde `form_data`.
- **Persistencia**: guarda el JSON de §1 (columna `design_json` en Supabase). Reabrir = cargar
  ese JSON en el editor.
- **Render final / export**: para PNG/PDF a 1080+ usa **Puppeteer** (Chromium real) sobre el
  template con EVENT+overrides aplicados — conserva blend/glow/grain (Satori no).
- **Estado**: el prototipo usa `useState` + refs para historial; en tu app puedes usar
  Zustand/Context, pero el `doc` de §1 es la única fuente de verdad.

## Archivos del prototipo
- `editor/index.html` — entrada (React + Babel + qrcode + image-slot + data/panels/app).
- `editor/data.js` — paletas, formatos, EVENT demo, **templates + capas**, samples, form.
- `editor/panels.jsx` — formulario y paneles laterales.
- `editor/app.jsx` — lienzo, transform, historial, export.
- `editor/editor.css` — chrome del editor (no del flyer).
- Flyers base: `../styles.css`, `../scanner.css` (el look real, reutilizado por las capas).
