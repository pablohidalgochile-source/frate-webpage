# BACKLOG FRATE WEB · 18-oct-2026, 02:00

Halloween: **jueves 29, viernes 30, sábado 31** — quedan **11 días**.
Al sábado 31 ya se le vendieron **249 entradas / $4.344.000**.

---

## 🔴 AHORA — operativo, no es código

**1 · VICENTE RIVERA, cumpleaños del 17-oct**
Pagó **$130.000**, ficha confirmada, y **nunca se le creó la lista**. Sus invitados no
tienen QR. Es el único de los 27 cumpleaños de esa noche en esa situación.
→ Crearle la lista desde el admin. Dos minutos.

---

## 🟠 07:00 — ya agendado, corre solo

Tarea `🌅 FRATE · turno de las 07:00`. Se detiene sola si hay un evento en vivo.

**2 · Subir el cómputo a Small** ← la causa de fondo de las dos caídas de anoche
Micro (1 GB RAM, 60 conexiones) → Small (2 GB, 90 conexiones). **+$5,23/mes.**
Reinicia la base ~5 min. Por eso va con el local cerrado y va primero.

**3 · Autovacuum de `net._http_response`**
Llegó a 45 MB con 114 filas vivas porque su autovacuum corrió **una sola vez, el 5-ago**.
Su limpieza tardaba 862 ms y se comió 19 horas de CPU. Limpiada a mano a la 1 AM; sin
esto vuelve a crecer.

**4 · El vaso de Halloween** — construido y verificado, falta desplegar
- 3 SQL (cupo + KPI + trigger)
- 4 archivos (comprar.html, admin.html, crear-pago, sync-erp)
- Crea los 2 extras **inactivos**: jue+vie con 500, sábado con 500

**5 · La prueba con plata real** ← la hace Pablo, no la tarea
Por carta, tiendita y extras **nunca pasó un pago real** (0 contra 25.186 entradas).
Activar el extra del jueves, comprar entrada + vaso con tarjeta ($1.080) y revisar los
cinco eslabones. No se salta.

---

## 🟡 EL FORMULARIO — está costando clientes hoy

**6 · El formulario miente**
Cuando rechaza por duplicado responde `ok:true`. La persona ve «listo, recibimos tu
solicitud» y **FRATE nunca recibe nada**. (`form-submit/index.ts:127`)

**7 · El bloqueo por NOMBRE**
`form-submit:123` bloquea si coincide el nombre. Dos personas distintas que se llamen
igual se bloquean entre sí, y **nunca mira la fecha**.
Caso real: MARTINA ÁLVAREZ gestionó el cumpleaños de MARIANA YÁÑEZ, quedó «ocupada», y
cuando quiso el suyo del 17-oct el sistema la rechazó. Por eso su lista (1369) es una
copia a mano de la de Javier.
→ Deduplicar por **persona + noche**, no por persona. Las **reservas sí pueden repetir**
   (Donka Urrutia reservó el 2, el 10 y el 17 de octubre). Los cumpleaños no.
Escala: 17 correos y 26 teléfonos repetidos, casi todos con fechas distintas.

**8 · Las fichas de WhatsApp nacen sin fecha**
**100 de 100.** El bot las crea con 4 datos y nunca pregunta cuándo. Son las que vuelven
invisibles los cumpleaños en el calendario. (`whatsapp/index.ts:163`)
Por el formulario web entran 1.459 fichas y **cero** sin fecha: ahí la validación funciona.

**9 · Fecha obligatoria del lado servidor**
Hoy solo la valida el navegador. `form-submit` no menciona la palabra «fecha» ni una vez.

**10 · Editar los datos de la ficha desde el admin**
Hoy se puede editar la gestión, pero lo que escribió el cliente queda congelado aunque
esté mal. Y las fichas de WhatsApp **no tienen dónde escribirle la fecha**.

**11 · Reabrir el formulario por link + mandarlo por WhatsApp**
No existe. Hay que construirlo.
⚠️ Decisión pendiente: ¿la persona puede cambiar **todo** o **solo lo que falta**?

---

## 🟡 EL CALENDARIO — diseñado, sin construir

**12 · Las cuatro funciones**
- `_fmClase(f)` → cumple | reserva
- `_fmEtapa(f)` → pagó | confirmado | consulta | descartado
- `_fmNoche(f)` → **la noche la manda la LISTA**, no el texto de la ficha
- `_fmSumar(fichas)` → cruza todo y devuelve separado

**13 · Las seis vistas que suman plata**
Calendario (mes, día, modal), Informe y Disposición (3 sitios). Hoy cada una repite su
propio bucle y mezcla cumpleaños con reservas.

**14 · Los montos separados por color en la celda**
Ámbar el cumpleaños, rosa la reserva, el total abajo en gris.
Ejemplo del 17-oct: hoy dice «🎂 45 · 🍾 2 · $700.000». Debería decir **27 y 1**, con
**$620.000** y **$80.000** aparte.

⚠️ Decisión pendiente: la tercera fuga (listas sin ficha, como Martina y Lucía). Cerrarla
es más trabajo; sin ella el conteo queda a dos de distancia del tuyo.

---

## 🟢 EL ERP

**15 · Les faltan dos columnas**
La WEB **ya les manda** el tipo y los montos (`crm.ts:114,152-153`). El ERP los recibe y
los deja caer dentro de un blob `web_datos`: **no tiene ninguna columna numérica** donde
aterricen. Por eso no puede sumar $620.000 de cumples contra $80.000 de reservas.
→ Es pega de ellos. Hay que mandarles la especificación.

**16 · No hay rastro de esos envíos**
`erp_sync_log` guarda 15.864 check-ins, 11.040 cortesías y 9.747 ventas — y **cero**
envíos de plata de cumpleaños/reservas. Si el ERP dice «nunca me llegó», no hay con qué
demostrarlo.

**17 · Choque de llaves latente**
Los ids **14, 15, 16 y 18** existen en `reservas` como `cumpleanos` y en `formularios`
como `cumple`. Viajan al ERP con la misma llave y una pisa a la otra. Hoy sin daño.

**18 · Todo cobro que no sea cumpleaños sale como «reserva»**
(`cobros.ts:562`). Hoy no pasa nada: solo hay folios CUM (105) y RES (5). El primer cobro
genérico que se pague va a llegar mal contado.

---

## 🟢 PENDIENTES VIEJOS — verificados vivos

**19 · `dev_monto` se suma dos veces**
`devolver-pago` llama seguidas a `_anotarDevuelto()` (:162) y `registrarNC()` (:262), y
**las dos escriben la misma columna**. El DATO se corrigió el 12-oct (15 pedidos,
$235.588), **el CÓDIGO no**: la próxima devolución vuelve a duplicar.
El daño: `dev_monto` **es el tope**, así que inflado **recorta en silencio** la segunda
devolución parcial, quema el QR y manda el correo por la cifra chica, sin error.

**20 · `sync-erp` bota la cola a las 1.000 filas**
Se comió **153 check-ins** de una noche. Con eso le pagas a las RRPP ($500 por persona
escaneada). En Halloween son tres noches seguidas: revienta seguro.

**21 · Halloween sin `tope`**
⚠️ Decisión pendiente: el stock no cuadra con el brief. El sábado tiene **350 entradas de
mujer donde el brief planificó 330** — 20 de más, ya vendidas. ¿Moviste cupo a mano entre
tramos, o el contador se desvió solo?

**22 · El modal del evento borra `clase` al guardar**
Se corrigieron los 32 tipos de Halloween el 12-oct, pero abrir el evento y apretar
Guardar los vuelve a dejar en NULL.

**23 · Las consultas pesadas del admin**
`items_pedido` agregado: 707 ms × 60.211 llamadas. Suma presión sobre una base justa.

---

## ⚪ SISTEMA DE TICKETS DE SOPORTE

No existe en la WEB (verificado por base y por código). El ERP lo está evaluando.
Se llamaría **«Soporte»**, no «ticket» — esa palabra ya significa entradas en el POS
(11.722 filas) y en la WEB (~20.000 líneas).
⚠️ Decisión pendiente: ¿uno solo compartido entre los proyectos, o uno por proyecto?
Ojo: son **dos bases distintas**, así que un sistema compartido vive en una y la otra le
pega por API.

---

## DECISIONES QUE ESPERAN A PABLO

1. Reabrir el formulario: ¿puede cambiar **todo** o **solo lo que falta**?
2. El calendario: ¿cerramos la tercera fuga (listas sin ficha)?
3. Halloween `tope`: ¿moviste cupo entre tramos o se desvió el contador?
4. Tickets de soporte: ¿uno compartido o uno por proyecto?
5. El paquete «Transporte / Van»: quedó apagado el 10-oct. ¿Lo dejamos así?
