# FRATE · Sincronización WEB → ERP: Cortesías + Puerta (check-ins)

Documento para el equipo del **ERP** (proyecto `zsilmm…`, `erp.frate.cl`).
La **WEB** (`ydwlpra…`, `frate.cl`) ya le envía al ERP eventos de `pago`, `reserva`,
`cumpleanos`, `puntos`, `credito`. Este documento agrega **2 tipos nuevos** para que
el ERP muestre lo mismo que la WEB: **cortesías emitidas** y **validaciones de puerta**.

## Transporte (igual que hoy)
- **Endpoint:** `POST https://erp.frate.cl/api/crm-webhook`
- **Auth:** header `x-api-key: <CRM_WEBHOOK_KEY>` (la misma llave que ya usan).
- **Body:** JSON. Puede venir **un objeto** o **un array de objetos** (batch).
- **Respuesta esperada:** `2xx` = recibido. `4xx` (salvo 429) = la WEB **no reintenta**
  (lo trata como "malformado / tipo no soportado"). `5xx`/`429`/timeout = la WEB
  **reintenta** (2s, 8s) y si falla lo **encola** y lo drena después. → El ERP **debe
  responder 2xx** apenas guarda, aunque sea idempotente.

## Idempotencia (obligatorio)
La WEB puede reenviar el mismo evento (reintentos/cola). El ERP **debe deduplicar**:
- `cortesia_emitida` → clave única por **`qr`**.
- `checkin` → clave única por **`qr`** (una persona entra una vez).

## Tipo 1 · `cortesia_emitida`
Se emite una por **cada QR de cortesía** creado en la WEB (importación masiva o listas).

```json
{
  "tipo": "cortesia_emitida",
  "qr": "FCC-001518-1",             // ← CLAVE única
  "web_pedido_id": 1518,            // pedido en la WEB
  "evento_web_id": 42,              // id del evento en la WEB (eventos.id)
  "nombre": "SOFIA PAZ SILVA SÁNCHEZ",
  "rut": "21.676.118-9",
  "email": "sofiaa.silvaa2004@gmail.com",
  "tipo_ticket": "LISTA VIP FUEGO (VÁLIDA HASTA LAS 02:30 HRS)",
  "emitida_at": "2026-07-15T03:12:00Z"
}
```

## Tipo 2 · `checkin`
Se emite una por **cada validación en la puerta** (cuando se quema un QR).

```json
{
  "tipo": "checkin",
  "qr": "FCC-001518-1",             // ← CLAVE única
  "web_pedido_id": 1518,
  "checked_at": "2026-07-16T04:29:00Z",
  "validador": "validadorfrate@gmail.com",
  "incidencia": null                 // o texto si hubo incidencia
}
```
> El ERP resuelve nombre/tipo/evento **por el `qr`** (ya lo conoce desde
> `cortesia_emitida` o desde el `pago` de una entrada vendida). Por eso el `checkin`
> va liviano.

## Lo que el ERP debe implementar
1. En `/api/crm-webhook`, aceptar los `tipo` nuevos (`cortesia_emitida`, `checkin`).
   Hoy probablemente solo maneja `pago`/`reserva`/`cumpleanos` → **no rechazar** los nuevos.
2. Guardar cada uno (con dedupe por `qr`).
3. Sumar contadores por `evento_web_id`: **emitidas**, **cortesías**, **entraron**,
   **no usados** (= emitidas − entraron).
4. Mapear `evento_web_id` → su evento interno (ya deberían tener ese mapa por los `pago`).
5. **Responder 2xx** aunque sea repetido.

## Lo que hace la WEB (ya construido, se activa cuando el ERP confirme)
- Un **emisor desacoplado** (`sync-erp`) que **lee** `items_pedido`/`qr_usados` y
  empuja estos eventos con la **cola + reintentos** que ya existe (no toca la puerta
  ni la venta). Corre cada ~2 min por cron.
- Registro `erp_sync_log` (clave por `qr`) para **no reenviar** lo ya entregado.

## Orden de activación (importante)
1. El **ERP** deja su endpoint aceptando los 2 tipos + dedupe por `qr` + responde 2xx.
2. Recién ahí se **activa el cron** del emisor en la WEB.
   (Si se activa antes, los eventos se **encolan** hasta que el ERP esté listo — no se
   pierden, pero no se entregan.)
