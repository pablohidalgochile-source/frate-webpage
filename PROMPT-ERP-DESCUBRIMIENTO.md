# PROMPT PARA EL CHAT DEL ERP (copiar y pegar completo)

---

Estoy integrando este ERP (erp.frate.cl, React CRA, Supabase propio `zsilmmixlugwawzpmayx`, Vercel `frate-erp-campus-central`) con la web pública de venta de entradas (frate.cl, Supabase `ydwlpraoaaijlfssevoh`). Son DOS bases de datos separadas que se comunican SOLO por API.

**Ya existe un puente funcionando que debes respetar como patrón:** el ERP consume el edge function `api-evento` de la web a través de un proxy server-side `/api/evento` (archivo `api/evento.js` en este repo) que agrega el header `x-api-key` con la env `WEB_API_KEY` (configurada en el Vercel del ERP). NO expongas esa llave al navegador.

**El objetivo ahora:** conectar el módulo de este ERP que administra **invitaciones RRPP, reservas de mesa, cumpleaños y listas gratuitas** con la web. El flujo del negocio es:
- El CLIENTE hace todo en frate.cl: reserva mesa, pide su cumpleaños, se anota en listas, es invitado por un RRPP.
- El ERP RECIBE cada solicitud, la ADMINISTRA (confirmar / rechazar / asignar mesa / aprobar lista / definir cupos) y su decisión VUELVE a la web, que le avisa al cliente.
- La web es la fuente de verdad de lo que ve el cliente; el ERP es la fuente de verdad de la operación interna.

**TU TAREA EN ESTE CHAT (solo documentación — NO modifiques código todavía):**

Genera un archivo `ARQUITECTURA-CRM-ERP.md` en la raíz del repo con EXACTAMENTE estas secciones:

## 1. Módulo actual
- Qué páginas/componentes del ERP manejan hoy invitaciones RRPP, reservas, cumpleaños y listas (rutas de archivo).
- Capturas del flujo actual en texto: qué hace el operador paso a paso.

## 2. Esquema de datos (Supabase del ERP)
Por CADA tabla relevante (reservas, invitaciones, listas, cumpleaños, RRPP, mesas/sectores si existen):
- Nombre exacto de la tabla y TODAS sus columnas con tipo.
- Valores posibles de cada campo de estado (enum/texto) y su significado.
- Relaciones (FK) entre ellas.
- RLS: qué políticas tienen.

## 3. Backend disponible
- Lista de funciones server-side existentes en `api/` (Vercel functions) y qué hacen.
- Env vars disponibles en el Vercel del ERP (nombres, no valores).
- Cómo se autentican los operadores del ERP (Supabase auth propio, roles).

## 4. Lo que el ERP NECESITA RECIBIR de la web
Para cada tipo (reserva mesa / cumpleaños / lista gratuita / invitación RRPP), define el JSON ideal que el ERP quisiera recibir, con campos obligatorios y opcionales. Ejemplo de formato:
```json
{ "tipo": "cumpleanos", "nombre": "...", "rut": "...", "telefono": "...", "email": "...", "fecha": "YYYY-MM-DD", "personas": 8, "comentario": "...", "web_id": 123 }
```

## 5. Las ACCIONES que el ERP mandará de vuelta
Lista cerrada de acciones con su payload, por ejemplo:
- `confirmar_reserva { web_id, mesa/sector, nota }`
- `rechazar_reserva { web_id, motivo }`
- `aprobar_lista { web_id, cupos }`
- (las que tu módulo realmente soporte o quieras soportar)

## 6. Restricciones y convenciones
- Formato de fechas/horas que usa el ERP, zona horaria.
- Nombres de estados que el ERP quiere imponer (para homologarlos con la web).
- Cualquier límite (ej: máximo de invitados por lista).

## 7. Propuesta de sincronización desde tu lado
- ¿Prefieres POLLING (el ERP consulta la web cada X minutos con un botón/refresh, como hoy hace con api-evento) o quieres además un WEBHOOK entrante (endpoint en `api/` del ERP que la web llame al crearse una solicitud)? Justifica según tu arquitectura.

**CONTEXTO DE LA WEB (para que homologues nombres — no lo inventes distinto):**
La web ya tiene: tabla `reservas` (id, nombre, tipo, fecha, personas, telefono, estado: pendiente/confirmada/cancelada, cliente_id), módulo de **Cortesías** (genera tickets GRATIS con QR real: pedidos con metodo_pago='cortesia' + items con qr_ids — esto puede materializar las "listas aprobadas" e "invitaciones RRPP"), tabla `codigos` con `duenio_id` (cuenta RRPP), roles admin/portero/rrpp, y validación en puerta por QR o RUT en frate.cl/validacion. Los endpoints web existentes son `api-evento` (lectura, x-api-key) y `api-evento-ingest` (escritura de eventos, x-api-key), ambos con la misma llave que ya tienes como `WEB_API_KEY`.

**IMPORTANTE:**
- Español chileno, sin argentinismos.
- NO cambies código ni esquema todavía: SOLO el documento.
- Si algo del módulo actual no existe o está a medias, dilo explícitamente en el doc (sección "Faltantes") en vez de inventar.
- Termina el documento con una sección "## 8. Dudas para la web" con cualquier pregunta que necesites que responda el otro proyecto.

Cuando el documento esté listo, muéstramelo completo en el chat además de guardarlo.

---
