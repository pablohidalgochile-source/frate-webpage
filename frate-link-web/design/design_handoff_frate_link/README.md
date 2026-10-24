# Handoff: FRATE LINK — Inscripción de invitados + Admin

## Overview
FRATE LINK es un módulo de frate.cl para inscribir invitados a fiestas/eventos mediante un link (`frate.cl/lista/CODIGO`). Tiene dos caras:
- **Público (mobile-first, 375px):** el invitado abre el link en el celular, se inscribe (form adaptativo), opcionalmente escanea su carnet (OCR) y elige mesa, y recibe un QR de acceso.
- **Admin (desktop + mobile):** el operador crea links (express o completa con `form_config` tri-estado) y gestiona a los inscritos.

La lógica/datos ya está resuelta en `SPEC-ARQUITECTURA.md` / `HANDOFF.md` del proyecto. Este paquete es **solo el diseño**.

## About the Design Files
Los archivos de este bundle son **referencias de diseño hechas en HTML** — un prototipo que muestra el look y el comportamiento buscados, **no** código de producción para copiar tal cual. La tarea es **recrear estos diseños en el entorno del codebase objetivo** usando sus patrones y librerías establecidas. Según el brief, el stack objetivo es **HTML/CSS/JS self-contained servido en frate.cl (hosting estático + Supabase), sin frameworks pesados** — HTML semántico + CSS. Reutiliza el lenguaje visual del **admin actual** para la parte B y del **Linktree `/links`** (nightlife) para la pública.

El archivo `FRATE LINK.dc.html` es un "Design Component" (React envuelto por un runtime propio) usado solo para prototipar. **No lo importes al proyecto** — léelo como fuente de verdad de layout, medidas, colores, copy y estados, y reimpleméntalo en HTML/CSS/JS plano.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados, copy en español de Chile y estados son finales. Recréalo pixel-perfect. Las únicas piezas de placeholder:
- **QR**: en el mock es un patrón decorativo CSS (`conic-gradient`). Reemplázalo por un QR real generado desde el token.
- **Cover del evento / OCR de cámara**: el cover es un gradiente; el escaneo usa `getUserMedia` real pero los datos extraídos son fijos (mock). Conéctalo al servicio real de OCR/lector PDF417.

---

## Design Tokens

### Color
| Rol | Hex |
|---|---|
| Fondo | `#0a0a0b` |
| Superficie / card | `#141416` |
| Card 2 | `#1b1b1f` |
| Input bg | `#0e0e12` |
| Línea sutil | `#26262b` |
| Línea fuerte | `#33333a` |
| Texto | `#f2f0f4` |
| Texto dim | `#8b8892` |
| Texto faint | `#5a5862` |
| Rojo FRATE (acción/acento) | `#E8363D` |
| Rojo hover | `#f2555b` |
| Dorado (precio/beneficio/destacado) | `#D4A832` |
| Verde (éxito/válido) | `#22c55e` |
| Azul (info/opcional) | `#4d8dff` |
| Morado (revisión) | `#a78bfa` |

Fondo global de página: `radial-gradient(1200px 600px at 20% -5%, #17070a 0%, #0a0a0b 55%)`.

### Tipografía
- **Barlow Condensed** (700–900) — títulos, números grandes, labels de sección. SIEMPRE `text-transform:uppercase`, tracking apretado a normal según tamaño, `line-height` 0.88–1.
- **Inter** (400–800) — cuerpo, formularios, botones.
- **ui-monospace** — códigos, RUT, token de QR, timecode. El RUT y el token siempre en mono.
- Google Fonts: `Barlow+Condensed:wght@400;500;600;700;800;900` + `Inter:wght@400;500;600;700;800`.

### Escala tipográfica observada
- Título de sección (canvas): Barlow 900, 34px.
- Título hero / nombre evento: Barlow 900, 38–56px.
- Título pantalla (mobile): Barlow 800, 22px.
- Body: Inter 14–16px.
- Label de campo: Inter 600, 13px.
- Micro/hint: Inter 400–500, 11–12px, color `#5a5862`.
- Label de sección (uppercase): Barlow 700, 14–16px, letter-spacing .14–.22em, color `#8b8892`.

### Radios
- Cards / paneles: 14–16px.
- Inputs / botones: 10–13px.
- Chips / pills / toggles internos: 6–12px.
- Pills de estado: 999px.
- Frames de teléfono: 34–36px (pantalla), 46px (bezel).

### Sombra
- Cards flotantes / device / ventanas: `0 40px 90px rgba(0,0,0,.5–.6)`.
- Botón primario rojo: `0 8px 24px rgba(232,54,61,.3–.35)`.

### Espaciado
- Padding de pantalla mobile: 18px horizontal.
- Padding de card: 16–26px.
- Gap entre campos de form: 13px.
- Gap entre secciones del canvas: ~96–110px.

### Interacción / animación
- Transición al cambiar de pantalla: fade + pop 250ms (`@keyframes` scale .85→1 + opacity 0→1).
- `fl-scanline`: línea dorada sube/baja 2.4s ease-in-out infinite (overlay de cámara).
- `fl-pulse`: opacity .45↔1 1.2–1.3s (indicadores "en vivo").
- `fl-spin`: rotación (spinners si se necesitan).
- Touch targets ≥ 44px.
- Botón acción principal = rojo lleno; secundaria = borde o ghost.

---

## Screens / Views

### PÚBLICO (mobile 375px, dark, dentro de un bezel de 399px)

#### P1 · Inscripción
- **Propósito:** el invitado se anota.
- **Layout:** cover arriba (238px, gradiente `#3a0d12→#0a0a0b` con textura de líneas diagonales rojas a 6% opacidad) → cuerpo con padding 18px.
- **Cover:** "Te invita · [host]" (dorado 12px 700), nombre del evento (Barlow 900 46px uppercase, 2 líneas), fecha (🗓) y lugar (📍) en dim. **Pill de cupos** flotante arriba-derecha: bg `rgba(10,10,11,.72)` blur, borde `#33333a`, número en verde/dorado/rojo según disponibilidad.
- **Botón escanear carnet:** full-width, dashed dorado (`1.5px dashed #D4A832`), bg `rgba(212,168,50,.08)`, texto dorado 700. "📸 Escanear mi carnet · autocompleta".
- **Form adaptativo:** solo los campos que el operador activó. Cada label muestra `*` rojo si obligatorio o "opcional" gris a la derecha. Inputs: bg `#0e0e12`, borde `#26262b`, radius 11px, padding 13–14px, `:focus` borde `#E8363D`. Campos posibles: Nombre*(fijo), RUT, Teléfono, Email, Instagram, Apodo, Rol, Nacionalidad. **Debe escalar de 3 a 8 campos sin verse feo** (en el mock hay un toggle demo 3↔8).
- **Microcopy:** "Solo pedimos lo necesario para esta lista. Tus datos no se comparten." (centrado, faint).
- **Botón principal:** "Anotarme →" rojo `#E8363D` full-width, Inter 800 16px, sombra roja.

#### P2 · Escaneo de carnet (OCR)
- **Propósito:** autocompletar leyendo el carnet.
- **Estado captura:** preview de cámara real (`getUserMedia`, `facingMode:environment`) en recuadro `aspect-ratio:1.586/1`, overlay con marco dorado + scanline animada. Chips "◱ Barcode PDF417" / "🖼 Foto del carnet". Indicador "Buscando datos…" con punto dorado pulsante. Botón "Capturar ahora" (dorado, texto `#0a0a0b`). Link ghost "Prefiero llenar a mano".
- **Estado error de cámara:** overlay `#0a0a0b` con 📷 + "Sin acceso a la cámara. Puedes subir una foto del carnet o llenar a mano."
- **Estado resultado:** card verde (`rgba(34,197,94,.08)`, borde verde) con "✔ Datos leídos del carnet", filas Nombre / RUT (mono) / Nacimiento (mono), y chip "✅ Mayor de 18 · 25 años" (verde). Si es menor → variante roja que bloquea. Botones "Confirmar y seguir →" (rojo) y "Volver a escanear" (ghost). Debe soportar 2 vías: barcode PDF417 y foto.

#### P3 · Elegir mesa (croquis) — solo si el link lo permite
- **Propósito:** elegir zona/mesa.
- **Layout:** header con back + título "Elige tu mesa" + subtítulo. Leyenda (libre/elegida/ocupada). Plano en card `#0e0e12` con bloques **absolutamente posicionados** (290×262px de canvas).
- **Bloque de mesa (componente):** libre = borde verde `1.5px` + bg `rgba(34,197,94,.06)`; seleccionada = relleno verde `#22c55e` texto oscuro + halo `0 0 0 4px rgba(34,197,94,.18)`; ocupada = `#141416` opacity .55, `cursor:not-allowed`; pista = dashed, no tocable. Cada bloque: nombre (Barlow 700 uppercase) + capacidad/precio.
- **Feedback:** al elegir aparece card "Elegiste [MESA] · [n] personas". Botón "Confirmar mesa →" (rojo) + link "Prefiero lista general (sin mesa)".
- Mesas del mock: VIP 1 (8p $120.000, libre), VIP 2 (ocupada), Palco A/B (6p $90.000, libre), Barra (12p, libre), Pista (no seleccionable).

#### P4 · Confirmación + QR
- **Propósito:** entregar el acceso.
- **Layout:** check verde en círculo → "¡Estás en la lista!" (Barlow 900 38px) → subtítulo evento. **Card blanca** con QR grande (170px) + token mono `4F9K-22AB`. Filas "A nombre de" y "Mesa" (verde). Chip "Calidad de dato: completa" (dorado). Microcopy "Muestra este QR en la puerta · se valida una sola vez · te llega al correo y WhatsApp". Botón "Guardar en mi teléfono".

#### Revisión (alterno de P4, cuando el link requiere aprobación humana)
- ⏳ morado en círculo → "Quedaste en revisión" (Barlow 900 40px) → copy "…te avisamos al toque por correo y WhatsApp…". Chip morado "Estado: pendiente de aprobación" con punto pulsante. **Sin QR todavía.**

#### P0 · Estados de borde
Todos son pantallas centradas con ícono en círculo + título Barlow 900 + copy dim + acción opcional:
- **Link cerrado:** 🔒 "Lista cerrada" — "El anfitrión cerró las inscripciones…".
- **Pausado:** ⏸ dorado "En pausa" + chip "Reabre pronto".
- **Sin cupos:** 🎟 rojo "Lista llena" + pill cupos 80/80 (rojo) + botón "Avísame si se abre cupo".
- **Vencido (closes_at):** ⌛ "Se cerró el registro" — muestra fecha/hora de cierre.
- **Ya te inscribiste:** ✅ "Ya estás en la lista" + QR chico + token (mismo RUT/email ya usado).
- **Error / sin conexión:** 📡 "Se cayó la señal" + botón "Reintentar" (rojo).
- **Con cover (a pagar):** cover chico + card con "Cover general $8.000" (Barlow 900 dorado) + "Incluye 1 trago de bienvenida" + botón dorado "Pagar $8.000 →" + "🔒 Webpay · Transbank". El pago deja el QR validado.

### ADMIN (desktop 1000px + mobile 300px, dark, dentro de browser window chrome)

#### A1 + A2 · Crear link (catálogo + express)
- **Chrome:** traffic lights + pill URL mono `frate.cl/admin/links/nuevo`. Sidebar 210px (`#0a0a0b`, borde derecho) con logo "FRATE ADMIN" y nav: Dashboard, **Links (activo)**, Validación, CRM · Clientes, Ajustes. Item activo: bg `#141416` + punto rojo.
- **A1 · Chips de tipo:** 🎫 Lista (seleccionado: borde rojo + bg `rgba(232,54,61,.1)`), 🎂 Cumpleaños, 🍾 Reserva, 🎤 Artista, 🎬 Producción (no sel: `#141416` borde `#26262b`). Cada tipo trae un preset de formulario.
- **A2 · Express (3 datos):** input "Quién invita", input "Cupos", botón "Generar link" (rojo). Resultado: banda verde con "✔ Link listo" + URL mono `frate.cl/lista/NS26` + botones "Copiar" / "QR". Debe sentirse de 10 segundos.

#### A3 · Crear link — Completa (form_config tri-estado)
- **Layout:** 2 columnas. Izq (1.5fr): título + leyenda de estados (Oculto gris `#33333a` / Opcional azul `#4d8dff` / Obligatorio rojo `#E8363D`) + filas por campo. Der (290px): panel "Opciones del link".
- **Fila de campo:** card `#141416` con nombre a la izq y **control tri-estado** (segmented) a la der: 3 segmentos en track `#0e0e12`; el activo se rellena con su color (oculto=`#33333a`, opcional=`#4d8dff`, obligatorio=`#E8363D`) texto blanco 700, los demás faint. "Nombre completo" marcado como "· fijo" (siempre obligatorio). Campos ocultos: card atenuada opacity .7.
- **Panel opciones:** toggles (Aprobación humana ON rojo, Permitir datos incompletos OFF, Elegir mesa ON verde) — pista de toggle `#33333a` off / color on, knob 20px. Inputs "Cierre automático" (mono) y "Texto del beneficio 🍾" (dorado). Botón "Guardar y publicar" (rojo).
- **Toggle spec:** track 42×24px radius 999px, knob 20px blanco, on = alineado derecha.

#### A4 · Gestión de inscritos
- **Chrome/URL:** `frate.cl/admin/links/NS26/inscritos`.
- **Header:** título "Inscritos · Noche Subte" + resumen "34 anotados · 8 pendientes · 22 aprobados · 4 entraron". Buscador (bg `#0a0a0b` borde) "🔍 Buscar nombre, RUT, @…". Botón verde "✓ Aprobar (3)" (acción masiva).
- **Tabla:** grid `32px 1.6fr 1fr 130px 120px 150px`. Header uppercase dim. Filas con checkbox (accent `#E8363D`), nombre, RUT (mono), **badge calidad** (completa verde / parcial dorado / mínima gris), **badge estado** (pendiente dorado / aprobado verde / entró gris-borde / rechazado rojo), acción (✓/✕ en cuadros de color, u hora de entrada). **Cliente frecuente:** chip dorado "⭐ 12" junto al nombre (viene del CRM). Fila rechazada/mínima: opacity .65.

#### Admin mobile
- Versión mobile de A2 (crear express: chips + 2 inputs + generar + link copiable) y de A4 (gestión como cards apiladas con badges y botones aprobar/rechazar full-width).

---

## Componentes reutilizables (§3)
1. **Campo de formulario** — label + input + estado opcional/obligatorio + estado error (borde rojo + mensaje).
2. **Control tri-estado** — segmented oculto/opcional/obligatorio (colores gris/azul/rojo).
3. **Chip de tipo** — emoji + nombre; seleccionado (rojo) vs disponible (borde).
4. **Pill de cupos** — número coloreado según disponibilidad: verde (holgado) / dorado (quedan pocos) / rojo (lleno).
5. **Bloque de mesa** — libre / seleccionada / ocupada.
6. **Card de QR / éxito** — QR + token + estado.
7. **Badge de calidad de dato** — completa (verde) / parcial (dorado) / mínima (gris).
8. **Badge de frecuente** — ⭐ + nº de visitas (dorado).
9. **Estado vacío / error / cerrado** — ícono en círculo + título + copy.

---

## Interactions & Behavior
- **Flujo público:** P1 → (opcional P2 escaneo) → (opcional P3 mesa) → P4 QR, o → Revisión si el link requiere aprobación.
- **Toggle 3↔8 campos (P1 demo):** cambia cuántos campos del `form_config` se muestran. En producción esto lo define el operador en A3, no el invitado.
- **Cámara (P2):** se enciende con `getUserMedia({video:{facingMode:'environment'}})` SOLO al entrar a P2 y se apaga (`track.stop()`) al salir. Si falla el permiso → estado de error con fallback a foto/manual.
- **Selección de mesa (P3):** tap en bloque libre → estado seleccionado + card de feedback inmediata. Bloques ocupados/pista no responden.
- **Transiciones:** fade+pop 250ms al cambiar de pantalla. Sin animaciones pesadas.
- **Admin:** chips y tri-estado son selección instantánea; toggles cambian estado del link; "Aprobar (n)" es acción masiva sobre seleccionados.

## State Management (público)
- `step`: `p1 | scan | p3 | p4 | revision`.
- `scan`: `capturing | done`; `camError`: bool.
- `mode`: `'3' | '8'` (demo de densidad de form).
- `table`: id de mesa seleccionada (o null).
- Datos del invitado (form) + resultado de OCR.
- Datos que vienen del backend/Supabase: `form_config` (qué campos y su estado tri), cupos (taken/total), flags del link (aprobación humana, datos incompletos, elegir mesa, cover/precio, closes_at), estado del link (abierto/pausado/cerrado/vencido/lleno), croquis (mesas + estados), y para admin la lista de inscritos + CRM (frecuencia).

## Assets
- Fuentes: Google Fonts (Barlow Condensed, Inter). Sin imágenes propias en el mock.
- Emojis como iconos: 🎫🎂🍾🎤🎬 📸 🗺 🗓 📍 ✅ ✔ ⏳ 🔒 ⏸ 🎟 ⌛ 📡 📷 ⭐ 🔍. En producción pueden mantenerse como emoji o migrarse al set de íconos del admin actual.
- **QR:** generar real desde el token (el mock usa un patrón CSS).
- Cover del evento: imagen subida por el operador (el mock usa gradiente + textura).

## Files
- `FRATE LINK.dc.html` — prototipo completo (design system + flujo público interactivo + P0 + admin + componentes). Fuente de verdad.
- `screenshots/` — capturas de cada pantalla (ver más abajo).

## Screenshots
En la carpeta `screenshots/`:
- `01-masthead-sistema.png` — portada + sistema de diseño (paleta, tipografía, reglas).
- `02-p1-inscripcion.png` — P1 form (3 campos).
- `03-p1-8campos.png` — P1 con 8 campos (densidad alta).
- `04-p2-scan.png` — P2 escaneo (cámara / error).
- `05-p2-resultado.png` — P2 resultado OCR.
- `06-p3-croquis.png` — P3 elegir mesa.
- `07-p4-qr.png` — P4 confirmación + QR.
- `08-revision.png` — estado en revisión.
- `09-p0-estados.png` — galería de estados de borde.
- `10-admin-express.png` — A1+A2 crear express.
- `11-admin-completa.png` — A3 form_config tri-estado.
- `12-admin-gestion.png` — A4 gestión de inscritos.
- `13-admin-mobile.png` — admin en mobile.
- `14-componentes.png` — librería de componentes.
