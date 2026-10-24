# Hand-off para ChatGPT Codex — construir la personalidad de 🍇 BOT FRIEND

> **Para quién:** una sesión de ChatGPT Codex trabajando **dentro del repo de la WEB** (`frate-webpage`, frate.cl).
> **Objetivo:** ayudar a Pablo a **desarrollar y afinar el personaje BOT FRIEND** (contenido + herramientas para editarlo desde el admin), sin romper la venta ni el idioma.
> **Idioma de todo lo que escribas (código, UI y textos del bot):** **español de Chile, tú estándar. PROHIBIDOS los argentinismos y el voseo** (nada de "vos/tenés/querés/mirá/dale/che"). Usa "tú tienes/quieres/mira".

---

## 1. Quién es BOT FRIEND (brief del personaje)

BOT FRIEND es el **espíritu bueno de la fiesta** de FRATE: un **Dionisio chileno**, el alma de la uva destilada — del **pisco y el vino**. Es **místico y pachamámico**, habla como un **chamán urbano** que le canta a la noche, pero está **enamorado de la música** y no puede evitar guiñarle (un artista, un verso, una vibra). Ronda los **40 años** y tiene harta sabiduría, pero **entiende perfecto a los jóvenes** y su código. Es **filosófico, bromista y cálido**; a veces suelta una frase que parece salida de un sueño.

**Tono:** chileno natural ("bacán", "al tiro", "la buena") sin forzarlo; breve **como un verso** (2-3 líneas). Emojis con moderación (🍇🍷🌙🎶✨).

**Regla de oro del personaje:** por muy místico que se ponga, **SIEMPRE aterriza y ayuda de verdad** — horarios, precios, entradas, reservas — y lleva con cariño a **comprar** o a **dejar el dato**. El misticismo es el envoltorio, no una excusa para no vender ni para no ser útil.

**Guardrails inquebrantables (no los toques, van por sobre todo):** FRATE es **solo +18**. Invita a disfrutar **con moderación**; nunca incita a tomar de más, mezclar sin control ni manejar habiendo bebido. No da consejos médicos ni legales; ante malestar o emergencia deriva al equipo y al WhatsApp **+56 9 8131 1548**.

---

## 2. Estado actual — lo que YA está vivo (no lo rehagas)

BOT FRIEND ya está **desplegado en producción** (2026-07-22). Su personalidad vive hoy como **default** del cerebro, así que responde en personaje sin que haya nada en la base:

- **Cerebro** (`supabase/functions/anfitrion/index.ts`): identidad `Eres ${botNombre} 🍇…`, `personalidad` (default = el brief de arriba), `guardrails` **siempre** inyectados, `model: gpt-4o-mini`, `temperature: 0.85`, `max_tokens: 180`. Trae datos EN VIVO (eventos/precios/stock/paquetes) y la **FAQ** curada.
- **WhatsApp** (`supabase/functions/whatsapp/index.ts`): mismos textos de acuse de cumple/reserva en su voz; el bot llama al cerebro `anfitrion` para todo lo demás.
- **Chat web** (`frate-anfitrion.js`): burbuja titulada **"BOT FRIEND 🍇"**, saludo y respuestas offline en su tono.

**Tu trabajo NO es reescribir esto, sino profundizarlo y darle herramientas de edición** (ver §4 y §6).

---

## 3. Dónde vive la personalidad (mapa técnico exacto)

| Pieza | Archivo / tabla | Detalle |
|---|---|---|
| **Cerebro (system prompt)** | `supabase/functions/anfitrion/index.ts` | Construye el string `system`. Aquí está la identidad, `personalidad`, `guardrails`, misión, reglas del portal, límites. Es el corazón. |
| **Overrides sin deploy** | tabla `config_valores` (clave/valor) | Claves que **pisan** los defaults del cerebro: `bot_nombre`, `bot_personalidad`, `bot_info_local`, `bot_reglas_extra`, `bot_ack_cumple`, `bot_ack_reserva`, `anfitrion_saludo`. Si están vacías, se usa el default del código. |
| **Editor en el admin** | `admin.html` → Config → 🎧 Anfitrión → card "🧠 Cerebro del bot" | Funciones `saveBotConfig()` (guarda) y `loadDisco()` (carga). Campos `bot-personalidad`, `bot-info-local`, `bot-reglas`, `bot-ack-cumple`, `bot-ack-reserva`. |
| **FAQ / respuestas exactas** | tabla `respuestas` | Columnas: `titulo, texto, categoria, disparadores, bot_auto, tras_responder, orden, activo`. El bot responde con **estos** textos antes de improvisar. Editor: admin → Comunidad → Chats → ⚡ Respuestas. |
| **Match de FAQ (WhatsApp)** | `whatsapp/index.ts` → `_matchFaq()` | Matchea `disparadores` por inicio de palabra; `bot_auto=true` = lo manda solo; `tras_responder='escalar'` = luego pasa a humano. Mismo algoritmo que el chat web (`anfitrion-conversar`). |
| **Chat web (frontend)** | `frate-anfitrion.js` | `_SALUDO_DEF` (saludo), `#ao-open-title` (nombre visible), `FALLBACK` (respuestas offline). |
| **Probador (sin gastar WhatsApp)** | `admin.html` → Comunidad → Chats | "Escribe como un cliente y mira qué contestaría" — no crea conversación real. |

**Cómo fluye una respuesta:** mensaje entra → (WhatsApp: escala si es cumple/reserva) → `_matchFaq` (respuesta exacta si calza) → si no, `anfitrion` (GPT con el system prompt + datos vivos + FAQ como conocimiento). El bot de WhatsApp solo responde si la conversación está en `etapa='bot_intake'` (nadie del equipo la tomó).

---

## 4. Cómo se "entrena" el personaje (sin ML — todo desde la app)

Tres palancas, de más simple a más potente:

1. **Su esencia** — editar `bot_personalidad` + `bot_reglas_extra` + `anfitrion_saludo` (campos que ya existen). Aquí vive "quién es".
2. **Su conocimiento** — la tabla `respuestas` (FAQ): datos duros (precios/horarios/convenios) que dice **con su voz**.
3. **Ejemplos que lo enseñan (few-shot)** — *ESTO AÚN NO EXISTE y es la palanca clave que quiero que construyas.* Un set de diálogos modelo "pregunta → así responde BOT FRIEND" que se **inyectan al system prompt** ("ASÍ HABLAS, imita este estilo"). Es la forma real de fijar la voz: agregas un ejemplo bueno y el bot lo imita en todo.

---

## 5. Reglas que NO puedes romper

- **Idioma:** español de Chile, tú estándar, **cero argentinismos/voseo** (en código, comentarios, UI y textos del bot).
- **No tocar la venta:** no modifiques el flujo de compra (`comprar.html`, `crear-pago`, `mp-webhook`, `pedidos`) ni las funciones del contrato de eventos (`api-evento`, `api-evento-ingest`). BOT FRIEND es CRM/atención, vive aparte.
- **Guardrails +18 / consumo responsable:** siempre presentes, no configurables para "apagarlos".
- **Aditivo:** SQL nuevo con `create table if not exists` / `add column if not exists`; nada de `DROP`/`DELETE` sobre datos vivos.
- **admin.html es un archivo gigante de un solo scope:** antes de nombrar una función/`id` nuevo, `grep` que no exista ya (hay colisiones históricas). Ojo: una función top-level NO puede llamar a un `const` local de otra función (da ReferenceError que el syntax-check no caza).
- **Verifica antes de desplegar:** `deno check <función>` para Edge Functions; probar el cerebro con un `curl` al endpoint `anfitrion`; y el probador del admin. Deploy: `supabase functions deploy anfitrion --project-ref ydwlpraoaaijlfssevoh` y frontend `vercel --prod --yes`.
- **Secretos:** `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, etc. viven solo en el server (Supabase secrets). Nunca en el bundle.

---

## 6. Tareas sugeridas para ti, Codex (en orden)

**A. 🍇 Estudio BOT FRIEND (panel en el admin) — el entregable grande.**
Un panel dedicado (Config → 🎧 Anfitrión, o sección propia) donde Pablo cría al personaje:
- Su carácter en **piezas estructuradas**: esencia · tono · muletillas · temas favoritos · **líneas rojas**. Cada una mapea a `config_valores` (extiende las claves `bot_*`).
- **Ejemplos que lo entrenan (few-shot):** nueva tabla `bot_ejemplos (id, pregunta, respuesta, activo, orden)` + editor CRUD en el admin. En `anfitrion/index.ts`, inyéctalos al `system` como bloque `ASÍ HABLAS (imita el estilo de estos ejemplos, sin copiar el contenido literal):` con los pares activos.
- **Probador integrado** al lado (reusa el que ya existe en Comunidad → Chats).
- **Guardar versiones** del personaje (tabla `bot_versiones` con snapshot JSON de las claves `bot_*` + ejemplos; botón "restaurar").
- **Switch on/off global** de BOT FRIEND: `config_valores.bot_activo` ('true'/'false'); si 'false', `manejarBot` no responde (queda solo el humano). Muéstralo en el panel.
- SQL aditivo para las tablas nuevas; entrégaselo a Pablo para correr (no puedes correrlo tú).

**B. Contenido en su voz.**
- Redacta **8-12 ejemplos few-shot** que capturen a BOT FRIEND (saludo, precio, horario, cumple, bajón, "¿qué música ponen?", queja, borracho amistoso → consumo responsable, etc.).
- Reescribe/crea entradas de la tabla `respuestas` (FAQ) en su voz para lo puntual (precios, convenios FRAT&FRIENDS, cómo llegar), manteniendo los datos EXACTOS.
- Propón 3-5 variantes de `anfitrion_saludo` y de los acuses de cumple/reserva.

**C. BOT FRIEND músico/chamán (fase creativa).**
- Conecta la tabla `canciones` (Ranking Musical) para que cite la "canción de la noche" cuando venga al caso (sin inventar).
- Un pequeño repertorio de **frases místicas/filosóficas rotativas** (aforismos del vino/la uva/la noche) que pueda intercalar — como config editable, no hardcode.

---

## 7. PROMPT PARA PEGAR EN CODEX

```
Trabajas en el repo de la WEB de FRATE (frate.cl / frate-webpage). Lee HANDOFF-CODEX-botfriend.md
en la raíz: define a BOT FRIEND (el espíritu chamánico-musical de la fiesta) y el mapa técnico de
dónde vive su personalidad. Ya está vivo en producción como default del cerebro; tu trabajo es
PROFUNDIZAR el personaje y darle herramientas para editarlo desde el admin, sin romper la venta.

Idioma obligatorio en TODO (código, UI y textos del bot): español de Chile, tú estándar, CERO
argentinismos/voseo.

Empieza por la Tarea A (§6): el panel "🍇 Estudio BOT FRIEND" en el admin, con lo más importante
primero = el sistema de EJEMPLOS few-shot (tabla bot_ejemplos + inyección al system prompt de
supabase/functions/anfitrion/index.ts como bloque "ASÍ HABLAS"). Luego piezas estructuradas de
personalidad (extiende las claves config_valores bot_*), probador integrado, versiones y el switch
on/off (config_valores.bot_activo). Todo SQL debe ser aditivo (create/alter if not exists) y me lo
entregas para correrlo yo.

Respeta las reglas §5: no toques el flujo de compra ni el contrato de eventos (api-evento*,
crear-pago, mp-webhook); guardrails +18/consumo responsable siempre presentes; grep de nombres
antes de crear funciones/ids en admin.html (es un archivo enorme de un solo scope); deno check
antes de desplegar Edge Functions. Muéstrame el plan y el diff antes de cada deploy, y prueba el
cerebro con un curl al endpoint anfitrion + el probador del admin.

Cuando termines cada pieza, dame: qué cambiaste, el SQL a correr (si hay), y 3 ejemplos de cómo
responde BOT FRIEND antes/después.
```

---

### Anexo — datos útiles
- **Supabase WEB (project-ref):** `ydwlpraoaaijlfssevoh`. Endpoint del cerebro: `https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/anfitrion` (POST `{ "mensajes":[{"from":"user","text":"..."}] }`, `verify_jwt=false`, pasa la anon key como `apikey`/`Authorization`).
- **Deploy Edge Function:** `supabase functions deploy anfitrion --project-ref ydwlpraoaaijlfssevoh` (corre `deno check` antes).
- **Deploy frontend:** `vercel --prod --yes` (aliasa a www.frate.cl).
- **WhatsApp del equipo (fallback humano):** +56 9 8131 1548.
