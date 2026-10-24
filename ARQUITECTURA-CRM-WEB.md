# ARQUITECTURA CRM — Web frate.cl ↔ ERP FRATE

> **Documento de respuesta** (2026-07-06) al `ARQUITECTURA-CRM-ERP.md` v2. Lado web: frate.cl (HTML/JS estático + Supabase `ydwlpraoaaijlfssevoh` — Edge Functions Deno + Postgres con pg_cron/pg_net operativos — Vercel `frate-webpage`). Acata las **12 decisiones del §8** del documento del ERP; ninguna resultó imposible en este stack. Dos definiciones adicionales del negocio ya confirmadas: **(a)** la sección Reservas de la web (hoy oculta) se prenderá al desplegar el puente, con formulario nuevo por tipo; **(b)** el chatbot "El Anfitrión" también podrá captar solicitudes conversando (origen `anfitrion`).
>
> ⚠️ Documento SOLO descriptivo/contractual. No implica cambios de código todavía. Lo marcado **[NUEVO]** se construirá en la fase de implementación.

---

## 1. Esquema real de la web

### 1.1 Dónde vive cada tipo

| Tipo del contrato | Tabla web | `web_id` | ¿Existe hoy como flujo del cliente? |
|---|---|---|---|
| `reserva` | `reservas` (existente, se extiende) | `reservas.id` (serial) | PARCIAL — form básico, sección oculta |
| `cumpleanos` | `reservas` (misma tabla, `tipo='cumpleanos'`) | `reservas.id` (misma secuencia — sin colisión: el par (`tipo`,`web_id`) sigue siendo único) | PARCIAL — hoy es una reserva con tipo texto libre |
| `lista` (inscripción) | `lista_inscritos` **[NUEVO]** (+ `listas` **[NUEVO]** como definición) | `lista_inscritos.id` (serial) · `lista_web_id` = `listas.id` | NO — declarado en Faltantes |
| `invitacion_rrpp` | `invitaciones_rrpp` **[NUEVO]** | `invitaciones_rrpp.id` (serial) | NO — declarado en Faltantes |

**Estabilidad de `web_id` (decisión 3): garantizada.** Todos son `serial` de Postgres: nunca se reciclan ni cambian. La web hará las acciones del ERP idempotentes por (`tipo`, `web_id`).

### 1.2 `reservas` — hoy y extensión propuesta

**Columnas actuales:** `id` (serial PK), `nombre` (text), `tipo` (text libre — ej. "CUMPLEAÑOS ESPECIAL", "RESERVA & MESA VIP"), `fecha` (date), `personas` (int), `telefono` (text), `estado` (text: `pendiente | confirmada | cancelada` — sin CHECK), `cliente_id` (uuid FK → `clientes`, nullable: se permite invitado sin cuenta), `created_at` (timestamptz).

**Extensión [NUEVO] para cumplir §4.1/§4.2:** `tipo` normalizado a `reserva | cumpleanos`; nuevas columnas `rut`, `email`, `instagram`, `evento_id` (int FK → `eventos`, nullable — decisión 8), `zona_preferida`, `presupuesto` (int CLP), `consumo_minimo_ofrecido` (int), `quiere_botellas` (bool), `quiere_decoracion` (bool), `quiere_mesa` (bool), `fecha_nacimiento` (date — cumpleaños), `comentario` (text), `origen` (`web_form | anfitrion | admin`), y las columnas de respuesta del ERP: `mesa_nombre`, `mesa_zona`, `condiciones` (text), `nota_cliente` (text), `abono_requerido` (int), `pagado_monto`/`pagado_medio`, `motivo_rechazo`, `updated_at`.

### 1.3 `listas` + `lista_inscritos` **[NUEVO]**

- **`listas`**: `id` (serial PK), `nombre`, `evento_id` (nullable), `fecha` (date NOT NULL), `cupos` (int, definidos por el ERP al aprobar), `valido_hasta` (timestamptz), `duenio_id` (uuid FK → `clientes`, si la lista la pide un RRPP), `codigo` (text — código RRPP asociado si aplica), `estado` (`pendiente | aprobada | rechazada | cerrada`), `motivo_rechazo`, `origen`, `created_at/updated_at`.
- **`lista_inscritos`**: `id` (serial PK = `web_id` del tipo `lista`), `lista_id` (FK CASCADE), `nombre` NOT NULL, `rut`, `telefono`, `email`, `instagram`, `acompanantes` (int, 0), `comentario`, `estado` (`pendiente | aprobado | rechazado`), `pedido_cortesia_id` (int FK → `pedidos` — se llena al aprobar), `qr_ids` (jsonb — copia de los QR generados), `origen` (`web_form | erp` — decisión: la nómina que mande el ERP en `aprobar_lista` que no exista se crea con origen `erp`), `motivo_rechazo`, `created_at/updated_at`.
- Regla §4.3 (al menos UNO de rut/teléfono/email) se valida en el endpoint de creación.

### 1.4 `invitaciones_rrpp` **[NUEVO]**

`id` (serial PK), `codigo_id` (FK → `codigos`), `codigo` (text — snapshot), `duenio_id` (uuid — dueño del código), `evento_id` (nullable), `fecha` (date NOT NULL), `nombre` NOT NULL, `rut`, `telefono`, `email`, `instagram`, `personas` (int, 1), `estado` (`pendiente | aprobado | rechazado`), `pedido_cortesia_id`, `qr_ids` (jsonb), `motivo_rechazo`, `origen`, `created_at/updated_at`.

### 1.5 `codigos` + `duenio_id` (RRPP)

`id` (serial PK), `codigo` (text UNIQUE, MAYÚSCULAS), `tipo` (`descuento | rrpp`), `rrpp_nombre` (text), **`duenio_id` (uuid FK → `clientes.id` ON DELETE SET NULL)** — el dueño es una CUENTA de la web con `clientes.rol='rrpp'`, `descuento_tipo` (`porcentaje | monto | null`), `descuento_valor` (int), `evento_id` (nullable), `max_usos` (int nullable), `usos` (int), `activo` (bool), `created_at`. Cada venta pagada guarda `pedidos.codigo_id` + `codigo_texto` → la web informa el código usado en cada hecho (decisión 7). El RRPP se identifica ante el ERP por `duenio_id` (uuid) + `username`.

### 1.6 Cortesías — cómo se generan y cómo serán nominativas vía API

Hoy (flujo admin, ya en producción): se inserta `pedidos {metodo_pago:'cortesia', estado:'pagado', total:0, nombre_cliente, email_cliente}` + `items_pedido {producto_tipo:'ticket', evento_id, nombre_evento, nombre_ticket:'Cortesía', cantidad, personas:[{nombre,rut}...], qr_ids:['FCC-<pedido>-...','...'], precio_unitario:0}`. Los QR son únicos por posición, se envían por correo (send-receipt) y se validan en **frate.cl/validacion** (RPCs de puerta) exactamente igual que un ticket pagado — incluida la búsqueda por RUT.

**Vía API (decisión 5):** `api-crm` replicará ese flujo con service-role al recibir `aprobar_lista` / `aprobar_inscripcion` / `aprobar_invitacion_rrpp`: 1 pedido-cortesía por inscrito (o por lote, un pedido con N personas — se hará por inscrito para trazabilidad 1:1 con `web_id`), SIEMPRE nominativo (`nombre` + `rut`; si el RUT falta, la aprobación se rechaza con error `rut_requerido`, coherente con la regla del ERP). La respuesta devuelve los `qr_ids` generados.

---

## 2. Especificación del edge function dedicado `api-crm` (decisión 1)

- **URL:** `https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-crm`
- **Auth (ERP→web):** header `x-api-key` validado contra el secret que la web ya tiene para este sentido. ⚠️ **Nota de nombres para evitar confusión:** esa llave se llama `WEB_API_KEY` en el Vercel del ERP y `ERP_API_KEY` en los secrets de Supabase de la web — **es la MISMA llave existente** (la que ya usa `api-evento`). La llave NUEVA de la decisión 10 es solo para el sentido web→ERP (ver §3).
- **Formato (decisión 11):** JSON UTF-8. `POST` acepta `{accion, payload}` **o** un array de esos objetos (lote máx. **500**). `GET` para lecturas.

### 2.1 POST — acciones (lista cerrada, §5 del doc ERP)

Envelope por ítem: `{ "accion": "...", "payload": { ... }, "actor": "nombre operador", "enviado_at": "ISO" }`.

| Acción | Efecto en la web | Respuesta (`resultado` por ítem) |
|---|---|---|
| `confirmar_reserva` | `reservas.estado='confirmada'` + guarda `mesa/zona/consumo_minimo/abono_requerido/nota_cliente` + **correo al cliente** | `{ok:true, web_id, estado:'confirmada'}` |
| `rechazar_reserva` | `estado='rechazada'` + motivo + correo | `{ok:true, web_id, estado:'rechazada'}` |
| `confirmar_cumpleanos` | ídem reserva (misma tabla) + `beneficios/condiciones` | ídem |
| `rechazar_cumpleanos` | ídem | ídem |
| `aprobar_lista` | `listas.estado='aprobada'` + `cupos` + `valido_hasta`; materializa cortesías de los inscritos `pendiente` (y crea los de `nomina[]` que no existan, origen `erp`); correo por inscrito | `{ok:true, lista_web_id, aprobados:[{web_id, nombre, rut, qr_ids:[...], qr_urls:[...]}]}` |
| `rechazar_lista` | `estado='rechazada'` + motivo | `{ok:true, lista_web_id}` |
| `aprobar_inscripcion` | inscrito → `aprobado` + cortesía nominativa + correo con QR | `{ok:true, web_id, qr_ids:[...], qr_urls:[...]}` |
| `rechazar_inscripcion` | `rechazado` + motivo (+ correo si hay email) | `{ok:true, web_id}` |
| `aprobar_invitacion_rrpp` | ídem inscripción sobre `invitaciones_rrpp` | `{ok:true, web_id, qr_ids:[...], qr_urls:[...]}` |
| `rechazar_invitacion_rrpp` | ídem | `{ok:true, web_id}` |
| `marcar_pagado` | guarda `pagado_monto/pagado_medio` en la reserva/cumple (no toca estado) | `{ok:true, web_id}` |

- **`qr_urls`**: imagen del QR lista para usar: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=<qr_id>` (mismo generador que usan los correos de la web). El código canónico es el `qr_id` (`FCC-...`).
- **Idempotencia (decisión 3):** re-aplicar una acción ya aplicada responde `{ok:true, idempotente:true, ...}` con los MISMOS `qr_ids` (no genera cortesías nuevas: se releen del inscrito).
- **Errores por ítem** (el lote no se corta): `{ok:false, web_id, error:'no_encontrada'|'estado_invalido'|'rut_requerido'|'sin_stock'|...}`. Respuesta del lote: `{ok:true, resultados:[...]}`.

### 2.2 GET — lecturas para el ERP

- `GET api-crm?desde=<ISO>` → **reconciliación**: todas las solicitudes de los 4 tipos creadas o actualizadas desde ese timestamp, en el formato del §4 del doc ERP (envelope `tipo` + `web_id`), con su `estado` actual. Incluye las `actualizacion` (cancelaciones) por si un webhook se perdió.
- `GET api-crm?catalogo=rrpp` → catálogo RRPP (ver §5).
- `GET api-crm?checkins&fecha=YYYY-MM-DD` → check-ins de la noche (ver §6).

---

## 3. Webhook saliente web → ERP (decisión 2)

**Diseño concreto en este stack (edge functions + pg_cron/pg_net ya operativos en esta base):**

1. **Emisión inmediata:** cada punto de la web que crea/cambia una solicitud (edge function **[NUEVO]** `crm-solicitud` para el formulario público y el Anfitrión; `api-crm` para cambios que gatilla el propio flujo) hace `POST https://erp.frate.cl/api/crm-webhook` **en línea** tras confirmar la escritura en la base.
2. **Payload:** los JSON del §4 del doc ERP **tal cual, con esos nombres de campo** (confirmado: la web los produce nativamente; el mapeo campo-a-campo es directo porque las columnas nuevas de §1.2–1.4 se diseñaron espejo del contrato). Un objeto o array (lote máx. 500). Cancelación/modificación → envelope `{tipo:'actualizacion', web_id, tipo_original, cambio, detalle, actualizado_at}` (decisión 12: **SIEMPRE**, incluso confirmadas).
3. **Reintentos (mínimo 3, espera creciente):** intento en línea → si respuesta no es 2xx (o timeout), reintenta a los ~2 s y ~8 s dentro de la misma invocación. Si aún falla, **encola** en tabla **[NUEVO]** `crm_webhooks_pendientes` (`id, payload jsonb, intentos, ultimo_error, proximo_intento, created_at`).
4. **Cola de respaldo:** job **pg_cron cada 5 minutos** (mismo mecanismo ya productivo del cron de recordatorios) invoca el edge **[NUEVO]** `crm-reintentos`, que despacha lo pendiente con backoff exponencial (5 min → 15 → 45 → 2 h, tope 24 h y máx. 10 intentos; después queda `fallido` visible en el admin web). Resultado: si el ERP está caído horas, **nada se pierde** — se entrega al volver, y el polling de reconciliación (`?desde=`) cubre cualquier residuo.
5. **Auth del sentido web→ERP:** header `x-api-key` con la **llave NUEVA dedicada** (decisión 10). Nombres por lado: en el ERP vivirá como env **`ERP_API_KEY`** (como definió su doc); en la web vivirá como secret de Supabase **`CRM_WEBHOOK_KEY`** (nombre distinto a propósito: en la web `ERP_API_KEY` ya está tomado por la llave del sentido contrario). **No se pega en chats/repos:** ver §7.

---

## 4. Estados y notificación al cliente (decisiones 4 y 9)

- **Confirmado: la web agrega `rechazada`.** Mapeo homologado en los 4 tipos: `pendiente → confirmada | rechazada | cancelada` (reserva/cumpleaños) y `pendiente → aprobado | rechazado` (inscritos de lista e invitaciones RRPP; su lista: `pendiente → aprobada | rechazada | cerrada`). `cancelada` solo la produce el cliente (o el admin web en su nombre); `rechazada` solo llega desde el ERP. `reservas.estado` es text sin CHECK: agregar el valor no rompe nada; el selector del admin web sumará la opción.
- **Canal de aviso al cliente (lo que la web usa HOY):** **correo** vía Resend (`tickets@frate.cl` — mismo canal productivo de comprobantes y devoluciones) + **estado visible en frate.cl → Mi cuenta** para usuarios con sesión. Al recibir `confirmar_*` el correo incluye `mesa/zona`, `condiciones`, `abono_requerido` y la `nota_cliente` del ERP; al recibir `rechazar_*`, el `motivo`/`nota_cliente`. **WhatsApp automatizado NO existe en la web** (solo enlaces `wa.me` manuales): si el negocio quiere WhatsApp push al cliente, el emisor natural es el bot del ERP — se deja declarado en Faltantes, sin bloquear v1 (decisión 9 se cumple con correo + Mi cuenta).
- Aprobaciones de lista/invitación → el correo lleva **los QR de cortesía** (mismo template de comprobante ya productivo).

## 5. Catálogo RRPP (decisión 7)

- **Entrega dentro de `api-crm`:** `GET api-crm?catalogo=rrpp` →
```json
[{ "duenio_id": "uuid", "nombre": "PABLO HIDALGO", "username": "@pablorrpp", "activo": true,
   "codigos": [{ "codigo": "PABLO10", "codigo_id": 7, "evento_id": null, "activo": true, "usos": 34 }] }]
```
(cuentas `clientes.rol='rrpp'` + sus `codigos` por `duenio_id`).
- **Cada hecho lleva su código:** las invitaciones RRPP llevan `codigo` + `duenio_id` en el payload (§4.4); las VENTAS pagadas con código ya guardan `codigo_id`/`codigo_texto` y el ERP puede leerlas por `api-evento` (asistentes incluyen orden) — si el ERP prefiere un feed de ventas-por-código listo, se agrega `GET api-crm?ventas_rrpp&desde=` como extensión v1.1 (declarado, no comprometido en v1). **La web solo informa hechos; comisiones y estadísticas las calcula el ERP.**

## 6. Puerta / check-ins (decisión 6)

- Confirmado: **todo lo nacido en la web se valida en frate.cl/validacion** (QR o búsqueda por RUT; roles admin/portero; RPCs atómicas — un QR no se quema dos veces).
- **Lectura para el ERP:** ya puede leer asistentes/check-ins por `evento_id` vía `api-evento` (patrón productivo con TicketsPreventasCard). **Se agrega** `GET api-crm?checkins&fecha=YYYY-MM-DD` **[NUEVO]** que responde por FECHA de la noche (regla 05:00 compartida) con filtro de origen: `[{qr_id, nombre, rut, hora_ingreso, escaneado_por, origen: 'venta'|'cortesia', tipo_origen: 'lista'|'invitacion_rrpp'|'reserva'|null, web_id_origen, lista_web_id}]` — así el ERP contabiliza ingresos por lista/invitación sin inferencias.

## 7. Límites y llaves (decisiones 10 y 11)

- **Límites reales de las edge functions (Supabase):** sin rate limit nativo por llave; body hasta ~20 MB técnico. Compromisos de contrato: **lote máx. 500 ítems confirmado**, payload recomendado < 1 MB, y `api-crm` aplicará un **límite defensivo propio** (rechazo `429` sobre ~60 requests/min por llave, implementado en la función). Timeout de invocación: holgado para lotes de 500 (las cortesías se generan por inscrito; peor caso se responde por lote parcial con `resultados`).
- **Llaves por sentido (decisión 10):**
  - ERP→web: **la existente** (ERP la llama `WEB_API_KEY`; en la web es el secret `ERP_API_KEY`). Sin cambios.
  - web→ERP: **nueva**, generada por la web (`openssl rand -hex 32`), instalada como secret `CRM_WEBHOOK_KEY` (Supabase web) y entregada al ERP para su env `ERP_API_KEY` **por canal seguro: en persona / gestor de contraseñas compartido — nunca chat ni repo**. Propuesta operativa: el dueño la genera y la pega directamente en ambos paneles (Supabase Secrets y Vercel ERP) sin intermediarios.
  - **Rotación independiente** por sentido: cambiar una no afecta la otra.

## 8. Faltantes y dudas para el ERP

### Faltantes del lado web (se construirán en la implementación — nada bloquea el contrato)
1. **Listas gratuitas e invitaciones RRPP no existen hoy como flujo del cliente**: se crean las tablas (§1.3–1.4), el formulario público y el flujo del RRPP (crear su lista/invitar desde su panel web).
2. **El formulario de reservas actual es básico**: se reemplaza por el formulario por tipo (🍾 Mesa / 🎂 Cumpleaños / 📋 Lista) con los campos del §4 del doc ERP. La sección Reservas (hoy oculta) se prende al desplegar.
3. **Webhook saliente + cola de reintentos no existen**: diseño del §3 (edge `crm-solicitud`, tabla `crm_webhooks_pendientes`, edge `crm-reintentos`, cron 5 min).
4. **Estado `rechazada` no existe**: se agrega (cambio trivial, sin migración destructiva).
5. **WhatsApp saliente automatizado no existe en la web**: v1 notifica por correo + Mi cuenta. Alternativa futura declarada: que el ERP dispare su bot de WhatsApp usando el teléfono que viaja en cada solicitud.
6. **`clientes.instagram` no existe** como columna (el registro web no lo pide): en v1 el instagram viaja cuando el formulario lo capture por tipo; para ventas normales irá vacío.

### Dudas para el ERP
1. **Ack del webhook:** si `api/crm-webhook.js` recibe un `tipo` que aún no procesa (ej. `invitacion_rrpp` antes de construir su lado RRPP), ¿responde `200 {ok:true, ignorado:true}`? Lo necesitamos para no encolar reintentos eternos. Propuesta: 4xx solo para payload malformado o llave inválida; todo lo demás 200.
2. **Sin eco:** proponemos que la web NO envíe `actualizacion` por cambios que origina el propio ERP vía `api-crm` (solo cambios del cliente/web). ¿De acuerdo? (Evita loops y ruido en la campanita.)
3. **`aprobar_lista` con `nomina[]` que difiere de los inscritos web:** confirmar la regla propuesta — los de la nómina que no existan se CREAN aprobados (origen `erp`) y generan cortesía; los inscritos web que NO vengan en la nómina quedan `pendiente` (no se rechazan solos). ¿OK?
4. **URL definitiva del webhook:** confirmar `https://erp.frate.cl/api/crm-webhook` y el JSON de respuesta esperado (`{ok:true}`).
5. **Canal seguro elegido para la llave** `CRM_WEBHOOK_KEY`→`ERP_API_KEY` (§7): confirmar que el dueño la instala directo en ambos paneles.

---

## Anexo — Plan de implementación web (para cuando se apruebe este documento)
1 SQL (`frate-crm.sql`: extensión `reservas`, tablas nuevas, cola, cron) → 2 edge functions `crm-solicitud` (cliente crea, webhook out) / `api-crm` (ERP lee y actúa) / `crm-reintentos` → 3 formulario público por tipo + panel del RRPP web + Anfitrión captando solicitudes → 4 admin web: bandeja "Solicitudes CRM" espejo (lectura + estado del webhook) → 5 pruebas punta a punta con el ERP.
