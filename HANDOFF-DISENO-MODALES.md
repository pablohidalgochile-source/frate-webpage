# HANDOFF DE DISEÑO · FRATE — Modales del admin

**Para:** Claude Design · ChatGPT
**De:** la sesión de Claude Code que mantiene frate.cl
**Fecha:** 5 de agosto de 2026
**Dueño del producto:** Pablo Hidalgo

---

## 0. Lee esto antes que nada — reglas que no se negocian

1. **Todo el texto va en español de Chile, tratando de tú.**
   **Prohibido el voseo y los argentinismos.** Nada de *querés, tenés, podés, fijate, mirá, acordate, vos, dale, che, laburo, posta*.
   Se dice: *quieres, tienes, puedes, fíjate, mira, acuérdate*.
   Esto aplica a **todo el texto de la interfaz**, no solo a lo que nos escribimos entre nosotros. Es la regla que más veces se ha roto.

2. **Nunca uses «Tomás» como nombre de ejemplo.** Ni en mockups, ni en placeholders, ni en datos de prueba. Única excepción: la Universidad Santo Tomás, que es una institución real.
   Nombres de ejemplo que sí puedes usar: Constanza, Javiera, Matías, Ignacio, Camila, Benjamín, Antonia.

3. **Las cortesías son gratis y se cuentan aparte, siempre.** Su precio es `null`, **no `0`** — un cero hace pensar a la app que algo no se pagó. Si diseñas algo que muestra precios, una cortesía no muestra «$0», muestra «Cortesía».

4. **Los precios de los paquetes son referencia.** El monto final lo pone una persona. No diseñes nada que dé a entender que el precio es automático o definitivo.

---

## 1. Qué es FRATE

Discoteca en Chile. Un solo producto con tres caras:

- **frate.cl** — la web pública: cartelera, compra de entradas, linktree (`/links`).
- **El panel de admin** (`admin.html`) — donde el equipo arma cada noche: eventos, tipos de entrada, listas de invitados, cortesías, RRPP, cumpleaños, WhatsApp, devoluciones.
- **La puerta** — validación de QR en vivo.

Hay tres sistemas hermanos que conversan con este: **FRATE ERP**, **FRATE POS** (caja) y **FRATE FLYER** (diseño de afiches). No los toques; solo ten presente que existen.

**El contexto de uso importa:** el admin se opera **de noche, apurado, muchas veces desde el teléfono, con gente esperando en la puerta.** Eso manda sobre cualquier consideración estética.

---

## 2. Lo que ya existe y NO se rediseña

### 2.1 La paleta flúor (decidida por Pablo, ya en producción)

Vive en `frate-afiche.js` y decora la web pública, el linktree y los afiches automáticos:

```js
var COLORES = ['#FF1744', '#FFE600', '#18D9FF', '#9D4BFF', '#00E676', '#FF4FC3'];
//              rojo       amarillo   celeste    morado     verde      rosado
var POR_PUBLICO = { F:'#FF4FC3', M:'#18D9FF', U:'#FFE600', '':'#FF1744' };
//                  mujeres      hombres      unisex       general
```

Pablo pidió explícitamente que fueran **«mucho más flúor, no tan deslavados»**. No los bajes de saturación.

### 2.2 Los tokens del admin (el modo oscuro real, no lo inventes)

```css
:root{
  --bg:#0a0a0d; --bg2:#131316; --bg3:#1b1b20;
  --border:#26262b; --border2:#3a3a41;
  --text:#f4f4f6; --muted:#8a8a92; --muted2:#5a5a62;
  --rojo:#E8363D;  --rojo2:#ff5a60;   /* el rojo primario del admin */
  --dorado:#E6C860; --verde:#4ade80; --azul:#60a5fa; --morado:#c4b5fd;
  --r:9px; --r-card:15px; --r-pill:999px;
  --shadow:0 8px 26px rgba(0,0,0,.4);
  --font:'Inter',sans-serif; --disp:'Barlow Condensed',sans-serif;
}
```

Ojo: el admin usa `--rojo:#E8363D` (más apagado, para leer mucho rato) y la web pública usa `#FF1744` (flúor). **Son dos rojos distintos a propósito.** No los unifiques.

### 2.3 Las clases de modal que ya existen

```css
.mo    { position:fixed; inset:0; background:rgba(0,0,0,.82); z-index:1000;
         display:flex; align-items:center; justify-content:center; padding:20px; }
.mb    { background:var(--bg2); border:1px solid var(--border);
         border-radius:var(--r-card); box-shadow:var(--shadow);
         width:100%; max-width:620px; max-height:88vh; overflow-y:auto; }
.mh    { padding:14px 18px; border-bottom:1px solid var(--border);
         display:flex; align-items:center; justify-content:space-between; }
.mht   { font-weight:700; font-size:1rem; letter-spacing:-.2px; }
.mc    { background:none; border:none; color:var(--muted); cursor:pointer; }
.mbody { padding:18px; }
.mfoot { padding:12px 18px; border-top:1px solid var(--border);
         display:flex; gap:6px; justify-content:flex-end; }
.fg    { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; }
.form-2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
```

Botones: `.btn-p` (rojo, acción principal) · `.btn-s` (gris) · `.btn-g` (fantasma) · `.btn-gold` (dorado, acciones especiales).

**Trabaja sobre estas clases.** No propongas Tailwind, ni un framework, ni componentes React. `admin.html` es **un solo archivo de 1,4 MB, HTML + JS plano, sin build**. Todo lo que entregues tiene que poder pegarse ahí.

---

## 3. El problema concreto

**39 modales. 464 campos.** Auditados uno por uno el 5 de agosto de 2026.

### 3.1 Los 18 que son un muro de campos

Ocho o más campos, todos de una, sin ninguna estructura. Ordenados por gravedad:

| Modal | Título | Campos |
|---|---|---|
| `modal-paquete` | Nuevo paquete | 26 |
| `modal-evento` | Nuevo evento | 21 |
| `modal-catalogo` | Nuevo tipo de ticket | 17 |
| `modal-tt` | Tipo de Ticket | 15 |
| `modal-plantillas` | Plantillas de Comunidad | 14 |
| `modal-brief` | Importar brief (FRATE FLYER) | 11 |
| `modal-ambiente` | Ambiente | 11 |
| `modal-cortesia` | Nueva cortesía | 10 |
| `modal-codigo` | Nuevo código | 10 |
| `modal-resp` | Nueva respuesta | 10 |
| `modal-pregunta` | Pregunta de Trivia | 9 |
| `modal-reserva` | Editar reserva | 9 |
| `modal-persona` | Ficha | 9 |
| `modal-membresia` | Nueva membresía | 9 |
| `modal-extra` | Nuevo extra | 9 |
| `modal-premio` | Nuevo premio | 8 |
| `modal-catitem` | Nueva opción | 8 |
| `modal-tiendita` | Producto Tiendita | 8 |

**Qué duele exactamente:**
- Hay que bajar scrolleando para saber qué falta.
- Si un campo obligatorio quedó vacío, te enteras recién al apretar Guardar.
- No hay ninguna señal de progreso.
- `modal-paquete` con 26 campos, a las 2 de la mañana, en un teléfono, es inoperable.

### 3.2 Los 2 que mienten (esto es un bug, no diseño — lo arreglamos nosotros)

```js
async function saveMedia() {
  const url = document.getElementById('med-url').value.trim();
  if (!url) { showToast('Ingresa una URL', true); return; }
  showToast('✅ URL de media guardada'); closeModal('modal-media');
  // ← no escribe NADA en la base
}

function enviarRegalo() {
  showToast('✅ Función de regalo — próximamente con email');
  closeModal('modal-regalo');
}
```

Ambos muestran un ✅ verde y no guardan nada. Los campos `med-ambiente`, `med-tipo` y `rg-msg` no los lee nadie. Lo menciono para que sepas que existen; el arreglo es de código.

### 3.3 Los 2 que ya funcionan — este es el patrón a copiar

**`modal-lista-insc` (Nuevo FRATE LINK)** y el **constructor de formularios** ya se convirtieron a pasos y andan bien. Su estructura:

```js
const LW_PASOS = ['Qué lista', 'Qué pide', 'Cómo se ve', 'Listo'];
function _lwIr(n) { /* pinta el paso n, valida el anterior */ }
```

- Barra de progreso arriba con los nombres de los pasos.
- Un paso = una pregunta, cabe en pantalla sin scroll.
- Valida al pasar al siguiente, no al final.
- El último paso es **resumen antes de confirmar**.
- Botón secundario: **«Guardar y salir»** (guarda borrador y cierra).

---

## 4. Lo que te pedimos

### Entrega A — La cáscara única (lo más importante)

Diseña **un solo componente de modal por pasos** que sirva para los 18. Va a vivir en un archivo nuevo, `frate-modal.js`, igual que `frate-afiche.js` unificó la decoración.

Necesitamos ver:

1. **Anatomía completa** en los cuatro estados: paso intermedio, primer paso, último paso (resumen), y **estado de error** (qué pasa cuando la base rechaza el guardado).
2. **La barra de pasos.** Con 3, 4 y 6 pasos. Con nombres largos («Cómo se ve»). Qué pasa en pantalla angosta.
3. **El pie.** Dónde va «Atrás», «Siguiente», «Guardar y salir», «Publicar». Jerarquía clara: solo una acción primaria por paso.
4. **Móvil, 390px de ancho.** No es un extra — es el caso real de uso. Muéstralo primero si quieres.
5. **El aviso de «tienes cambios sin guardar»** al intentar cerrar.

### Entrega B — Cómo se reparten los campos

Para los **tres más pesados** (`modal-paquete` 26, `modal-evento` 21, `modal-catalogo` 17), propón **en qué pasos se agrupan los campos y cómo se llama cada paso**, en español de Chile.

Regla que ya validamos: **un paso responde una pregunta**, no «es un grupo de campos». «¿Qué noche estás armando?» funciona mejor que «Datos generales».

### Entrega C — Los patrones sueltos que se repiten

Estos aparecen en muchos modales y cada uno está resuelto distinto. Unifícalos:

- **Buscador de persona con resultados** (aparece en 5 modales: cortesía, reserva, agregar inscrito, importación, media).
- **Pastilla de estado** (borrador / publicado / cerrado / cortesía / venta).
- **Selector de fecha y hora** con el detalle de que las noches van 23:00 → 05:00 pero **cuentan como el día publicado**.
- **Campo de dinero en pesos chilenos** (separador de miles, y el caso `null` = cortesía).
- **Confirmación destructiva** (borrar lista, devolver pago).

---

## 5. Formato de entrega

- **HTML + CSS plano**, usando las variables `--bg2`, `--rojo`, etc. de arriba. Sin build, sin dependencias, sin frameworks.
- Si entregas imágenes, **acompáñalas del HTML**. Una imagen sola no se puede pegar en el código.
- Modo oscuro únicamente. El admin no tiene modo claro y no lo va a tener.
- Los íconos son **emoji**, no una librería. Es lo que ya se usa (🔗 📥 🎁 🚫 ⚡).

---

## 6. Restricciones que van a ahorrarte trabajo perdido

| No hagas | Por qué |
|---|---|
| Proponer React / Vue / Tailwind | `admin.html` es un archivo plano de 1,4 MB sin build. No hay dónde meterlo. |
| Cambiar `--rojo` del admin | Se eligió más apagado a propósito: se mira durante horas. |
| Unificar el rojo del admin con el de la web | Son distintos a propósito. |
| Bajar la saturación de la paleta flúor | Pablo pidió explícitamente lo contrario. |
| Diseñar modo claro | No existe. |
| Mostrar «$0» en una cortesía | Su precio es `null`. Se muestra «Cortesía». |
| Meter animaciones largas | Se opera apurado, de noche. Nada sobre 150 ms. |
| Rediseñar la web pública o el linktree | Ya están hechos y aprobados. Esto es **solo el admin**. |

---

## 7. Contexto extra que puede servirte

- **La decoración automática ya existe.** `frate-afiche.js` genera afiches de puro texto (caligrama de fondo + título sólido encima + mosaico de emoji) cuando un evento no trae foto. Si diseñas algo que muestre un evento dentro de un modal, puedes apoyarte en eso en vez de inventar otra cosa.
- **Cada tipo de entrada declara qué es**, en una columna `clase`: `venta` · `cortesia` · `puerta` · `prueba`. Esa es la única fuente de verdad. Si diseñas algo que distingue entradas pagadas de regaladas, léelo de ahí.
- **Puntos y premios está apagado** por decisión de Pablo. Si ves modales de lealtad o membresías, están congelados: no los priorices.

---

## 8. Por dónde partir

Si solo puedes hacer una cosa: **la Entrega A, en móvil de 390px.**
Es la que desbloquea las otras 18 pantallas, y el teléfono de noche es el caso real.

Después, **`modal-evento`** — es el que más se usa y el que mejor muestra si el patrón funciona.
