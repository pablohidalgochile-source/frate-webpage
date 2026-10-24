# FRATE — API para crear/actualizar eventos desde otra app

Contrato para que la app de flyers/contenido **envíe eventos a frate.cl**.
Cuando esa app llame a este endpoint, el evento aparece (o se actualiza)
en la web con sus tickets, foto y/o video.

## Endpoint

```
POST https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-evento-ingest
Content-Type: application/json
x-api-key: <ERP_API_KEY>
```

La clave es la misma `ERP_API_KEY` que ya está en los secrets de Supabase
(Edge Functions → Secrets). Se la pasas a la app de flyers de forma segura
(no la publiques en código de navegador).

## Cuerpo (JSON)

```json
{
  "evento": {
    "external_id": "flyer-123",
    "nombre": "NOCHE TRAP",
    "fecha": "2026-07-18",
    "hora": "23:00",
    "ambiente": "Fuego",
    "descripcion": "La noche más esperada.",
    "djs": ["DJ UNO", "DJ DOS"],
    "imagen_url": "https://cdn.miapp.cl/flyers/noche-trap.jpg",
    "video_url": "https://cdn.miapp.cl/flyers/noche-trap.mp4",
    "link_colaborador": "https://instagram.com/productora",
    "activo": true
  },
  "tickets": [
    { "nombre": "Anticipada", "precio": 5000, "disponible": 100, "estado": "Activo" },
    { "nombre": "General",    "precio": 8000, "disponible": 200, "estado": "Activo" }
  ]
}
```

### Reglas
- **Obligatorios:** `evento.nombre` y `evento.fecha` (formato `YYYY-MM-DD`).
- **`external_id` (recomendado):** si la app manda siempre su propio id,
  puede volver a llamar con el mismo `external_id` y el evento se
  **actualiza** en vez de duplicarse. Sin `external_id`, se busca por
  (nombre + fecha).
- **`video_url` manda sobre `imagen_url`:** si hay video, el público ve el
  video corriendo en la tarjeta del evento; si no, la foto.
  Formato ideal: MP4 corto en loop (5–20 s), liviano (< 25 MB), horizontal.
- **`activo: false`** deja el evento como borrador (no se ve en frate.cl,
  se activa después desde el admin).
- **`ambiente`:** `Fuego` | `Aire` | `Tierra`.
- **Tickets:** se identifican por `nombre` dentro del evento. Si ya existe
  uno con ese nombre se actualiza (precio/stock/estado); si no, se crea.
  **Nunca se borran** tipos existentes (los que tienen ventas quedan intactos).
  `estado`: `Activo` | `Agotado` | `Cerrado` | `Oculto`.

## Respuesta

```json
{ "ok": true, "eventoId": 8, "evento": "creado",
  "tickets": [ { "id": 14, "nombre": "Anticipada", "accion": "creado" } ] }
```

Errores: `401` clave inválida · `405` método distinto de POST ·
`500` con `{ "error": "..." }` (ej: falta nombre/fecha).

## Prueba rápida (curl)

```bash
curl -X POST "https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-evento-ingest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_ERP_API_KEY" \
  -d '{"evento":{"external_id":"test-1","nombre":"EVENTO DE PRUEBA API","fecha":"2026-08-01","activo":false},"tickets":[{"nombre":"General","precio":6000,"disponible":150}]}'
```

(Con `activo:false` la prueba no se publica en la web.)

## Requisito previo

Correr una vez `frate-eventos-media-api.sql` en el SQL Editor del proyecto
web (agrega `eventos.video_url` y `eventos.external_id`).
