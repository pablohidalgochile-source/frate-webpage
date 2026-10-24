# FRATE LINK — Handoff de DISEÑO (para Claude Design)

**Qué es esto:** el brief visual/UX para diseñar el módulo **FRATE LINK** dentro de frate.cl. Acá va la MARCA, las PANTALLAS, los ESTADOS y los COMPONENTES. La lógica/datos ya está resuelta en `SPEC-ARQUITECTURA.md` y `HANDOFF.md` (no la re-diseñes, solo dale forma).

**Objetivo de diseño:** una experiencia de inscripción **mobile-first, rápida y con onda de fiesta universitaria/nightlife** — que dé ganas de anotarse. Y un panel de operador **claro y potente** para crear/gestionar links.

**Referencia viva:** hay un mockup navegable en **`frate.cl/link-demo`** (úsalo de base, pero puedes superarlo). La app existente (frate.cl/admin, /validacion, /links) marca el lenguaje visual.

---

## 1. Marca · Sistema de diseño

**Personalidad:** nocturno, elegante pero con energía, universitario chileno, NADA infantil. Negro profundo, acentos rojo y dorado, tipografía condensada en mayúsculas para títulos.

**Paleta (usar exactas):**
| Rol | Hex |
|---|---|
| Fondo | `#0a0a0b` |
| Superficie / card | `#141416` · card2 `#1b1b1f` |
| Líneas | `#26262b` · `#33333a` |
| Texto | `#f2f0f4` · dim `#8b8892` · faint `#5a5862` |
| **Rojo FRATE (acción/acento)** | `#E8363D` |
| **Dorado (precio/beneficio/destacado)** | `#D4A832` |
| Verde (éxito/válido) | `#22c55e` |
| Azul (info/opcional) | `#4d8dff` |
| Morado (revisión/postedición) | `#a78bfa` |

**Tipografía:**
- Títulos / números grandes: **Barlow Condensed** (700–900), mayúsculas, tracking apretado.
- Cuerpo / formularios: **Inter** (400–800).
- Monoespaciada (códigos/QR token/timecode): `ui-monospace`.

**Radios y sombras:** bordes redondeados 10–16px; cards con sombra suave; inputs `#0e0e12` con borde `#26262b`.

**Do:** contraste alto, jerarquía por tamaño, botones rojos llenos para la acción principal, badges/pills para estados. Emojis puntuales como iconos (🎫🎂🍾🎤🎬 · 📸 · 🗺 · ✅).
**Don't:** degradados pastel, look corporativo, sombras exageradas, íconos infantiles, copiar estilos del ERP.

---

## 2. Pantallas a diseñar

### 🟥 A. PÚBLICO — inscripción del invitado (LO MÁS IMPORTANTE · mobile-first)
Es una web que abre en el celular desde un link (`frate.cl/lista/CODIGO`). Debe verse increíble en 375px de ancho.

**P1 · Inscripción (pantalla principal)**
- **Cover** arriba: imagen/gradiente del evento, "Te invita · [nombre]", **nombre del evento** (Barlow Condensed grande), fecha + lugar, y un **pill de cupos** ("Cupos: 34/80", el número en verde; rojo si quedan pocos).
- Botón destacado **"📸 Escanear mi carnet (autocompleta)"** (dorado, dashed).
- **Formulario adaptativo:** solo se muestran los campos que el operador activó. Cada campo puede ser *opcional* (label gris) u *obligatorio* (asterisco rojo). Campos posibles: Nombre*(fijo), RUT, Email, Teléfono, Instagram, Apodo, Rol, Productor, Nacionalidad.
- Botón principal **"Anotarme →"** (rojo, full-width).
- Microcopy que explique que solo salen los campos pedidos.
- **Diseñá cómo se ve el form con 3 campos vs con 8** (debe escalar sin verse feo).

**P2 · Escaneo de carnet (OCR)**
- Estado "escaneando" (cámara/loading) → **resultado**: card verde con Nombre / RUT / Fecha de nacimiento extraídos, y un check **"✔ Mayor de 18"** (o rojo si es menor → bloquea).
- Debe soportar 2 vías: barcode del carnet o foto. Diseñá el estado de captura + el de resultado + el de error ("no se pudo leer, intenta de nuevo o llena a mano").

**P3 · Elegir mesa (croquis) — solo si el link lo permite**
- Un **plano/croquis** del local con mesas/zonas como bloques tocables: **libre** (borde verde), **seleccionada** (relleno verde), **ocupada** (atenuada). Cada bloque con nombre (VIP 1, Palco A, Barra, Pista…) y opcional capacidad/precio.
- Feedback de la selección + botón confirmar.
- Pensá la versión mobile del plano (scroll/zoom si es grande).

**P4 · Confirmación + QR**
- Estado de éxito: **"✅ ¡Estás en la lista!"**, el **QR** grande, nombre + mesa, y "muestra este QR en la puerta · se valida una sola vez · te llega al correo/WhatsApp".
- Un detalle chico de **calidad de dato** ("completa / parcial / mínima").
- Si el link requiere aprobación humana: estado alternativo **"⏳ Quedaste en revisión"** (sin QR todavía) — diséñalo también.

**P0 · Estados de borde (diséñalos, son clave para que no se vea roto):**
- Link **cerrado** / **pausado**.
- **Sin cupos** ("lista llena").
- **Vencido** (pasó `closes_at`).
- **Ya te inscribiste** (con este RUT/email).
- **Error** genérico / sin conexión.
- Link **con cover** (a pagar): cómo se muestra el monto y el paso de pago.

### 🟦 B. ADMIN — crear y gestionar el link (operador, desktop + mobile)
Vive dentro de frate.cl/admin (mismo lenguaje del panel actual).

**A1 · Catálogo de tipos** — chips seleccionables: 🎫 Lista · 🎂 Cumpleaños · 🍾 Reserva · 🎤 Artista · 🎬 Producción. Cada uno trae su preset de formulario.

**A2 · Crear link — Express** (el 90% de los casos): 3 campos (quién invita, cupos, tipo) → genera el link + URL copiable. Que se sienta de 10 segundos.

**A3 · Crear link — Completa:** el **form_config campo por campo** con un control **tri-estado** (oculto / opcional / obligatorio) por cada campo. Más: cover, cupos, **cierre automático** (fecha/hora), aprobación humana (toggle), permitir datos incompletos (toggle), permitir elegir mesa (toggle + qué croquis), texto del beneficio, categoría. Diseñá el control tri-estado bien claro.

**A4 · Gestión de inscritos:** tabla/lista de quién se anotó, con **estado** (pendiente/aprobado/rechazado/entró), **calidad de dato** (badge), marca de **cliente frecuente** (⭐, viene del CRM), botones aprobar/rechazar, y buscador. Acción masiva para aprobar varios.

---

## 3. Componentes reutilizables a definir
- **Campo de formulario** (label + input + estado opcional/obligatorio).
- **Control tri-estado** oculto/opcional/obligatorio (segmented).
- **Chip de tipo** (emoji + nombre + preset).
- **Pill de cupos** (con color según disponibilidad).
- **Bloque de mesa** del croquis (libre/sel/ocupada).
- **Card de QR / éxito**.
- **Badge de calidad de dato** (completa=verde, parcial=dorado, mínima=gris).
- **Badge de frecuente** (⭐ + nº de visitas).
- **Estado vacío / error / cerrado** (ilustración simple + copy).

---

## 4. Contenido / microcopy (tono chileno, cercano, sin garabatos)
Ejemplos de voz: "Anótate en segundos", "Muestra este QR en la puerta", "Escanea tu carnet y lo llenamos por ti", "Lista llena — pero puedes preguntar por otra fecha", "Quedaste en revisión, te avisamos al toque". Usa **tú** (no vos/voseo). Nada infantil.

---

## 5. Constraints técnicos (para que el diseño sea implementable)
- **Mobile-first** la parte pública (se abre desde el celular). Dark mode nativo (no hay modo claro).
- Se sirve como **HTML/CSS/JS self-contained** en frate.cl (hosting estático + Supabase). Sin frameworks pesados: pensá en HTML semántico + CSS. Fuentes ya usadas: Barlow Condensed + Inter (Google Fonts).
- El croquis puede ser SVG o bloques absolutos; que sea liviano.
- Reusa el lenguaje visual del **admin actual** para la parte B, y del **Linktree `/links`** (nightlife elegante) para la parte pública.

---

## 6. Entregables esperados de Claude Design
1. Las pantallas públicas P1–P4 + estados de borde P0 (mobile, 375px).
2. Las pantallas admin A1–A4 (desktop + mobile).
3. Los componentes de la §3 (con sus estados).
4. Specs mínimas: colores/tipos usados por pantalla, espaciados, y notas de interacción (qué pasa al tocar, transiciones simples).
5. Idealmente, mockups en HTML/CSS listos para implementar (matchean el stack).

**Referencias a mirar:** `frate.cl/link-demo` (flujo base) · `frate.cl/links` (estética nightlife) · `frate.cl/admin` (lenguaje del panel) · `frate.cl/validacion` (puerta/QR).

*Español de Chile. La lógica ya está resuelta — este brief es puro diseño. Que dé ganas de anotarse. 🔥*
