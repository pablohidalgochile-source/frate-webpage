# FRATE LINK — Especificación para replicar en la WEB

> El **FRATE LINK** es el sistema de **links de auto-servicio** del ERP: el operador crea un link para un evento, lo comparte, el invitado se anota solo desde el celular, el operador aprueba, y cada aprobado recibe un **QR** que se valida en la puerta. Con el nuevo modelo (la web administra todo lo de cara al cliente), **la web debe replicar este flujo** — ya tiene la base (crear_lista + cortesías + QR + validación); acá va TODO lo que lo hace bueno para que lo repliquen mejor.
>
> Escrito desde la implementación real del ERP (`src/lib/frateLinkService.js`, `PublicListaLink.js`, esquema `frate.*`). Español de Chile.

---

## 1. Por qué es bueno (los diferenciadores)

No es "un formulario que junta nombres". Lo que lo hace potente:

1. **Tipos de link configurables** con formularios distintos (lista, cumple, reserva, artista, producción).
2. **Formulario adaptable por link**: cada campo es *oculto / opcional / obligatorio*. El mismo motor sirve para una lista simple o para pedir apodo+rol a un DJ.
3. **Modo Express**: crear un link en 3 campos (nombre, cupos, tipo) sin configurar nada.
4. **OCR de cédula** en la inscripción: la persona saca foto del carnet → autocompleta nombre + RUT + fecha de nacimiento y **valida mayor de 18**.
5. **Selección de espacio en el croquis**: el invitado puede elegir su mesa/zona del plano.
6. **Cupos + cierre automático**: `max_cupos` y `closes_at` se respetan solos.
7. **Aprobación humana** con generación de QR al aprobar (nada auto salvo que se configure).
8. **CRM maestro con deduplicación** (el killer feature): cada inscrito se cruza contra la base por **RUT → email → nombre normalizado**, se vincula a la persona y **cuenta sus visitas** → detección de **cliente frecuente** automática.
9. **Calidad de dato** por inscrito (completa / parcial / mínima) para saber a quién falta pedirle RUT/email.
10. **Puerta con QR atómico**: el QR se quema **una sola vez**.

---

## 2. Tipos de link

Catálogo configurable (el dueño lo edita). Cada tipo trae su `form_config` y flags por defecto:

| Tipo | Emoji | Para qué | Preset de formulario |
|---|---|---|---|
| `guest_list` | 🎫 | Lista general | RUT/email/apodo opcionales; tel/IG/rol/productor ocultos |
| `birthday` | 🎂 | Cumpleaños | + ficha de cumpleaños (ver §8) |
| `reservation` | 🍾 | Reserva de mesa | teléfono **obligatorio**; + ficha de reserva (ver §8) |
| `artist` | 🎤 | Artista / DJ | apodo **obligatorio**, rol **obligatorio**; permite datos incompletos |
| `production` | 🎬 | Producción / prensa | rol y productor **obligatorios**; email oculto; permite incompletos |

Flags por tipo: `requires_manual_approval` (aprobación humana sí/no), `allow_incomplete_data` (permite guardar sin RUT/email — útil para artistas), `allow_space_selection` (muestra el croquis).

---

## 3. Formulario configurable (`form_config`)

El corazón de la flexibilidad. Por cada link, un objeto con 8 campos, cada uno en uno de 3 estados:

```json
{ "rut":"opcional", "email":"opcional", "telefono":"oculto", "instagram":"oculto",
  "apodo":"opcional", "rol":"oculto", "productor":"oculto", "nacionalidad":"oculto" }
```
- `oculto` → no se muestra · `opcional` → se muestra, no obliga · `obligatorio` → se muestra y valida.
- **`nombre` siempre es obligatorio** (no está en el config, es fijo).
- La validación de obligatorios corre en el submit (`submitEntryToLink`): si falta un `obligatorio`, se rechaza con "Falta un campo obligatorio: X".

---

## 4. Creación del link — Express vs Completa

**Express** (3 campos, para el 90% de los casos): `nombre del invitador`, `cantidad de cupos`, `tipo`. Toma el preset del tipo y listo → genera token + URL.

**Completa** (control total): además de lo anterior — evento (planificación u operativo por fecha), `cover_amount`, `max_cupos`, `form_config` campo por campo, `requires_manual_approval`, `allow_incomplete_data`, `allow_space_selection` (+ `floorplan_id`), `closes_at`, `categoria_id`, `monto_servicio` (+ link de pago si cobra), `benefit_text` (descripción), `notes`.

Al crear: **token seguro** (16 bytes crypto aleatorios en hex) + **slug** legible. URL pública = `/<base>/lista/<token>` (en el ERP era `/l/<token>`; en la web = `frate.cl/lista/CODIGO`).

---

## 5. Página pública de inscripción (el flujo del invitado)

Lo que ve la persona al abrir el link (mobile-first):

1. **Cabecera**: nombre del evento/beneficio, quién invita, fecha, cupos restantes.
2. **Formulario adaptativo** según `form_config` del link (solo muestra los campos configurados).
3. **📸 OCR de cédula (opcional pero clave)**: botón "escanear carnet" → foto → un endpoint de visión extrae **nombre + RUT + fecha de nacimiento** → autocompleta el formulario y **valida ≥ 18 años** (rechaza menores).
4. **🗺 Selección de espacio (si `allow_space_selection`)**: muestra el croquis del local; la persona toca su mesa/zona; se guarda `espacio_id` + `espacio_nombre`.
5. **Validaciones al enviar**: link `abierto`, no vencido (`closes_at`), quedan cupos (`used_cupos < max_cupos`), nombre presente, obligatorios completos.
6. **Calidad de dato** (se calcula solo): `completa` (RUT **y** email) · `parcial` (uno de los dos) · `minima` (ninguno). Sirve para saber a quién falta pedirle datos.
7. **Resultado**: si el link auto-aprueba → queda `aprobado` + QR al instante; si no → `pendiente_revision` (espera al operador).

---

## 6. Estados, aprobación y QR

**Estados del inscrito** (`estado_lista`): `pendiente_revision` → `aprobado` → `rechazado`.

- **Aprobar** (operador o auto): genera el **`qr_token`** (si no lo tenía) y **vincula al CRM maestro** (§7).
- **Rechazar**: queda fuera, no genera QR.
- El **QR** es el token que codifica la imagen; se muestra en una página tipo `/ticket/<qr_token>` para escanear en puerta.

**Puerta (validación atómica)**: al escanear, se **quema el QR una sola vez** (operación atómica) — si se reintenta, responde "ya usado" con la hora original. Nadie entra dos veces.

---

## 7. CRM maestro con deduplicación (el killer feature)

Cada inscrito **aprobado** se cruza contra la base de personas y se **deduplica en cascada**:

1. Busca por **RUT** → si existe, es esa persona.
2. Si no, por **email**.
3. Si no, por **nombre normalizado** (minúsculas, sin tildes, sin signos).

Si la encuentra: **incrementa `veces_invitado`** (+1) y enriquece datos (rut/email/apodo/categoría). Si no: crea la persona con nivel de confianza (ALTA si RUT+email, MEDIA si uno, BAJA si ninguno).

**Resultado:** una sola ficha por persona real, con su **conteo de visitas** → de ahí sale la **detección de cliente frecuente** automática (sin que nadie la marque a mano). Esto alimenta el loyalty.

> Para la web: este es el punto que NO hay que perder. La lista no es solo entradas; es la que construye el CRM y detecta frecuentes.

---

## 8. Tipos especializados: cumpleaños y reserva

Además de la lista de inscritos, estos tipos guardan una **ficha de coordinación** aparte:

**🎂 Cumpleaños** (`birthday_requests`): nombre y fecha del cumpleañero, teléfono, Instagram, **invitados estimados**, **cover cumpleañero / cover invitados**, quiere decoración (+notas), quiere botellas (+notas), presupuesto, quiere mesa, zona preferida. Estado de coordinación: `nuevo → contactado → confirmado → pagado → asistió/no_asistió/cancelado`.

**🍾 Reserva** (`reservation_requests`): responsable, **party_size**, zona, **consumo_minimo**, **abono**, quiere botellas (+notas), presupuesto. Mismo `coordination_status`.

Estos son los que en el negocio real se cierran hablando (el chatbot + anfitrión). La lista de invitados de un cumple/reserva usa el mismo motor de inscritos (nombre + RUT por persona).

---

## 9. Modelo de datos (esquema `frate.*` en el ERP — referencia)

- **`lista_links`** — el link: `token`, `slug`, `link_type`, `form_config` (jsonb), `max_cupos`, `requires_manual_approval`, `allow_incomplete_data`, `allow_space_selection`, `floorplan_id`, `closes_at`, `status` (abierto/pausado/cerrado), `monto_servicio`, `estado_pago`, `cover_amount`, `inviter_nombre`, `benefit_text`, `fecha`, `evento_operativo_id`, `categoria_id`.
- **`invitaciones`** — cada inscrito: `nombre_en_lista`, `rut_en_lista`, `email_en_lista`, `telefono/instagram/nickname`, `tipo_acceso`, `source_mode`, `data_quality`, `estado_lista`, `qr_token`, `qr_used_at/by`, `espacio_id/nombre`, `persona_id` (→ CRM), `rol_lista`, `productor_asociado`, `nacionalidad`.
- **`birthday_requests`** / **`reservation_requests`** — fichas de coordinación (§8).
- **`personas`** — CRM maestro: `rut_principal`, `email_principal`, `nombre_normalizado`, `veces_invitado`, `nivel_confianza_identidad`, `categoria_frecuente`.
- **`floorplans` / `floorplan_spaces`** — croquis a escala (mesas/zonas con x/y/w/h, capacidad, precio) para la selección de espacio.
- **`categorias_acceso`** — VIP/GENERAL/etc (color + orden).

---

## 10. Cómo encaja con lo que la web YA tiene

La web ya tiene: `crear_lista` (frate.cl/lista/CODIGO), cortesías (pedido `metodo_pago='cortesia'` + QR), validación en frate.cl/validacion, MercadoPago. **Lo que hay que sumarle del FRATE LINK:**

| Feature FRATE LINK | ¿La web lo tiene? | A construir en la web |
|---|---|---|
| Link + página pública de inscripción | crear_lista sí; la página de inscripción hay que armarla | Página `frate.cl/lista/CODIGO` con formulario |
| Tipos de link + `form_config` configurable | — | Catálogo de tipos + formulario por campo (oculto/opcional/obligatorio) |
| Modo Express (3 campos) | — | Atajo de creación |
| OCR de cédula + validación 18+ | — | Endpoint de visión en la inscripción |
| Selección de espacio (croquis) | — | Reusar el plano; guardar espacio elegido |
| Cupos + cierre | parcial | `max_cupos` + `closes_at` |
| Aprobación humana + QR al aprobar | el ERP aprueba y ustedes fabrican QR ✅ | ya acordado (nada se auto-aprueba) |
| **CRM dedup + frecuente** | ustedes cuentan visitas por check-ins | Unificar persona por RUT/email/nombre + contar → frecuente |
| Fichas cumple/reserva | — | `birthday_requests` / `reservation_requests` |
| Calidad de dato | — | completa/parcial/mínima por inscrito |

**El puente ya conecta las dos puntas:** el ERP recibe las solicitudes/inscritos por el webhook, aprueba/rechaza, y ustedes fabrican el QR y avisan al cliente. Replicando el motor de arriba, la web queda con un FRATE LINK propio (mejor), y el ERP sigue como el cerebro operativo que aprueba y opera.
