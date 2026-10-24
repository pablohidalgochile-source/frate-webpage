# Hand-off · Puerta EN VIVO: WEB → ERP (`/api/crm-webhook`)

> Para el equipo/Claude del **proyecto ERP** (`erp.frate.cl`, Supabase `zsilmm…`).
> Lo manda la **WEB** (frate.cl, Supabase `ydwlpra…`). Contrato ya en producción para
> `checkin` + `cortesia_emitida`; este doc agrega **`venta`** y **`totales`**.

---

## 1) ¿Qué es?

La WEB empuja al ERP, **en tiempo real**, todo lo que ocurre en la puerta de cada evento:

| `tipo` | Qué es | Estado |
|--------|--------|--------|
| `checkin` | cada escaneo/ingreso en la puerta | ✅ ya lo recibes |
| `cortesia_emitida` | cada cortesía entregada | ✅ ya lo recibes |
| `venta` | cada entrada **pagada** (no cortesía) | 🆕 **implementar** |
| `totales` | snapshot por evento: aforo + recaudado | 🆕 **implementar** |

El objetivo: que el ERP tenga el CRM y el pulso del evento (quién entró, cuánto se vendió, aforo) **sin que nadie apriete nada**.

---

## 2) ¿Cómo te lo envío? (contrato HTTP)

- **Método / URL:** `POST https://erp.frate.cl/api/crm-webhook`
- **Auth:** header `x-api-key: <CRM_WEBHOOK_KEY>` (el mismo secreto que ya usas hoy)
- **Content-Type:** `application/json`
- **Body:** SIEMPRE un **array** de eventos (lotes de hasta 50). Aunque sea 1 evento, va como array.
- **Emisor:** edge function `sync-erp` (Supabase WEB) → helper `enviarWebhookERP` (`_shared/crm.ts`).
- **Disparo (tiempo real):** un trigger `pg_net` en `qr_usados` (insert) y `pedidos` (estado→`pagado`) llama a `sync-erp` apenas ocurre el evento. Respaldo: reintentos + cron.

### Reintentos y respuestas — **léelo, define el comportamiento**

La WEB reintenta en línea a los **0s, 2s, 8s** (timeout 10s por intento); lo que no entre, se reintenta en la próxima corrida del trigger/cron.

| Tú respondes | La WEB hace |
|--------------|-------------|
| **2xx** | marca el evento como entregado y **NO lo reenvía**. Responde 2xx solo si aceptaste/guardaste el lote. |
| **4xx** (salvo 429) | **NO reintenta** — lo trata como payload inválido o llave mala. Usa 4xx solo para auth mala / body corrupto. |
| **5xx / 429 / timeout** | **reintenta**. Devuelve 5xx si tu guardado falló y quieres que insista. |

### Idempotencia (clave) — la WEB puede reenviar el mismo evento

- `checkin` / `cortesia_emitida` / `venta` → deduplica por **`qr`** (upsert / unique por `qr`).
- `totales` → es un **snapshot**: haz **upsert por `evento_web_id`** (sobrescribe el anterior).

---

## 3) Payloads (shape exacto)

### Ya los recibes hoy

```jsonc
// checkin
{ "tipo": "checkin", "qr": "abc123",
  "web_pedido_id": 2037, "checked_at": "2026-07-19T04:12:00Z",
  "validador": "uuid-o-nombre", "incidencia": null }   // incidencia: reembolsado | cambio_dia | … | null
```
```jsonc
// cortesia_emitida
{ "tipo": "cortesia_emitida", "qr": "abc123",
  "web_pedido_id": 2037, "evento_web_id": 45,
  "nombre": "Ada López", "rut": "12.345.678-9", "email": "ada@correo.cl",
  "tipo_ticket": "GENERAL", "emitida_at": "2026-07-18T21:00:00Z" }
```

### 🆕 NUEVOS a implementar

```jsonc
// venta  → idempotente por qr
{ "tipo": "venta", "qr": "abc123",
  "web_pedido_id": 2037, "evento_web_id": 45,
  "nombre": "Ada López", "rut": "12.345.678-9", "email": "ada@correo.cl",
  "tipo_ticket": "GENERAL",
  "monto": 12000,                       // CLP; puede venir null
  "metodo_pago": "mercadopago",         // mercadopago | khipu | transferencia | …
  "vendida_at": "2026-07-18T22:30:00Z" }
```
```jsonc
// totales  → snapshot por evento (SIN qr). Upsert por evento_web_id.
{ "tipo": "totales", "evento_web_id": 45,
  "entradas": 320,        // emitidas en la ventana (cortesía + venta)
  "recaudado": 3840000,   // CLP, suma aprox. por ticket
  "check_ins": 210,       // escaneados en la puerta
  "snapshot_at": "2026-07-19T04:12:00Z" }
```

**Campos transversales:**
- `qr` — id único del QR = **clave de idempotencia**.
- `evento_web_id` — id del evento en la WEB → mapéalo a tu evento del ERP.
- `web_pedido_id` — id del pedido en la WEB (por si quieres agrupar por compra).

---

## 4) Handler de ejemplo (Next.js route + Supabase del ERP)

Ya tienes el handler que procesa `checkin`/`cortesia_emitida`. Solo **agrega los 2 casos nuevos**:

```ts
// app/api/crm-webhook/route.ts   (proyecto ERP)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  if (req.headers.get('x-api-key') !== process.env.CRM_WEBHOOK_KEY)
    return new Response('forbidden', { status: 403 });          // 4xx → la WEB no reintenta (auth)

  const eventos = await req.json();                             // SIEMPRE array
  if (!Array.isArray(eventos)) return new Response('bad', { status: 400 });

  try {
    for (const e of eventos) {
      switch (e.tipo) {
        case 'checkin':          /* ya lo haces */ break;
        case 'cortesia_emitida': /* ya lo haces */ break;

        case 'venta':                                            // 🆕 idempotente por qr
          await sb.from('erp_ventas_web').upsert({
            qr: e.qr, web_pedido_id: e.web_pedido_id, evento_web_id: e.evento_web_id,
            nombre: e.nombre, rut: e.rut, email: e.email, tipo_ticket: e.tipo_ticket,
            monto: e.monto, metodo_pago: e.metodo_pago, vendida_at: e.vendida_at,
          }, { onConflict: 'qr' });
          break;

        case 'totales':                                          // 🆕 snapshot por evento
          await sb.from('erp_aforo_web').upsert({
            evento_web_id: e.evento_web_id, entradas: e.entradas,
            recaudado: e.recaudado, check_ins: e.check_ins, snapshot_at: e.snapshot_at,
          }, { onConflict: 'evento_web_id' });
          break;
      }
    }
    return Response.json({ ok: true });                          // 2xx → la WEB no reenvía
  } catch (err) {
    return new Response('error', { status: 500 });               // 5xx → la WEB reintenta
  }
}
```

> Los nombres de tabla (`erp_ventas_web`, `erp_aforo_web`) son de **ejemplo** — usa tu esquema.
> Lo esencial: **upsert idempotente** (`onConflict: 'qr'` para venta, `'evento_web_id'` para totales).

---

## 5) Checklist ERP

- [ ] Agregar `case 'venta'` y `case 'totales'` al handler `/api/crm-webhook` existente.
- [ ] Tablas destino con **unique** por `qr` (venta) y por `evento_web_id` (totales) → upsert idempotente.
- [ ] Mapear `evento_web_id` (WEB) → tu evento del ERP.
- [ ] Responder **2xx** al aceptar; **5xx** si el guardado falla (para que la WEB reintente); **4xx** solo para auth/body inválido.
- [ ] Avisar cuando esté listo → los eventos `venta`/`totales` que se estaban encolando **entran solos** (la WEB reintenta sin intervención).

---

## 6) Notas importantes

- **No rompe nada mientras tanto:** hasta que aceptes `venta`/`totales`, la WEB los manda en **lotes aparte** de `checkin`/`cortesia_emitida`. Si respondes 4xx a esos tipos nuevos, solo se pierden/encolan **esos** lotes; los check-ins y cortesías **siguen entrando normal**.
- **Orden:** los eventos pueden llegar desordenados y repetidos (por los reintentos). La idempotencia por `qr` lo resuelve.
- **`totales` es aproximado y en vivo** (snapshot cada disparo). Si quieres el número exacto, calcúlalo tú desde los `venta`/`checkin` que ya recibes; `totales` es para pintar el dashboard al toque sin agregar.
- **Ventana:** la WEB solo reenvía lo de los últimos ~3 días (config `VENTANA_DIAS` en `sync-erp`).
