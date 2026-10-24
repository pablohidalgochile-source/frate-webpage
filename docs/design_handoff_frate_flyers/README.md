# Handoff → Claude Code: Flyers FRATE (Fraternidad Campus Central)

> **Léeme entero antes de tocar código.** Este documento es autosuficiente: un dev
> que no estuvo en la conversación debe poder implementar todo solo con esto + los
> archivos del paquete.

---

## 0. Qué es esto en una frase

6 **plantillas de flyer** (HTML/CSS/JS puro) para una discoteca universitaria, que se
**auto-rellenan** con los datos de cada evento y son **editables**. Todas parten del mismo
sistema de datos inyectables (`EVENT` + `TWEAKS`) para poder **regenerarse infinito**.

## ⚠️ Naturaleza de estos archivos (importante)

Los `.html/.css/.js` de este paquete son **referencias de diseño** — prototipos que
muestran el look y el comportamiento buscados, **no son el código de producción final
a copiar tal cual**. La tarea es **recrear estos diseños dentro del entorno del proyecto
destino** (React 18 + Vite 5 según el equipo FRATE), usando sus patrones y librerías.
Si no existe entorno aún, elige el framework adecuado e impleméntalos ahí.

Dicho eso: los flyers HTML **sí funcionan** abriéndolos en el navegador y son la vara 1:1
de fidelidad. Úsalos como fuente de verdad visual y de estructura de datos.

## Fidelidad: **ALTA (hi-fi)**

Colores, tipografías, espaciados y comportamientos son finales. Recréalos pixel-perfect
con las librerías del codebase. Las únicas zonas "vacías" en los pantallazos son los
**slots de imagen** (rostro, polaroids, foto de portada, logo FRATE) — se llenan con la
foto del evento; no son un bug.

---

## 1. Contexto del negocio (marca)

- **FRATE / Fraternidad Campus Central** — fiesta universitaria en Santiago de Chile.
- Público 18-25. Tono: **picardía con clase, chileno auténtico, sin vulgaridad**.
- Producen flyers **cada jueves, viernes y sábado** → necesitan generarlos rápido y lindos.
- Concepto creativo central: **"La frase tiene rostro"** — cada fiesta nace de una frase
  emocional (ej. *"Me encanta tu sonrisa"*) que parece dedicada a alguien real.
- **Idioma:** español de Chile (tú/tienes/quieres/aquí — **NUNCA** vos/tenés/acá).
- **Sitio real:** `www.frate.cl` (`.cl`, no `.club`). El QR apunta ahí.

---

## 2. Design tokens (sistema base — `styles.css`)

### Paleta — **3 colores por zona** (el corazón del sistema de color)

El flyer NO se tiñe entero de un color. Se reparten **3 acentos** por zonas, cada uno con
su glow:

| Variable | Zona (rol) | Uso |
|---|---|---|
| `--accent`   (A) | Título | palabra clave, barra de análisis |
| `--accent-2` (B) | HUD / archivo / chat / crosshair | tarjetas, scanner |
| `--accent-3` (C) | Concurso / fecha / tags / canción / QR | banda inferior |

`TWEAKS.palette` es un **preset** o un **array de 3 hex libres** que manda la IA:
`["#A","#B","#C"]`.

Presets disponibles:
- `rec` → `["#ff2d78","#00e5ff","#b14bff"]` (rosa · cyan · morado) — default REC
- `violeta` → `["#b14bff","#00e5ff","#ff2d78"]` — default Scanner
- `cyan` → `["#00e5ff","#ff2d78","#b14bff"]`
- `coral` → `["#ff6a3d","#ffd23d","#ff2d78"]`
- `verde` → `["#39ff7d","#00e5ff","#f5ff3d"]`

Colores de marca crudos: rosa `#ff2d78`, cyan `#00e5ff`, morado `#9b30ff`/`#b14bff`,
verde `#39ff7d`, naranja `#ff7a1e`, amarillo `#f5ff3d`, dorado, negro. Fondo casi neutro.

### Tipografías

- **Base / HUD:** `Anton` (títulos display), `Chakra Petch` + `Share Tech Mono` + `Saira`
  (labels/mono), cargadas por `@import` en cada CSS.
- **Palabra clave (`--f-keyword`)** — 3 opciones por `TWEAKS.keywordFont`:
  - `bungee` → `'Bungee'` (urbano)
  - `marker` → `'Permanent Marker'` (marcador)
  - `spray`  → `'Rubik Spray Paint'` (spray)
- Cada plantilla editorial trae sus propias fuentes (Playfair, Bodoni Moda, Oswald,
  Luckiest Guy, etc.) vía `@import` en su CSS.

> **Lettering real por campaña:** el título "chorreado/graffiti" pro de FRATE es arte
> hecho a mano (PNG/SVG), no una fuente. Si `form_data` trae `letteringUrl`, reemplaza el
> texto de `titleKeyword` por esa imagen.

### Formatos Instagram (todos verticales, 1080px de ancho)

| clave | px | ratio | uso |
|---|---|---|---|
| `story`    | 1080 × 1920 | 9:16 | historia |
| `carousel` | 1080 × 1350 | 4:5  | carrusel / feed |
| `poster`   | 1080 × 1620 | 2:3  | afiche |

### Escalado (clave para portarlo)

Cada flyer = un `#canvas` a tamaño real (px del formato) dentro de un `*-stage`. Se escala
con `transform: scale(window.innerWidth / W)` y el stage toma la altura exacta `H*s` →
**se ajusta al ancho sin recortar**. En React: mismo patrón, `scale(zoom)` desde
`top-left` envuelto en un sizer de `W*zoom × H*zoom`.

### Otros

- QR generado en local (offline) con `qrcode-generator`; módulos oscuros sobre panel claro
  = escaneable. Apunta a `https://www.frate.cl`.
- `<image-slot>` (ver `image-slot.js`) = placeholder drag-and-drop donde el usuario suelta
  la foto; persiste. Es donde entran rostro/polaroids/portada/logo.
- Overlays de textura: grain, scanlines, glows compuestos, `mix-blend-mode`,
  `backdrop-filter`, `mask`. → **Para exportar a PNG usa Puppeteer/Chromium, NO Satori**
  (Satori no soporta esos efectos).

---

## 3. Las 6 plantillas (con pantallazo)

> Los pantallazos están en `screenshots/`. Los slots de imagen aparecen vacíos a propósito.

### 1 · REC / Diagnóstico forense — `Flyer REC Diagnostico.html` (`styles.css`)
`screenshots/01-rec-diagnostico.png`

Rostro full-bleed de fondo. Barra superior estilo cámara (`● REC`, `180FPS`, batería,
timecode, zona) + logo Fraternidad al centro. Columna izquierda de **tarjetas HUD**
(SU MIRADA + heartbeat, NIVEL DE IMPACTO 99.7%, PELIGROSIDAD EXTREMA, UBICACIÓN, HORA).
Columna derecha de **burbujas de chat** con timestamps y checks (✓✓). Título grande
(`DIAGNÓSTICO:` + líneas blancas Anton + palabra clave gigante en fuente keyword + `♡`),
frase-concepto con `<em>` en acento, barra `ANÁLISIS COMPLETO 99%`. Footer: fecha con
número GIGANTE, logo FRATE, tags, banda concurso + canción (3 estilos: player/espectro/
editorial) + redes + QR. Marco de esquinas + scan + grain.
Tweaks: paleta, formato, estilo de título (aligned/center/block), estilo canción, fuente
keyword, mostrar chat, mostrar HUD, Regenerar (demo).

### 2 · Scanner / Archivo encontrado — `Flyer Scanner Archivo.html` (`styles.css` + `scanner.css`)
`screenshots/02-scanner-archivo.png`

Badge grande de fecha arriba-izq, logo al centro. HUD `ARCHIVO ENCONTRADO`
(caso/ubicación/hora/nivel de impacto/peligrosidad) arriba-der. Crosshair de scanner al
centro con `OBJETIVO IDENTIFICADO`. Player de canción. Título (líneas + keyword). Fila de
**4 polaroids** de la fiesta (slots de imagen `#scan-pola-1..4`). Banda inferior: concurso
con lista de premios, logo FRATE, entradas + QR, `ACCESO +18 · DRESS CODE`, pill de tags.
Tweaks: paleta, formato, keywordFont, mostrar chat, mostrar polaroids.

### 3 · Scanner v2 (calca de referencia) — `Flyer Scanner v2.html` (`styles.css` + `scanner2.css`)
`screenshots/03-scanner-v2.png`

Variante del Scanner que **calca una referencia pro**: marcos HUD con esquinas dibujadas,
sello, **código de barras**, lettering pintado, logo circular "FRATERNIDAD CAMPUS CENTRAL"
girado, tipografía FRATE con la E en acento. Mismo sistema de datos.

### 4 · The Frate Times (portada de diario) — `Flyer FRATE Times.html` (`frate-times.css`)
`screenshots/04-frate-times.png`

Propuesta propia estilo **periódico**. Masthead "The Frate Times" (UnifrakturCook/Playfair),
`VOL · Nº · EDICIÓN NOCTURNA`, barra ÚLTIMA HORA, titular enorme, bajada en cursiva, cuerpo
a columnas, **foto de portada** (slot) con sello EDICIÓN LIMITADA, recuadro
CLASIFICADOS · CONCURSO, secciones (SOCIEDAD/OPINIÓN/CARTELERA), footer con barcode. Papel
crema. Fuente/paleta editorial (no neón).

### 5 · PROHIBIDA — Revista universitaria — `Flyer Revista.html` (`revista.css`)
`screenshots/05-revista-prohibida.png`

Portada **editorial premium** tipo Vogue/i-D. Masthead "PROHIBIDA" (Bodoni Moda), coverlines
a ambos lados (PORTADA/TENDENCIA/PLAYLIST · CONFIDENCIAL/AGENDA), foto full-bleed (slot),
titular "ME ENCANTA TU SONRISA" con "TU" en dorado cursiva, sello circular
"PROHIBIDA SU VENTA", barcode. Fondo negro, dorado + rosa de acento.

### 6 · Álbum de figuritas — `Flyer Album.html` (`album.css`)
`screenshots/06-album-figuritas.png`

Concepto **álbum de láminas/figuritas** ("Colección Noche 2026 · LA PISTA"). Grilla de
cromos con hueco troquelado (PEGA AQUÍ: LA SONRISA / EL PERREO / EL AFTER / LA MIRADA /
EL CRUSH) + **cromo especial holográfico** (slot, edición limitada). Banda inferior oscura
con título, fecha, premios (botella al completar, etiqueta). Barra de progreso "TU
COLECCIÓN". Papel crema, Luckiest Guy + Baloo. Lúdico, coleccionable.

---

## 4. Contrato de datos — inyección (`EVENT` + `TWEAKS`)

Cada flyer se **crea desde los datos de la generación**. Antes de renderizar:

```js
window.FRATE_EVENT  = { titleLine1, titleTu, titleKeyword, concept, dateDay, dateNum,
                        dateMonth, time, chat[], songTitle, songArtist, concursoText,
                        prizes[], tags[], ... };   // todos los textos
window.FRATE_TWEAKS = { palette, format, keywordFont, titleStyle, songStyle,
                        showChat, showHud, ... };  // preset visual
```

o `?data=<base64(JSON)>` en la URL con `{ "event": {...}, "tweaks": {...} }`.
Si no hay nada, usa el demo. `loadInjected()` mezcla lo inyectado sobre los defaults →
**textos + paleta + formato + fuente = parámetros → regenera infinito.**

Origen de los datos: columna `form_data` (JSON) de la tabla `flyer_express_packages` en
Supabase (misma instancia/login que la app "Express" que ya genera la copy). **El mapeo
completo campo↔slot está en `docs/MAPEO-DATOS.md`** — respétalo. No re-implementes la
captura: ya existe.

Tipos de slot: **DINÁMICO** (del evento), **DERIVADO** (calculado, ej. fecha parseada),
**CHROME** (fijo de plantilla/marca).

---

## 5. El editor tipo Photoshop (prototipo en `editor/`)

Prototipo React+Babel (referencia 1:1). Flujo:
`Formulario → autorelleno (form_data→EVENT) → Editor de capas → Export`.

**Pantallazos del editor** (en `screenshots/`, la vara 1:1 de la UI):
- `editor-1-formulario.png` — paso 1: elige plantilla + formato + paleta + llena los
  textos del evento. Botón **Generar y editar**.
- `editor-2-capas.png` — el editor tipo Photoshop: canvas central con el flyer +
  toolbar vertical izquierda (mover/texto/imagen/duplicar/borrar/alinear/grid/
  undo-redo/zoom) + panel derecho con pestañas **CAPAS / PROPIEDADES / TWEAKS**.
  La pestaña Capas lista las 15 capas, cada una con su **badge de rol de color A/B/C**,
  ojo de visibilidad y flechas de orden (z-index). Header: Snapping, ← Formulario, Exportar.
- `editor-3-propiedades.png` — pestaña Propiedades de la capa seleccionada: **X, Y,
  Rotación, Escala, Opacidad**. Los textos internos se editan con doble clic sobre el
  flyer; el color de la capa lo define su rol en la paleta.
- `editor-4-tweaks.png` — pestaña Tweaks: **paleta (3 colores)** con presets + 3 swatches
  editables (A=título · B=HUD/archivo · C=concurso/fecha/tags), **formato** (9:16/4:5/2:3),
  **fuente palabra clave** (Urbano/Marcador/Spray) y **Regenerar (demo)**.

Un diseño guardado =
```jsonc
{ "templateId":"rec", "format":"poster", "palette":"rec"|["#A","#B","#C"],
  "keywordFont":"bungee", "event":{…textos…},
  "layout_overrides": { "title": {"x","y","rot","scale","opacity","visible","z"} },
  "extras": [ /* capas libres añadidas por el usuario */ ] }
```
`layout_overrides` = solo lo que el usuario movió. Regenerar = render del template con
nuevo `EVENT` + re-aplicar overrides → conserva retoques. **Especificación completa del
editor (modelo de capas, interacciones, historial, paneles) en `docs/SPEC-EDITOR.md`.**

Archivos: `editor/index.html`, `editor/data.js` (paletas, formatos, templates+capas, form),
`editor/panels.jsx`, `editor/app.jsx`, `editor/editor.css`.

---

## 6. Motor de render / export

- **En pantalla:** el HTML tal cual (auto-escala al ancho).
- **Export a PNG/PDF 1080+:** **Puppeteer/Chromium** sobre la plantilla con `EVENT`+overrides
  aplicados. Conserva blend/glow/grain/mask. **Satori NO sirve** (no soporta esos efectos).
- QR se genera local. Fotos entran por `<image-slot>`; logos en sus slots.

---

## 7. Archivos del paquete

```
README.md                        ← este archivo
Flyer REC Diagnostico.html       + styles.css
Flyer Scanner Archivo.html       + styles.css + scanner.css
Flyer Scanner v2.html            + styles.css + scanner2.css
Flyer FRATE Times.html           + frate-times.css
Flyer Revista.html               + revista.css
Flyer Album.html                 + album.css
image-slot.js                    ← web component slot de imagen (drag&drop)
assets/logo-fraternidad.png      ← logo oficial (chrome)
editor/                          ← prototipo del editor de capas (React+Babel)
docs/
  HANDOFF-DESIGN.md              ← contexto de negocio + decisiones de diseño
  MAPEO-DATOS.md                 ← mapeo completo slot ↔ campo Supabase (LEER)
  SPEC-EDITOR.md                 ← spec del editor para reimplementarlo (LEER)
screenshots/
  01..06                         ← cada plantilla renderizada full
  editor-1-formulario.png        ← editor: paso formulario
  editor-2-capas.png             ← editor: canvas + panel de capas (Photoshop)
  editor-3-propiedades.png       ← editor: propiedades de capa (X/Y/rot/escala/opac)
  editor-4-tweaks.png            ← editor: paleta/formato/fuente/regenerar
```

QR usa `qrcode-generator` por CDN (jsdelivr). Los flyers abren directo en el navegador.

---

## 8. Reglas de marca (no romper)

- Español de Chile (tú/tienes/aquí). Picardía elegante, sin vulgaridad.
- Dark/neón para flyers de fiesta (REC/Scanner); editorial para Times/Revista/Álbum.
- Paleta = 3 colores por zona con glow. Fondo casi neutro.
- Vertical IG, 1080px ancho mínimo. QR → `www.frate.cl`.
- Claves API solo en env vars, nunca en código. Repos privados.

---

## 9. Nota

El snippet SQL de `attendance_punches` / marcaje-GPS que pudo llegar junto a este pedido
es de **otra app** (control de asistencia) y **no tiene relación** con los flyers. No lo
incluyas ni lo mezcles con este trabajo.
