# FRATE LINK — Handoff para replicarlo en el proyecto WEB

**Para:** la IA / dev del proyecto web (frate.cl · carpeta FRATE WEBPAGE).
**Objetivo:** replicar el **FRATE LINK completo** del ERP — **misma arquitectura y funcionalidad**, con **el diseño propio de la web** (NO copiar estilos/JSX del ERP).

> El ERP (React 18 + Supabase) tiene este módulo funcionando y probado. Acá va el paquete para reconstruirlo 1:1 en la web: la lógica (código real), el esquema de datos (SQL) y la arquitectura. La eficacia es alta; queremos lo mismo en la web.

---

## 0. Qué es el FRATE LINK (en una frase)

El operador crea un **link de auto-servicio** para un evento → lo comparte → el invitado se anota solo desde el celular (formulario configurable + OCR de cédula + selección de mesa en croquis) → el operador **aprueba** → cada aprobado recibe un **QR** que se **quema una sola vez en la puerta**. Todo cruzado contra un **CRM maestro con deduplicación** que detecta clientes frecuentes.

Los diferenciadores completos están en **`SPEC-ARQUITECTURA.md`** (léelo primero — es el "por qué es bueno" + los 10 features + tipos + form_config + flujos + modelo de datos).

---

## 1. Cómo usar este paquete

```
docs/frate-link-web/
├── HANDOFF.md              ← este archivo (guía de porting)
├── SPEC-ARQUITECTURA.md    ← la especificación funcional completa (LEER PRIMERO)
├── sql/                    ← el esquema de datos (Postgres/Supabase, esquema `frate`)
└── code/                   ← la LÓGICA real (portar 1:1, sin el diseño)
```

**Orden sugerido:** (1) lee `SPEC-ARQUITECTURA.md` · (2) corre el SQL de `sql/` en tu Supabase · (3) porta el código de `code/` a tu stack, respetando los contratos · (4) ponle tu diseño.

---

## 2. Índice del código (`code/`) — la lógica a portar

| Archivo | Qué es | Portar |
|---|---|---|
| **`frateLinkService.js`** (578 líneas) | **El corazón.** ~40 funciones: crear tipos/eventos/listas, inscribir por token (`submitEntryToLink`), aprobar (`setEntryEstado`), dedup CRM (`upsertPersonaDesdeEntry`), QR + check-in (`getTicketByQr`, `checkinByToken`), croquis (floorplans/spaces), reservas y cumpleaños. | **Sí — 1:1.** Es toda la lógica de negocio. |
| **`PublicListaLink.js`** (246 líneas) | La **página pública** donde el invitado se anota (lee el token, renderiza el form según `form_config`, valida obligatorios, OCR de cédula, WebPay si cobra, muestra el QR al aprobar). | **Sí la lógica; el diseño es tuyo.** |
| **`Puerta.js`** (303 líneas) | El **check-in en la puerta**: escanea/valida el QR, lo quema una vez, muestra verde/rojo. | Sí la lógica. |
| **`espaciosEventoService.js`** (57 líneas) | Disposición de espacios por evento (qué mesas hay, estado). | Sí, si quieres croquis. |
| **`crmWebService.js`** (85 líneas) | Puente CRM ERP↔web (ya definido en el contrato ARQUITECTURA-CRM-ERP). Útil si la web sincroniza con el ERP. | Opcional — solo si mantienes el ERP como espejo. |
| **`puertaWebService.js`** (96 líneas) | Lector de puerta offline + veto/antifraude. | Opcional. |

> Nota: el código del **admin/UI** (crear/gestionar links, `TabFrateLink.js` 851 líneas, y el croquis `CroquisEditor.js`) **NO se incluye** porque es puro diseño+formularios del ERP. Lo replicas con TU diseño usando las mismas funciones del servicio. Si quieres verlo de referencia, está en el ERP en `src/components/invitados/`.

---

## 3. Índice del SQL (`sql/`) — el esquema `frate.*`

Corre en este orden (todo en el esquema `frate`, con RLS abierta a `anon` como en el ERP, o ajusta a tu política):

| Archivo | Crea |
|---|---|
| `SQL_FASE_32_INVITADOS_COMBINADO.sql` | **Base del CRM:** `CREATE SCHEMA frate` + `frate.personas` (el CRM maestro) + `frate.invitaciones` (cada inscrito a una lista). |
| `SQL_FASE_80_FRATELINK.sql` | `frate.link_eventos` (evento del link) + `frate.lista_links` (cada link con token, form_config, cupos, cover, flags). |
| `SQL_FASE_81_FRATELINK_QR.sql` | Columnas de QR + check-in en `invitaciones` (qr_token, checked_in_at, gate_by). |
| `SQL_FASE_82_FRATELINK_CUMPLE.sql` | Ficha de cumpleaños. |
| `SQL_FASE_84_FRATELINK_CROQUIS.sql` | `frate.floorplans` + `frate.floorplan_spaces` (croquis + mesas). |
| `SQL_FASE_85_FRATELINK_ARTISTAS.sql` | Campos de artista/producción (apodo, rol, productor). |
| `SQL_FASE_86_FRATELINK_LISTAS_FECHA.sql` | Listas por fecha (sin evento operativo). |
| `SQL_FASE_87_FRATELINK_PAGO.sql` | Cobro (monto_servicio, estado_pago, link WebPay). |
| `SQL_FASE_88_FRATELINK_RESERVAS.sql` | Ficha de reserva de mesa. |

---

## 4. Los 4 flujos clave (mapa mental)

1. **Crear link** (admin) → `createListaLink(data)` genera un `token` único → URL pública `https://TU-WEB/L/<token>`. Express = 3 campos; Completa = todo el `form_config`.
2. **Inscripción** (público) → `getListaLinkByToken(token)` trae el link + su `form_config` → renderizas el form → `submitEntryToLink(token, entry)` valida obligatorios, respeta cupos/cierre, crea la `invitacion`, y **dedup contra el CRM** (`upsertPersonaDesdeEntry`).
3. **Aprobación + QR** (admin) → `loadEntries(listaLinkId)` → `setEntryEstado(id, 'aprobado')` genera el `qr_token`.
4. **Puerta** (check-in) → `getTicketByQr(qr)` valida → `checkinByToken(qr)` lo **quema atómicamente** (una sola vez).

## 5. Contratos de datos (shapes principales)

- **`lista_links`**: `{ id, token, link_evento_id, tipo, form_config (jsonb), max_cupos, cover_amount, monto_servicio, requires_manual_approval, allow_incomplete_data, allow_space_selection, floorplan_id, closes_at, categoria_id, benefit_text, notes, created_at }`
- **`invitaciones`** (cada inscrito): `{ id, lista_link_id, persona_id, nombre, rut, email, telefono, instagram, apodo, rol, productor, nacionalidad, estado ('pendiente'|'aprobado'|'rechazado'|'checkin'), qr_token, checked_in_at, gate_by, space_id, calidad_dato, created_at }`
- **`personas`** (CRM maestro): `{ id, nombre, rut, email, telefono, instagram, visitas, es_frecuente, primera_visita, ultima_visita, ... }` — la dedup vincula `invitaciones.persona_id` acá.
- **`form_config`**: ver `SPEC-ARQUITECTURA.md §3` (8 campos × oculto/opcional/obligatorio; `nombre` siempre fijo).

## 6. Qué EXCLUIR (lo dijiste: la web hace su diseño)

- **No copies** estilos, JSX de layout, ni los componentes de UI del ERP (`TabFrateLink.js`, `CroquisEditor.js`, el CSS).
- **Sí replica**: el modelo de datos, las funciones del servicio, la validación, la dedup, el QR/check-in atómico, el cobro, los cupos/cierre.
- El OCR de cédula del ERP usa un endpoint propio (`/api/leer-documento`, OpenAI visión). En la web, usa tu propio OCR o el mismo patrón (foto → visión → autocompleta nombre/RUT/nacimiento + valida +18).

## 7. Notas de porting (Supabase)

- El ERP usa un esquema **`frate`** aparte (no `public`). En el cliente JS: `supabase.schema('frate').from('lista_links')`. Puedes usar el mismo esquema o mover a `public` (ajusta el código).
- **RLS**: en el ERP está abierta a `anon` (la app confía en la capa de UI). Para la web pública, endurece: la inscripción pública solo debe poder **insertar** en `invitaciones` (no leer toda la tabla); el admin va autenticado. Revisa las policies antes de producción.
- **WebPay**: el cobro usa un link de pago (`WEBPAY_URL` en el servicio); el cliente paga y el admin marca "pagado" a mano. Reemplaza por tu integración (Transbank/Flow/etc.) si quieres cobro automático.
- **QR atómico**: `checkinByToken` hace el "quemado" en una sola operación para evitar doble uso. Mantén esa atomicidad (transacción o update condicional `WHERE checked_in_at IS NULL`).
- La web ya tiene una base (crear_lista + cortesías + QR + validación). Este handoff es para llevarla al nivel del ERP (tipos, form_config, dedup CRM, croquis, cumple/reserva/artista/producción).

---

*Handoff generado desde la implementación real del ERP. Sin diseño — la web pone el suyo. Español de Chile.*
