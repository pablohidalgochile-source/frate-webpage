# Contrato de integración WEB ↔ ERP · FRATE

> ## ⚠️ ENMIENDA 2026-07-09 — Inbox + canales los administra la WEB
> Cambio de modelo confirmado por el dueño: **la Anfitriona administra en la WEB**, y la WEB toma **TODOS los canales de cliente** (chat web + WhatsApp + Instagram) directo en su Meta. Se **REVIERTE** el "inbox único = ERP".
> - ❌ **Cancelado `inbound_chat` (§1a):** el ERP ya no relaya chat entrante. El endpoint responde `{ok:false, error:'inbound_chat descontinuado…'}`.
> - ❌ **Cancelado el push de web-chat al ERP (§1b):** el inbox vive en la WEB; ya no se notifica al ERP al escalar.
> - El ERP **retira su bot vendedor** de cara al cliente. Los números de WhatsApp/Instagram de clientes los toma la WEB en su propio Meta.
> - ✅ **Sigue TODO lo demás:** el ERP recibe reservas/cumples/listas/RRPP por el webhook, aprueba/rechaza y devuelve la decisión; la WEB fabrica QR y avisa al cliente; el **veto (`crm-check`)** y la **puerta-lectora** del ERP quedan igual.
> - ✅ **`crear_lista`** (`frate.cl/lista/CODIGO`) para el frate-link del ERP: **construido y desplegado** de nuestro lado.
> - ⏳ Pendiente del dueño: confirmar `ERP_VETO_URL` en los secrets del ERP.

**Base WEB** (Supabase Edge Functions): `https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/`
**Base ERP:** `https://erp.frate.cl/api/`

**Autenticación (ERP → WEB):** header `x-api-key: <ERP_API_KEY>` (la MISMA llave que el ERP guarda como `WEB_API_KEY` / `CRM_WEBHOOK_KEY`). La genera **el dueño** e instala en ambos paneles. **Nunca por chat.**
**Autenticación (WEB → ERP):** header `x-api-key: <ERP_API_KEY>` (misma llave).
**Formato POST de api-crm:** `{ accion, payload }` **o un array** de esos objetos (lote ≤ 500). Respuesta de lote: `{ ok, resultados:[...] }` en el mismo orden.
**Idempotencia:** cada sección indica su clave.

Leyenda: 🟢 ya existe y desplegado · ✅ **construido y desplegado en esta tanda** · ⛔ lo construye el ERP.

> **Estado:** todo lo marcado ✅ ya está **live** en `api-crm` / `anfitrion-conversar` / `lista-precheck`. Queda: que el ERP levante sus 3 endpoints (⛔) y que el dueño instale la llave + las URLs (ver **Config** al final) + corra 2 SQL.

---

## 1. INBOX ÚNICO
Shape común de mensaje: `{ conversacion_id, canal:"web"|"whatsapp"|"instagram", rol:"cliente"|"bot"|"humano", texto, media, ts (ISO8601) }`

### 1a. ERP → Anfitrión (cerebro del bot) ✅
El ERP reenvía cada inbound (WhatsApp/IG) a nuestro Anfitrión, que responde o escala.
`POST api-crm`
```json
{ "accion":"inbound_chat",
  "payload":{ "canal":"whatsapp", "external_id":"<id del usuario en el canal>",
              "texto":"hola, quiero un cumpleaños", "contacto":{ "nombre":"", "telefono":"" } } }
```
Resp: `{ ok:true, conversacion_id, responder:"texto"|null, escalar:bool, estado:"bot"|"esperando_humano" }`
- `responder` → el ERP lo manda al canal. Si `escalar:true` → lo toma un humano y responde por su canal.
- El hilo se mantiene por `(canal, external_id)`. Anfitrión caído → responder cae a un fallback y `estado:"bot"`; el ERP puede reintentar (idempotente por conversación).

### 1b. Web-chat → inbox del ERP ✅ (dispara la WEB; el endpoint lo expone el ERP ⛔)
Cuando un chat **web** escala a humano, la WEB hace push:
`POST erp.frate.cl/api/crm-webhook` · header `x-api-key`
```json
{ "tipo":"chat", "escalado":true, "conversacion_id":"<uuid>", "canal":"web",
  "rol":"cliente", "texto":"<último mensaje del cliente>", "media":null, "ts":"ISO8601" }
```
- No-op hasta que el dueño configure `ERP_WEBHOOK_URL` + llave (ver Config). Timeout 2,5 s, best-effort (no bloquea el chat).
- Alternativa/complemento ya disponible: el ERP puede **tirar** los chats con `GET api-crm?chats&desde=ISO` 🟢.

### 1c. Respuesta del humano del ERP → cliente 🟢
- Canal WEB: `POST api-crm { accion:"responder_canal", payload:{ conversacion_id, texto, cerrar?:bool } }` → lo insertamos como `rol:"humano"` y el widget lo muestra (polling). Con `cerrar:true` cierra la conversación.
- Canal WhatsApp/IG: el ERP responde por su canal (Meta). Opcional: nos manda copia con **1b** para el registro unificado.

---

## 2. PUERTA OFFLINE (el ERP valida contra NUESTROS QR)
Token canónico = `qr_token` (string `FCC-…`). La imagen del QR codifica exactamente ese string.

### 2a. Snapshot — cachear al abrir la puerta ✅
`GET api-crm?snapshot_qr&fecha=YYYY-MM-DD` · header `x-api-key`
Resp:
```json
{ "fecha":"2026-07-10", "count":128, "generado_ts":"ISO8601",
  "qrs":[ { "qr_token":"FCC-457-CRM-0-0", "nombre":"FRAN MERIDA", "rut":"19.421.894-K",
            "tipo":"cortesia"|"venta", "nombre_ticket":"Lista: Mujeres",
            "condiciones":{...}|null, "ya_usado":false, "usado_ts":null } ] }
```
- Incluye **todos** los QR de eventos cuya `fecha` = la pedida, con pedido `pagado`. `ya_usado`/`usado_ts` vienen así la puerta arranca sabiendo quién ya entró. (Tope 5000; avisar si un evento lo supera.)

### 2b. Quemar / validar — idempotente ✅
`POST api-crm` (uno) **o array** (lote ≤ 500, ideal para sincronizar offline):
```json
{ "accion":"validar_qr", "payload":{ "qr_token":"FCC-457-CRM-0-0", "gate_id":"puerta-1", "ts":"ISO8601" } }
```
Resp OK (primera vez): `{ ok:true, qr_token, ya_usado:false, primera_vez_ts, gate_id }`
Resp OK (repetido): `{ ok:true, qr_token, ya_usado:true, primera_vez_ts, gate_id_previo }`
Resp error: `{ ok:false, qr_token, error:"qr_no_existe"|"no_pagado" }` · o `{ ok:false, error:"falta_qr_token" }`
- **Idempotente por `qr_token`**: se quema UNA vez. El resto vuelve `ya_usado:true` con el `primera_vez_ts` original.
- **Doble-uso**: si `gate_id_previo` ≠ el gate que reintenta → la persona ya entró por otra puerta; el ERP lo marca para revisión (post-mortem, no se le niega la entrada en vivo).

### 2c. Offline + reconciliación
Sin internet, la puerta valida contra el snapshot y quema local con `ts` de dispositivo. Al reconectar manda el **array** de `validar_qr` (2b). Nosotros deduplicamos por `qr_token` y devolvemos los `ya_usado` para que el ERP concilie.

---

## 3. VETOS / EXPULSADOS (pre-análisis) — el ERP expone, la WEB consume ✅ (WEB) / ⛔ (endpoint ERP)
Split: la WEB hace campo (RUT/DV, menor por fecha nac, campos, duplicados web). El ERP expone veto/historial.
Nuestro `lista-precheck` llama **por lote** antes de la aprobación humana. Mandamos la nómina
con **nombre** además del RUT, porque en el ERP el veto parte por NOMBRE (al expulsar no siempre
hay RUT). El ERP matchea por nombre normalizado o por RUT, y responde **keyed por el RUT que enviamos**:
`POST erp.frate.cl/api/crm-check` · header `x-api-key`
```json
{ "personas":[ { "rut":"19.421.894-K", "nombre":"FRAN MERIDA" }, { "rut":"", "nombre":"JUAN PÉREZ" } ] }
```
Resp (keyed por RUT, en cualquier formato — normalizamos):
```json
{ "19.421.894-K":{ "vetado":true, "motivo":"expulsado 2025-11", "frecuente":false, "historial":{...} },
  "12.345.678-9":{ "vetado":false, "frecuente":true } }
```
- Los `vetado:true` salen 🔴 (bandera **🚫 VETADO · motivo**) y desmarcados; `frecuente:true` sale 🟡 **⭐ Frecuente**.
- Batch por lista, sin cachear la base de vetos (siempre al día + privacidad). No-op hasta configurar `ERP_VETO_URL` + llave. Nunca bloquea el pre-análisis (timeout 4 s).

---

## 3b. CREAR LISTA — el "frate link" del ERP (decisión 7) ✅
El ERP crea la lista en la web y recibe la **URL pública**; la inscripción, el QR y el correo los hace la web.
`POST api-crm` · header `x-api-key`
```json
{ "accion":"crear_lista",
  "payload":{ "tipo":"lista"|"mujeres"|"embajadora"|"rrpp",
              "nombre":"Lista Mujeres Viernes", "fecha":"2026-07-18",
              "evento_web_id":12, "cupos":50,
              "rrpp":{ "codigo":"PABLO10", "duenio_id":"<uuid>", "nombre":"Pablo" } } }
```
Resp: `{ ok:true, lista_web_id, codigo, url:"https://www.frate.cl/lista/<codigo>" }`
- `codigo`: usa el de `rrpp.codigo`/`codigo` si viene; si no, generamos uno único. `tipo:"mujeres"` fija `genero_esperado=F`. La lista nace `estado:aprobada` (abierta para inscripción). `origen:erp`.

## 4. PAGO (ya vigente) 🟢
`POST erp.frate.cl/api/crm-webhook { tipo:"pago", web_id, external_reference, estado:"aprobado", monto, medio:"mercadopago" }`. Idempotencia `(tipo, web_id)`.

## 5. CATÁLOGO DE PAQUETES 🟢
El dueño edita en el admin WEB (Storage para fotos). El ERP solo lee:
`GET api-crm?catalogo=paquetes` → `{ paquetes:[{ id, categoria, nombre, descripcion, incluye, precio, condiciones, foto_url, orden }] }`.

---

## Config (la instala el DUEÑO — nunca por chat)
**Secrets en Supabase WEB** (`supabase secrets set … --project-ref ydwlpraoaaijlfssevoh`):
- `ERP_API_KEY` — la llave compartida (ya existe; es la que valida api-crm).
- `ERP_WEBHOOK_URL = https://erp.frate.cl/api/crm-webhook` — para el push de web-chat (1b).
- `ERP_VETO_URL = https://erp.frate.cl/api/crm-check` — para el veto por lote (3).

**SQL a correr en Supabase WEB** (SQL editor):
- `frate-erp-puerta.sql` — columnas `qr_usados.gate_id` / `ts_dispositivo` + idempotencia dura por `qr_token`.
- `frate-erp-inbox.sql` — columna `conversaciones.external_id` + índice `(canal, external_id)`.

> Las funciones **degradan suave** sin esto (no crashean), pero: sin las URLs no hay push/veto; sin el SQL de inbox cada inbound abriría hilo nuevo; sin el de puerta no se guarda `gate_id`.

## Orden sugerido
1. Puerta offline (2) — más sensible, ya live nuestro lado · 2. Inbox (1) · 3. Vetos (3) · 4/5 ya listos.
