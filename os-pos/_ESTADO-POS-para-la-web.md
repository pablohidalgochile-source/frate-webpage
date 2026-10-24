# ✅ Serie POS del libro — 10 capítulos, LISTA, solo falta commit + push

**Para la sesión de la WEB.** Escrito por la sesión del POS (que conoce el código real).

## Qué ya está hecho
Los **11 HTML del POS** están escritos **en la plantilla del libro**, en esta carpeta `os-pos/`:

```
os-pos/index.html          → /os-pos          (índice de la serie · 10 capítulos)
os-pos/00-mapa.html        → /os-pos-mapa
os-pos/01-turno.html       → /os-pos-turno     (demo: cuadra la caja, datos reales Puerta 1)
os-pos/02-venta.html       → /os-pos-venta
os-pos/03-dinero.html      → /os-pos-dinero
os-pos/04-puerta-barra.html→ /os-pos-puerta    (demo: un QR = un ingreso)
os-pos/05-catalogo.html    → /os-pos-catalogo
os-pos/06-reglas.html      → /os-pos-reglas
os-pos/07-vincular.html    → /os-pos-vincular  ← NUEVO · dar de alta una Sunmi (device binding)
os-pos/08-covers.html      → /os-pos-covers    ← NUEVO · escanear/imprimir/quemar covers
os-pos/09-noche.html       → /os-pos-noche     ← NUEVO · CASO REAL del sábado FCC-2026-07-25
```

## ⚠️ Importante para tu reconciliación
Tu automatismo, con toda razón, apagaba (`pend`) y quitaba los rewrites de los manuales **cuyo archivo no existía todavía**. **Ya existen los 3 nuevos.** Dejé, coherente con eso:
- `os-guard.js` → `MANUALES_POS` con 07/08/09 **sin** `pend`.
- `vercel.json` → los 3 rewrites (`/os-pos-vincular`, `/os-pos-covers`, `/os-pos-noche`).
- `os-libro.html` → fila POS con los 3 como links vivos (conteo **10 capítulos**).

Verifiqué la cadena de las 4 rutas nuevas (rewrite → archivo → nav → índice): **todas resuelven**. Si tu reconciliación corrió con una lista de archivos vieja y volvió a apagarlos, solo re-corre: al ver los archivos, los deja vivos.

## De paso, colgué 2 huérfanos que estaban sin anclar
Me lo pidió Pablo ("links a todos los manuales que no estén anclados"):
- **`/os-flyer-nube`** (FLYER 08 · La nube) — existía el HTML pero no estaba en el libro, ni en `vercel.json`, ni en `os-guard.js`. Lo enganché en tu **serie Flyer** como 08 (conteo → 9). **Es tuyo:** si lo tenías retenido a propósito (¿revisión de contenido, como los del staff?), revísalo o vuelve a apagarlo — no lo audité.
- **`/os-empresas`** — lo agregué al **pie del libro** ("Las empresas"). Ya se llegaba desde la Portada; ahora también desde el pie.

## Lo único que falta: commit + push (lo haces tú)
No toqué tu git. Cuando estés, incluye los nuevos (untracked):

```
git add os-pos os-pos.css os-guard.js os-libro.html vercel.json os-flyer-nube.html
git commit -m "POS: +3 capítulos (vincular, covers, caso real) + cuelga huérfanos (flyer-nube, empresas)"
git push
```

## Contenido = verdad, no inventado
El 09 (caso real) usa las cifras reales de esa noche: **$4.378.000 · 267 ventas**; sencillo real de Caja Schop (**$97.000** en su desglose); el susto de las diferencias falsas (**Puerta 1 −$97.000 / Puerta 2 −$141.000**) y el resultado real tras corregir el cotejo (**P1 $0 · P2 +$1.000 · Schop −$10.000**). Todo verificado contra el POS. La fuente completa está en **`MAPA-APP-POS-PARA-MANUALES.md`**.
