# HAND-OFF → Proyecto ERP FRATE (erp.frate.cl)

Documento para la sesión/desarrollador del ERP. Explica **cómo recibir
toda la información operativa de la web de ventas (frate.cl)** — ventas,
entradas, check-ins con horarios, devoluciones y reactivaciones — y cómo
crear eventos desde afuera. En el futuro todo quedará linkeado; hoy la
integración es por estas 2 APIs.

## Contexto (2 sistemas separados)

| | WEB ventas | ERP |
|---|---|---|
| Dominio | frate.cl | erp.frate.cl |
| Supabase | `ydwlpraoaaijlfssevoh` | `zsilmmixlugwawzpmayx` (base DISTINTA) |
| Vercel | `frate-webpage` | `frate-erp-campus-central` |

**El ERP NO lee la base de la web directamente.** Consume sus Edge
Functions con una API key. El ERP ya tiene un proxy server-side
(`/api/evento`, env `WEB_API_KEY` en su Vercel) que reenvía a la API de
la web — usar SIEMPRE ese proxy desde el frontend React (la key nunca va
al navegador).

## API 1 — LECTURA: `api-evento` (datos operativos)

```
GET https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-evento
Header: x-api-key: <ERP_API_KEY>          (misma key de siempre)
```

### a) Lista de eventos (sin parámetros)
`GET /api-evento` →
```json
{ "ok": true, "eventos": [
  { "id": 5, "nombre": "PREUBA COMPRA", "fecha": "2026-07-02",
    "hora": "23:00", "hora_termino": "05:00",
    "estado": "publicado",   // creado | publicado | en_vivo
    "activo": true, "archivado": false }
]}
```

### b) Detalle operativo de un evento
`GET /api-evento?evento_id=5` →
```json
{
  "ok": true,
  "evento": { "id": 5, "nombre": "...", "fecha": "2026-07-02", "hora": "23:00",
              "hora_termino": "05:00", "estado": "en_vivo", "archivado": false },
  "resumen": {
    "entradas_vendidas": 120,
    "ingresos_total": 960000,
    "check_ins": 95,                      // cuántos entraron
    "pendientes_ingreso": 25,             // = NO USADOS si el evento ya terminó
    "incidencias_puerta": 2,              // quemados que no entraron (ebriedad, etc.)
    "devoluciones_reactivaciones": 4
  },
  "tipos": [ { "id": 11, "nombre": "General", "precio": 8000,
               "disponible": 80, "vence_hora": "01:30",
               "vendidos": 120, "ingresos": 960000 } ],
  "asistentes": [
    { "qr_id": "FCC-17-11-0-0", "nombre": "Juan Pérez", "rut": "12.345.678-9",
      "tipo": "General", "ingresado": true,
      "ingreso_at": "2026-07-03T02:14:09.123Z",   // ← timestamp exacto del check-in
      "incidencia": null,        // 'posible_devolucion' | 'resuelta_credito' | 'rechazada'
      "incidencia_nota": null }
  ],
  "devoluciones": [
    { "orden": "FCC-000017", "cliente": "Juan Pérez", "email": "...",
      "monto": 8320,
      "tipo": "credito",         // 'credito' = REACTIVACIÓN (no sale plata) | 'dinero'
      "estado": "pendiente",     // pendiente | aprobada | rechazada | reembolsado | requiere_reembolso
      "motivo": "Reactivación — ticket no usado" }
  ],
  "generado_at": "..."
}
```

**Notas para el dashboard del ERP:**
- `asistentes[].ingreso_at` permite armar el **histograma de horarios de
  entrada** (agrupar por hora; recordar que la noche cruza medianoche).
- Regla horaria FRATE: horas 12:00–23:59 pertenecen al día del evento;
  00:00–11:59 a la madrugada siguiente.
- "No usados" = `pendientes_ingreso` cuando el evento terminó.
- **Reactivación** = devolución con `tipo: "credito"`: la compra se anula
  y el valor queda como crédito FRATE del cliente (la plata no sale).
- Polling sugerido: cada 30–60 s la noche del evento; 1 vez/hora el resto.

## API 2 — ESCRITURA: `api-evento-ingest` (crear/actualizar eventos)

Para la app de flyers/contenido (o el propio ERP) — crea o actualiza
eventos con sus tickets. Contrato completo en `API-EVENTOS-INGEST.md`
del repo web. Resumen:

```
POST https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-evento-ingest
Headers: Content-Type: application/json · x-api-key: <ERP_API_KEY>
Body: { "evento": { external_id?, nombre*, fecha* (YYYY-MM-DD), hora,
        hora_termino, estado (creado|publicado|en_vivo), descripcion,
        djs:[], imagen_url, video_url, link_colaborador },
        "tickets": [ { nombre*, precio*, disponible*, estado, vence_hora } ] }
```
- Upsert por `external_id` (recomendado) o por (nombre + fecha).
- `estado: "creado"` = borrador (no sale en frate.cl).
- Nunca borra tipos de ticket existentes.

## Conceptos de negocio que el ERP debe reflejar

1. **Estados de evento:** creado (borrador) → publicado (a la venta) →
   en_vivo (manual o automático a la hora de inicio) → finalizado
   (automático a la hora de término; deja de vender y se oculta).
2. **Tickets nominativos:** toda entrada lleva nombre + RUT (vienen en
   `asistentes[]`).
3. **Filosofía de plata:** las devoluciones se resuelven idealmente como
   **crédito FRATE (reactivación)**; el dinero es último recurso y se
   informa "5 días hábiles". El ERP debería mostrar ambos por separado.
4. **Incidencias de puerta:** el portero marca "quemado pero no entró";
   SIEMPRE las aprueba/rechaza el admin en la web (anti-fraude). El ERP
   solo las lee.

## Futuro (cuando se linkee todo)
- Webhooks push desde la web al ERP (venta nueva, check-in, cierre de noche)
  en vez de polling — se agregará un endpoint receptor en el ERP.
- La app de flyers alimentará eventos vía `api-evento-ingest` con
  `external_id`, y el ERP los verá aparecer por `api-evento` sin hacer nada.
