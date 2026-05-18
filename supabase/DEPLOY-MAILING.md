# 📧 FRATE — Deploy del sistema de mailing (Resend + Supabase)

> **Tiempo total estimado:** 30-40 minutos
> **Costo:** $0 (gratis hasta 3.000 emails/mes en Resend)

---

## ARQUITECTURA

```
Frontend (frate.cl)
        │
        ├──► sbSendWelcomeEmail()  ──► Edge Function "send-welcome" ──► Resend API ──► Email bienvenida
        │
        └──► sbSendReceiptEmail()  ──► Edge Function "send-receipt" ──► Resend API ──► Email con QRs
                                                                            │
                                                                            └──► BCC admin@frate.cl
```

---

## PASO 1 — Crear cuenta Resend (5 min)

1. Ir a https://resend.com/signup → crear cuenta con `pablo@frate.cl` (o tu email principal)
2. Verificar el email de confirmación
3. Saltear el onboarding (no es necesario)

---

## PASO 2 — Agregar dominio `frate.cl` a Resend (3 min)

1. En Resend: **Domains** → click **Add Domain** (arriba a la derecha)
2. Ingresar `frate.cl` → click **Add**
3. Resend te mostrará **3 registros DNS** que debés copiar a Vercel:
   - **1 registro TXT** (SPF) — con name `send.frate.cl` y value `v=spf1 include:amazonses.com ~all`
   - **1 registro MX** — con priority `10` y value `feedback-smtp.us-east-1.amazonses.com`
   - **1 registro TXT** (DKIM) — con name larga tipo `resend._domainkey.frate.cl` y value larguísimo (~400 chars)

**No cierres la pestaña de Resend** — vamos a copiar valores de ahí a Vercel.

---

## PASO 3 — Agregar los registros DNS en Vercel (10 min)

> ⚠️ Tu DNS está en **Vercel**, no en NIC Chile (los nameservers de NIC apuntan a `ns1.vercel-dns.com`).

1. Abrir **OTRA pestaña** (sin cerrar Resend) → https://vercel.com/dashboard
2. Click en proyecto **frate-webpage**
3. **Settings** (top nav) → **Domains** (sidebar)
4. Click en **frate.cl** → ver sección **DNS Records**

### Por cada registro que Resend te muestra:

**Registro 1 — TXT (SPF):**
- Click **Add** en Vercel
- **Type:** `TXT`
- **Name:** `send` *(SOLO la parte antes de `.frate.cl` — Vercel autocompleta el dominio)*
- **Value:** copiar exacto desde Resend: `v=spf1 include:amazonses.com ~all`
- **TTL:** dejar default
- Save

**Registro 2 — MX:**
- Click **Add** en Vercel
- **Type:** `MX`
- **Name:** `send`
- **Value:** `feedback-smtp.us-east-1.amazonses.com` *(o el que muestre Resend — puede variar por región)*
- **Priority:** `10`
- Save

**Registro 3 — TXT (DKIM):**
- Click **Add** en Vercel
- **Type:** `TXT`
- **Name:** `resend._domainkey` *(SIN el `.frate.cl` al final)*
- **Value:** copiar el string largo desde Resend (botón "Copy" — son ~400 caracteres, empieza con `p=MIG...`)
- Save

> 💡 **Tip:** Vercel a veces agrega `.frate.cl` automáticamente al name. Si lo hace, está bien. Lo que **no debe** quedar es algo como `send.frate.cl.frate.cl`. Si pasa, edita y dejá solo `send`.

### Verificar en Resend

5. Volver a Resend → en la pantalla del dominio → click **Verify Domain**
6. Esperar 1-5 minutos (Vercel propaga DNS muy rápido)
7. Cuando los 3 registros aparezcan en ✅ verde → dominio verificado

> Si después de 10 min sigue rojo: revisar que copiaste los valores **exactos** (sin espacios al final, sin comillas extra).

---

## PASO 4 — Obtener API Key de Resend (1 min)

1. Resend → **API Keys** (sidebar)
2. Click **Create API Key**
3. Name: `Frate Production`
4. Permission: `Sending access` *(no necesitamos "Full access")*
5. Domain: `frate.cl`
6. Click **Add** → te muestra el key UNA SOLA VEZ tipo `re_XXXXXXXXXXXXXXXX`
7. **Copialo ya** — no vas a poder verlo de nuevo (si lo perdés tenés que crear uno nuevo)

---

## PASO 5 — Agregar el API Key como Secret en Supabase (2 min)

1. https://supabase.com/dashboard → tu proyecto
2. **Project Settings** (engranaje sidebar bottom) → **Edge Functions**
3. Sección **Secrets** → click **Add new secret**
4. Agregar:
   - **Name:** `RESEND_API_KEY`
   - **Value:** `re_XXXXXXXXXXXXXXXX` (el que copiaste)
   - Click **Add secret**
5. (Opcional pero recomendado) Agregar también:
   - **Name:** `ADMIN_BCC_EMAIL`
   - **Value:** `pablo@frate.cl` (o el email donde querés recibir copia de TODAS las ventas)
   - Click **Add secret**

---

## PASO 6 — Crear las 2 Edge Functions (10 min)

> Las funciones ya están escritas en este repo en `supabase/functions/`. Solo hay que pegarlas en el dashboard.

### Función 1: `send-welcome`

1. Supabase Dashboard → **Edge Functions** (sidebar izquierdo, ícono ⚡)
2. Click **Create a new function** (botón verde arriba a la derecha)
3. Name: `send-welcome`
4. En el editor que aparece, BORRAR todo el código de ejemplo
5. Pegar todo el contenido del archivo:
   ```
   supabase/functions/send-welcome/index.ts
   ```
6. Click **Deploy function** (arriba a la derecha)
7. Esperar ~30 seg al "Deploy successful" ✅

### Función 2: `send-receipt`

1. **Create a new function** otra vez
2. Name: `send-receipt`
3. Borrar el código de ejemplo
4. Pegar todo el contenido de:
   ```
   supabase/functions/send-receipt/index.ts
   ```
5. **Deploy function**

---

## PASO 7 — Verificar el FROM address

En cada archivo `.ts` el remitente está hardcoded:
```ts
const FROM = 'Frate <hola@frate.cl>';            // send-welcome
const FROM = 'Frate Tickets <tickets@frate.cl>'; // send-receipt
```

Estos emails (`hola@`, `tickets@`) **no necesitan existir como buzones reales** — solo necesitan ser del dominio verificado. Resend acepta cualquier alias bajo `@frate.cl`.

Si querés cambiar el nombre (ej: "Frate Eventos" en lugar de "Frate Tickets"), edita la variable `FROM` en la función y redeploy.

---

## PASO 8 — Probar end-to-end (5 min)

### Test 1: Email de bienvenida
1. Ir a `frate.cl`
2. Crear cuenta nueva con un email tuyo
3. En 5-10 segundos debe llegar el email "¡Bienvenido a Frate!"
4. Si no llega: revisar **Supabase Dashboard → Edge Functions → send-welcome → Logs**

### Test 2: Comprobante de compra
1. Loguear con esa cuenta
2. Comprar un ticket (cualquiera, está en modo simulación)
3. En 5-10 segundos debe llegar el email con los QRs
4. **El QR debe ser una imagen real escaneable** (no un placeholder)

### Test 3: Importación masiva (cortesías)
1. Admin Panel → **Cortesías** → botón **📥 IMPORTAR MASIVO**
2. Subir uno de tus Excel de Google Forms (ej: cortesía mujeres)
3. Confirmar mapeo → seleccionar evento → procesar
4. Cada persona del Excel debe recibir su email con QR

---

## 🐛 TROUBLESHOOTING

### "RESEND_API_KEY no configurada"
→ Volvé al Paso 5 y verificá que pegaste el secret en Supabase.

### "Domain not verified" en logs
→ Volvé al Paso 3, revisá que los 3 registros DNS estén en ✅ verde en Resend.
→ Esperá unos minutos más — DNS puede tardar hasta 24 hrs (raro, pero pasa).

### Emails llegan a SPAM
→ Asegurate que **DKIM** está verificado (no solo SPF). DKIM es el más importante.
→ Pedile al primer destinatario que marque "No es spam" — eso ayuda a entrenar Gmail.

### "Failed to send email"
→ Revisá los logs en Supabase → Edge Functions → función específica → Logs.
→ Resend tiene 100/día de límite en cuenta nueva sin verificar. Si pasás eso, configurás tarjeta (sigue siendo gratis hasta 3.000/mes).

### El QR del email no es escaneable
→ La función usa `api.qrserver.com` (gratis). Si está caído, probá refrescar el email después de unas horas. Los QRs son URLs dinámicas, regeneran al abrir el email.

---

## ✅ Checklist final

- [ ] Cuenta Resend creada
- [ ] Dominio `frate.cl` agregado en Resend
- [ ] 3 registros DNS agregados en Vercel (TXT SPF, MX, TXT DKIM)
- [ ] Dominio verificado en Resend (todos en verde)
- [ ] `RESEND_API_KEY` agregado como Secret en Supabase
- [ ] `ADMIN_BCC_EMAIL` agregado como Secret (opcional)
- [ ] Edge Function `send-welcome` deployada
- [ ] Edge Function `send-receipt` deployada
- [ ] Test de registro → email de bienvenida recibido ✅
- [ ] Test de compra → comprobante con QR recibido ✅
- [ ] Test de importación masiva → emails a cada persona ✅

Cuando todos estén ✅: el sistema de mailing está 100% operativo.
