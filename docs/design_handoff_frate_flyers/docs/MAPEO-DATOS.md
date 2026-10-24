# MAPEO DE DATOS — Flyer FRATE ↔ Supabase  (v2)

Dos capas heredables que una app con IA regenera por evento:

- **`EVENT`** — datos del evento (lo que cambia cada fiesta).
- **`TWEAKS`** — preset visual (acento de color, fuente de la palabra clave,
  módulos visibles). La IA puede rotarlo por concepto; el usuario lo ajusta en Tweaks.

Origen: columna `form_data` (JSON) de `flyer_express_packages`.
Tipos: **DINÁMICO** (del evento) · **DERIVADO** (calculado) · **CHROME** (fijo de plantilla/marca).

---

## TWEAKS (preset visual)
| Clave | Valores | Origen |
|---|---|---|
| `accent` | `#ff2d78` rosa · `#00e5ff` cyan · `#b14bff` morado · `#39ff7d` verde · `#ff7a1e` naranja · `#f5ff3d` amarillo · `#ffffff` blanco | IA por concepto / Tweaks. Recolorea TODO (glows, barras, burbujas, título clave, QR, fecha) |
| `keywordFont` | `bungee` (urbano) · `marker` (marcador) · `spray` (spray) | elección del usuario / IA |
| `showChat` / `showHud` | bool | Tweaks |

---

## Cabecera
| Slot | Tipo | Origen |
|---|---|---|
| logo Fraternidad (top) | CHROME | `assets/logo-fraternidad.png` (logo oficial) |
| `rec` / `fps` / `timecode` / `zone` | CHROME | estética de plantilla |

## Título (núcleo dinámico — solo 2 fuentes)
| Slot | Tipo | Origen |
|---|---|---|
| `titlePre` | CHROME | prefijo (`DIAGNÓSTICO:`) |
| `titleLine1` / `titleTu` | **DERIVADO** | `selectedTitle`/`eventName` → líneas blancas (fuente Anton) |
| `titleKeyword` | **DERIVADO** | palabra clave del título → fuente `--f-keyword` gigante |
| `concept` | **DINÁMICO** | frase-concepto de la noche (`baseConcept`); `<em>` resalta en acento |
| `analysisPct` | CHROME | constante / random 95–99 |

> Lettering real por campaña: si `letteringUrl` existe en `form_data`, reemplaza el
> texto de `titleKeyword` por la imagen PNG/SVG.

## HUD (izquierda)
| Slot | Tipo | Origen |
|---|---|---|
| `impacto` / `peligro` | CHROME | constante (o random) |
| `ubic` / `ubicSub` | CHROME | `FRATE` / `PISTA CENTRAL` |
| `hora` | **DERIVADO** | de `time` |
| ojo (`image-slot#frate-eye`) | DINÁMICO | crop de `fotosReferencia[0].src` |

## Chat (derecha)
| Slot | Tipo | Origen |
|---|---|---|
| `chat[]` `{side,text,time,seen}` | **DINÁMICO** | generado por la IA del Express desde `captionFinal`/`songWhy`. 2–4 burbujas |

## Footer
| Slot | Tipo | Origen |
|---|---|---|
| `dateDay` / `dateNum` / `dateMonth` | **DERIVADO** | de `date` (parse) — número GRANDE |
| `time` | DINÁMICO | `time` / `openingDay` |
| logo FRATE (`image-slot#frate-logo`) | DINÁMICO | asset de marca (subir PNG/SVG del logo FRATE) |
| `tags[]` | **DINÁMICO** | `editorialMood[]` + `customMood` (máx 3) |

## Banda inferior
| Slot | Tipo | Origen |
|---|---|---|
| `concursoText` | **DINÁMICO** | `concursoFlyer` |
| `prizes[]` `{n,label}` | **DINÁMICO** | `prize` + `contestTarget` |
| QR (`#qr`) → `qrUrl` | CHROME | `https://www.frate.cl` (módulos oscuros sobre panel claro = escaneable) |
| `songTitle` | **DINÁMICO** | `songTitle` |
| `songArtist` | **DINÁMICO** | `songMainArtist` + `songFeatArtists` |
| `ticketsUrl` | CHROME | `WWW.FRATE.CL` |
| `handle` + redes | CHROME | marca |

## Fondo
| Slot | Tipo | Origen |
|---|---|---|
| rostro (`image-slot#frate-face`) | **DINÁMICO** | `fotosReferencia[0].src` |

---

## Render (motor B)
1. Express guarda `form_data` en Supabase (ya funciona).
2. Servicio de render (**Puppeteer/Chromium**) carga esta plantilla, inyecta
   `EVENT` + `TWEAKS` desde `form_data` (mapeo de arriba) y exporta PNG 1080×1620
   (+ variantes 4:5 / 9:16). El QR se genera en local (offline).
3. La foto entra en el `image-slot` del rostro; los logos en sus slots.

> **Satori NO** soporta `mix-blend-mode`, `backdrop-filter`, `color-mix()` ni `mask`
> compuestos (grain, glows, acento dinámico). Usar **Puppeteer** para conservar la calidad.

---

# PLANTILLA 2 — SCANNER / ARCHIVO ENCONTRADO
(`Flyer Scanner Archivo.html` + `scanner.css`)

Mismas capas heredables (`EVENT` + `TWEAKS`). `TWEAKS` aquí: `accent`, `format`
(story/carousel/poster), `keywordFont`, `showChat`, `showPolas`.

| Slot | Tipo | Origen |
|---|---|---|
| logo Fraternidad (top) | CHROME | `assets/logo-fraternidad.png` |
| `dateDay` / `dateNum` / `dateMonth` | **DERIVADO** | de `date` (badge grande) |
| `time` | DINÁMICO | `time` / `openingDay` |
| `caso` | CHROME | código de plantilla (o random) |
| `ubic` | CHROME | `PISTA PRINCIPAL` |
| `hora` | **DERIVADO** | de `time` |
| `impactPct` / `peligro` | CHROME | constante / random |
| `chatMsg` | **DINÁMICO** | frase clave (`selectedTitle`) |
| `chatWho` / `chatTime` / `chatSeen` | CHROME | estética |
| `titleLine1` / `titleTu` / `titleKeyword` | **DERIVADO** | `selectedTitle` (palabra clave = fuente keyword) |
| `concept` | **DINÁMICO** | `baseConcept` |
| polaroids (`image-slot#scan-pola-1..4`) | **DINÁMICO** | `fotosReferencia[1..4].src` (4 fotos de fiesta) |
| `polas[]` (captions) | CHROME | códigos |
| `concursoText` | **DINÁMICO** | `concursoFlyer` |
| `prizes[]` (lista de strings) | **DINÁMICO** | `prize` + `contestTarget` |
| `entUrl` / QR (`qrUrl`) | CHROME | `WWW.FRATE.CL` / `https://www.frate.cl` |
| `metaAcceso` / `metaDress` | CHROME | `ACCESO +18` / dress code |
| `tags[]` (pill) | **DINÁMICO** | `editorialMood[]` (`PERREO · AMIGOS · FLOW · LIBERTAD · HISTORIAS`) |
| rostro (`image-slot#scan-face`) | **DINÁMICO** | `fotosReferencia[0].src` |
| logo FRATE (`image-slot#scan-frate-logo`) | DINÁMICO | asset de marca (subir) |

> Layout robusto: HUD superpuesto (absoluto) + bloque inferior en flujo que se
> reacomoda solo en los 3 formatos. La escala se ajusta al ancho del panel
> (alto exacto) para no recortar.

---

# INYECCIÓN DE DATOS (regeneración por la app)

Cada flyer se **crea desde los datos de la generación**. Antes de renderizar, la app define:

```js
window.FRATE_EVENT  = { titleLine1, titleTu, titleKeyword, concept, dateDay, dateNum,
                        dateMonth, time, chat/song, concursoText, prizes, tags, ... };
window.FRATE_TWEAKS = { palette, format, keywordFont, ... };
```

o pasa `?data=<base64(JSON)>` en la URL con `{ "event": {...}, "tweaks": {...} }`.
Si no hay nada, usa el demo. `loadInjected()` mezcla lo inyectado sobre los defaults.
Todos los textos + paleta + formato + fuente = parámetros → **regenera infinito**.

## Colores — 3 por zona
`TWEAKS.palette` puede ser un **preset** (`rec`/`violeta`/`cyan`/`coral`/`verde`) o un
**array de 3 hex libres** que manda la IA: `["#A","#B","#C"]`.
Se reparten por zonas con glow propio:
- **A** (dominante) = título.
- **B** = HUD / chat / archivo / crosshair.
- **C** = concurso / fecha / tags / canción / QR.

REC default `rec` (rosa/cyan/morado) · Scanner default `violeta` (morado/cyan/rosa).
El botón **Regenerar (demo)** en Tweaks cambia textos+paleta para probar la re-creación.
