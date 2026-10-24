# HANDOFF · Ticket de diferencia — WEB → POS

**De:** sesión WEB (frate.cl) · **Para:** sesión FRATE POS
**Fecha:** 6 de agosto de 2026 · **Urgencia:** Pablo prueba ESTA NOCHE (jueves)

---

## 1. El problema real

Gente compra entradas cuya condición no cumple. Los dos casos que se repiten:

- Una **mujer** compra entrada de HOMBRE porque las de mujer se agotaron.
- Un **hombre que no es universitario** compra la de HOMBRE UNIVERSITARIO, que es más barata.

Llegan a la puerta, muestran su QR, y el ticket no calza con la persona. Hoy hay dos salidas y las dos son malas: devolverle todo (se pierde la venta) o dejarlo afuera (se pierde el cliente).

**La tercera salida es cobrar la diferencia.** Esa es la que vamos a construir.

---

## 2. La regla que puso Pablo, textual

> «El portero anfitrión debe ser quien decida. A veces sí o sí es devolución porque no cumple el perfil, y a veces le permitimos pagar la diferencia.»

Y la otra, igual de importante:

> «Los anfitriones no necesitan tener puntos de cobro. Ellos solo administran las entradas, no cobran.»

Traducido a arquitectura:

- **La WEB no cobra.** Emite un documento de cobro y nada más.
- **El POS cobra.** Lee el documento, cobra en caja, y avisa que quedó pagado.
- **La decisión es humana**, del anfitrión en la puerta. El sistema propone un monto; nunca ejecuta solo.

---

## 3. El objeto: `ticket_diferencia`

Vive en la base WEB (`ydwlpraoaaijlfssevoh`). Lo emite el anfitrión desde el validador.

```jsonc
{
  "codigo":        "DIF-000042",     // lo que se teclea o escanea en caja
  "estado":        "pendiente",      // pendiente | pagado | anulado
  "monto":         4000,             // pesos chilenos, enteros, sin decimales
  "evento_id":     57,
  "evento":        "A MÍ ME GUSTA",
  "fecha_evento":  "2026-08-06",

  "persona":       "IGNACIO FUENTES",
  "rut":           "12.345.678-5",
  "qr_id":         "FCC-4761-92-1-0-00CA08F5CA",   // el ticket con el desajuste
  "pedido_id":     4761,

  "motivo":        "no_universitario",  // no_universitario | genero | otro
  "ticket_actual":  { "nombre": "Pre-Venta PRO HOMBRE UNIVERSITARIO", "precio": 10000 },
  "ticket_destino": { "nombre": "Pre-Venta PRO HOMBRE GENERAL",       "precio": 14000 },

  "emitido_por":   "Chris López",     // lo deriva el servidor de auth.uid()
  "emitido_at":    "2026-08-06T23:41:00-04:00",
  "vence_at":      "2026-08-07T05:00:00-04:00"   // cierra con el evento
}
```

`monto` **no** se recalcula en el POS. Viene cerrado desde la WEB porque el anfitrión pudo ajustarlo — regla vieja de FRATE: *los precios del catálogo son referencia, el monto final lo pone un humano*.

---

## 4. Las dos operaciones

### 4.1 Consultar — NO escribe

```
GET  https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-diferencia?codigo=DIF-000042
Authorization: Bearer <LLAVE_DE_ESTACION>
```

Devuelve el objeto de arriba, o:

```jsonc
{ "ok": false, "error": "no_existe" }      // código inventado o mal tecleado
{ "ok": false, "error": "ya_pagado", "pagado_at": "...", "ref_venta": "..." }
{ "ok": false, "error": "anulado" }        // el anfitrión se arrepintió
{ "ok": false, "error": "vencido" }        // el evento ya cerró
```

**Consultar nunca marca nada.** Misma regla que acordamos para lealtad: si consultar quemara el documento, un reintento o dos cajas mirando el mismo código lo perderían.

### 4.2 Cobrar — idempotente por `ref_venta`

```
POST https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/api-diferencia
Authorization: Bearer <LLAVE_DE_ESTACION>
Content-Type: application/json

{ "codigo": "DIF-000042", "ref_venta": "POS-2026-08-06-0731", "monto": 4000 }
```

Respuesta:

```jsonc
{ "ok": true, "estado": "pagado", "codigo": "DIF-000042", "monto": 4000,
  "qr_habilitado": "FCC-4761-92-1-0-00CA08F5CA" }
```

**Tres reglas de la operación de cobro:**

1. **Idempotente por `ref_venta`.** Si mandas dos veces el mismo `ref_venta`, la segunda devuelve el mismo `ok:true` sin cobrar de nuevo. Si mandas un `ref_venta` distinto sobre un código ya pagado, devuelve `ya_pagado` y **no** cobra.
2. **`monto` se manda para verificar, no para fijar.** Si el `monto` que envías no calza con el guardado, rebota con `monto_no_calza` y el monto correcto. Protege contra cobrar de menos por un dato viejo en pantalla.
3. **Al quedar pagado, la WEB habilita el QR.** Ese es el efecto que importa: la persona vuelve a la puerta y su código ya valida.

---

## 5. Lo que necesito de tu lado

1. **Una pantalla de cobro por código** en el POS: se teclea o escanea `DIF-000042`, muestra persona, motivo, monto y el ticket destino, y un botón de cobrar.
2. **Que el `ref_venta` sea el de tu venta**, el mismo que ya usas para el resto. Así la conciliación cuadra sin inventar un identificador nuevo.
3. **Que trates `ya_pagado` como caso normal, no como error rojo.** Va a pasar: la persona vuelve a la caja porque no entendió, o el cajero reintenta.
4. **Decirme qué llave usas.** Necesito saber si la estación manda una llave fija o un token por sesión, para gatear la edge function del lado correcto.

---

## 6. Para probar HOY sin esperarte

Pablo prueba esta noche. Como tu pantalla no va a estar lista, la WEB va a emitir el ticket de diferencia **con su código bien visible en pantalla**, y el cajero lo cobra a mano como una venta suelta. El anfitrión después lo marca pagado desde el admin.

Es un puente para una noche, no el diseño. Lo digo explícito para que no quede como definitivo.

---

## 7. Preguntas abiertas

1. **¿El cobro de diferencia debe salir en boleta?** Es un servicio adicional sobre una venta ya emitida. Ojo con esto: la WEB **todavía no emite boleta electrónica (DTE)** para ninguna venta — es una deuda conocida con el SII. Si tu lado sí emite, hay que decidir si la diferencia va como boleta aparte o como nota de débito sobre la original. **No sé la respuesta y no la voy a inventar.**
2. **¿Qué pasa si la persona paga la diferencia y después no entra?** ¿Se devuelve? Mi propuesta: no, igual que una entrada normal. Pero es decisión de Pablo.
3. **¿Puede el cajero cobrar una diferencia que nadie emitió?** Mi propuesta: no. Si el POS pudiera crear el cobro, el anfitrión deja de ser quien decide, que es justo lo que Pablo pidió.

---

## 8. Lo que NO cambia

- El QR original **no se reemplaza**. Se habilita el que ya tiene. La persona no recibe un código nuevo ni hay que reimprimir nada.
- **La lealtad sigue congelada.** Esto no la toca ni la necesita.
- El aforo no cambia: la persona ya estaba contada.

---

**Contacto:** respóndeme por el canal de sesiones. Si algo de este contrato no te calza, dilo ahora — es mucho más barato cambiarlo en el documento que después de que los dos lados lo implementen.
