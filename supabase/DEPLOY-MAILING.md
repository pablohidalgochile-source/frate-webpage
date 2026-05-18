# FRATE — Deploy Edge Functions de Mailing

## Qué hace cada función
- **send-welcome**: Se llama al registrar usuario → email de bienvenida con datos de cuenta
- **send-receipt**: Se llama al confirmar compra → comprobante con QR individual por cada producto

---

## PASO 1 — Crear cuenta Resend (gratis)

1. Ve a https://resend.com → crear cuenta gratis
2. Añade tu dominio **frate.cl** en "Domains"
3. Agrega los registros DNS que te indica Resend (TXT + MX)
4. Una vez verificado, ve a "API Keys" → crear key → copia el valor

---

## PASO 2 — Agregar el API key como secreto en Supabase

1. Ve a tu proyecto Supabase → Settings → Edge Functions
2. En "Secrets", agrega:
   - **Name**: `RESEND_API_KEY`
   - **Value**: `re_xxxxxxxxx` (tu key de Resend)
3. Guarda.

---

## PASO 3 — Crear las Edge Functions en Supabase Dashboard

### Función 1: `send-welcome`
1. Ve a tu proyecto Supabase → Edge Functions → New Function
2. Nombre: `send-welcome`
3. Copia y pega el contenido de `supabase/functions/send-welcome/index.ts`
4. Deploy

### Función 2: `send-receipt`
1. Nueva función → Nombre: `send-receipt`
2. Copia y pega el contenido de `supabase/functions/send-receipt/index.ts`
3. Deploy

---

## PASO 4 — Actualizar el FROM address

En ambos archivos `.ts`, cambia el dominio si es necesario:
```ts
const FROM = 'Frate <hola@frate.cl>';        // send-welcome
const FROM = 'Frate Tickets <tickets@frate.cl>'; // send-receipt
```
Asegúrate de que estos dominios estén verificados en Resend.

---

## PASO 5 — Subir los archivos del frontend

Sube a GitHub/Vercel:
- `frate-supabase.js` (tiene sbSendWelcomeEmail + sbSendReceiptEmail)
- `index.html` (llama welcome email en registro)
- `frate-cart.js` (llama receipt email en compra)

---

## Verificar que funciona

- Crea una cuenta nueva → deberías recibir email de bienvenida en ~5 seg
- Completa una compra → deberías recibir comprobante con QRs en ~5 seg
- Si no llega, revisar Supabase → Edge Functions → Logs

---

## Los QR codes

Son imágenes reales generadas por `api.qrserver.com` (servicio gratuito).
Cada QR contiene el ID único del producto: `FCC-XXXXX-ttId-0`
El staff puede escanear este QR con cualquier lector en la entrada.
