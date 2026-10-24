# Propuesta · vitrina de tramos (que el precio suba solo)

**Estado: NO aplicada.** Es código vivo del escaparate público. Esperando el sí de Pablo.
Escrita el 8-oct-2026. Medida sobre el archivo, con líneas reales.

## Para qué

Halloween trae 12 tramos de preventa en el sábado: 4 por público, cada uno con su
`venta_desde` / `venta_hasta` y su precio. Hoy el front **no sabe que esas columnas
existen** (`grep -rln "venta_desde"` en todo el front devuelve sólo el .sql), así
que no hay forma de que la portada muestre sólo el tramo vigente.

Sin esto hay que entrar al admin tres veces —el 10, el 13 y el 20 de octubre— a
esconder el tramo vencido y activar el siguiente. Dos pasos, tres veces, tres
semanas distintas. Con esto el precio sube solo y nadie se acuerda de nada.

**No hace falta SQL.** Las columnas ya existen en `tipos_ticket` (verificado en
producción) y `sbGetEventos()` ya hace `select('*, tipos_ticket(*)')`
(frate-supabase.js:200), así que ya viajan al navegador. Lo único que falta es
mirarlas.

## Qué hace hoy

Cuatro filtros en la portada y uno en cada una de las otras dos páginas deciden qué
entrada se ve, y **ninguno mira la ventana**. Peor: no se comportan igual entre sí.

| archivo | línea | qué filtra hoy | mira `disponible` |
|---|---|---|---|
| index.html | 2905 | `proximoDeadline` — el chip del contador | sí |
| index.html | 2939 | `precioMinEvento` — el "desde $X" de la tarjeta | **no** |
| index.html | 2988 | `visibles` — decide si el evento sale "agotado" | sí |
| index.html | 3992 | `ttActivos` — la lista de entradas de la tarjeta | sí |
| comprar.html | 154 | `TKS` — la lista de la página de compra | no (muestra Agotado en gris, a propósito) |
| links.html | 151 | si el evento tiene venta abierta, en el linktree | sí |

Consecuencia concreta el 11 de octubre, con PREV 1 ya vencida:

- **si le quedó cupo** → sale en la lista, el cliente la clickea y el servidor la
  rebota con "esta preventa ya cerró" (`crear-pago:320`). Callejón sin salida.
- **si se agotó** → desaparece de la lista por el filtro de 3992, pero la tarjeta
  sigue anunciando **"desde $16.000"** por el de 2939, que no mira `disponible` ni
  ventana. Precio que miente.

La plata no se fuga en ninguno de los dos casos: la guarda del servidor está
desplegada (`crear-pago:315-321` y `reanudar-pago:116-129`, v51/v26) y compara
contra `new Date()` absoluto. Lo que está roto es el escaparate.

## Qué va a hacer

Un helper de tres líneas y los seis filtros pasando por él.

### 1 · index.html:3536 — el mapper deja pasar las dos columnas

El mapper whitelistea campos, así que hoy las tira aunque lleguen.

```diff
         venceHora:    tt.vence_hora || '',
+        ventaDesde:   tt.venta_desde || null,     // ⏳ tramos de preventa: instantes
+        ventaHasta:   tt.venta_hasta || null,     //    absolutos (timestamptz)
         instrucciones:  tt.instrucciones || '',
```

### 2 · index.html — el helper, junto a `precioMinEvento`

```js
// ⏳ ¿este tramo está en su ventana de venta AHORA?
// Sin ventana → se vende siempre, como siempre se vendió (aditivo).
// Instantes absolutos: se comparan con new Date(), NUNCA con dtEvento() —
// la ventana no está anclada a la fecha del evento.
function enVentana(t, ahora) {
  const n = ahora || new Date();
  const d = t.ventaDesde ? new Date(t.ventaDesde) : null;
  const h = t.ventaHasta ? new Date(t.ventaHasta) : null;
  if (d && !isNaN(+d) && n < d) return false;
  if (h && !isNaN(+h) && n >= h) return false;
  return true;
}
```

### 3 · index.html — los cuatro filtros

```diff
-    if (tt.estado !== 'Activo' || (tt.disponible || 0) <= 0 || !tt.venceHora || !ev.fechaRaw) return;
+    if (tt.estado !== 'Activo' || (tt.disponible || 0) <= 0 || !enVentana(tt, ahora)) return;
+    if (!tt.venceHora || !ev.fechaRaw) return;
```
(2905 · `proximoDeadline`)

```diff
-  const tt = (ev.tiposTicket || []).filter(t => t.estado === 'Activo' && t.soloWeb !== false);
+  const tt = (ev.tiposTicket || []).filter(t => t.estado === 'Activo' && t.soloWeb !== false && enVentana(t));
```
(2939 · `precioMinEvento` — acá está el "desde $X" que hoy miente)

```diff
     const visibles = (ev.tiposTicket || []).filter(t =>
-      t.soloWeb !== false && t.estado !== 'Oculto' && t.estado !== 'Cerrado');
+      t.soloWeb !== false && t.estado !== 'Oculto' && t.estado !== 'Cerrado' && enVentana(t));
```
(2988 · `visibles`)

```diff
   const ttActivos = (ev.tiposTicket || []).filter(t =>
     t.soloWeb !== false && t.estado !== 'Agotado' && t.estado !== 'Oculto' &&
-    t.estado !== 'Cerrado' && t.estado !== 'Venta solo RRPP' && (t.disponible ?? 1) > 0
+    t.estado !== 'Cerrado' && t.estado !== 'Venta solo RRPP' && (t.disponible ?? 1) > 0 &&
+    enVentana(t)
   );
```
(3992 · `ttActivos`)

### 4 · index.html:2900 — el contador que pidió Pablo

Ya existe toda la máquina: `proximoDeadline` → `cuentaChip` → `.cd-timer` →
`fmtRestante`, y el texto ya dice **"⏳ Preventa termina en …"**, que es
exactamente lo que pidió y sin anunciar el precio futuro. Hoy sólo se alimenta de
`venceHora` (una hora del día del evento). Hay que dejarlo también mirar
`ventaHasta`, que es el fin del tramo:

```diff
   (ev.tiposTicket || []).forEach(tt => {
-    if (tt.estado !== 'Activo' || (tt.disponible || 0) <= 0 || !tt.venceHora || !ev.fechaRaw) return;
-    const dt = dtEvento(ev.fechaRaw, tt.venceHora);
-    if (dt > ahora && (!mejor || dt < mejor.dt)) mejor = { dt, tipo: 'preventa' };
+    if (tt.estado !== 'Activo' || (tt.disponible || 0) <= 0 || !enVentana(tt, ahora)) return;
+    // fin del tramo (instante absoluto) o vencimiento del día del evento: el que llegue primero
+    const cands = [];
+    if (tt.ventaHasta) { const d = new Date(tt.ventaHasta); if (!isNaN(+d)) cands.push(d); }
+    if (tt.venceHora && ev.fechaRaw) cands.push(dtEvento(ev.fechaRaw, tt.venceHora));
+    cands.forEach(dt => { if (dt > ahora && (!mejor || dt < mejor.dt)) mejor = { dt, tipo: 'preventa' }; });
   });
```

⚠️ Ojo con la ventana de 48 h del final de `proximoDeadline`
(`((mejor.dt - ahora) / 36e5) <= 48`): el chip aparece recién 2 días antes de que
cierre el tramo. Para PREV 1 (cierra el 10) eso significa que el contador se ve
desde el 8. Es el comportamiento actual y **no lo toco** — si Pablo lo quiere
siempre visible, es cambiar ese 48 y es otra decisión.

### 5 · comprar.html:154

```diff
-    TKS = (tks||[]).filter(t=>['Activo','Solo venta WEB','Venta solo RRPP','Agotado'].includes(t.estado) && (t.solo_web!==false));
+    const _ahora=new Date();
+    const _enVentana=t=>{ const d=t.venta_desde?new Date(t.venta_desde):null, h=t.venta_hasta?new Date(t.venta_hasta):null;
+                          if(d&&!isNaN(+d)&&_ahora<d) return false; if(h&&!isNaN(+h)&&_ahora>=h) return false; return true; };
+    TKS = (tks||[]).filter(t=>['Activo','Solo venta WEB','Venta solo RRPP','Agotado'].includes(t.estado) && (t.solo_web!==false) && _enVentana(t));
```

El `select('*')` de la línea 146 ya trae las columnas: no hay que tocar el query.

### 6 · links.html:151

Acá sí hay que agregar las columnas, porque el select es explícito:

```diff
-const { data:tks }=await sb.from('tipos_ticket').select('evento_id,estado,disponible,vence_hora').in('evento_id',evIds);
+const { data:tks }=await sb.from('tipos_ticket').select('evento_id,estado,disponible,vence_hora,venta_desde,venta_hasta').in('evento_id',evIds);
```

…y filtrar con el mismo criterio donde se decide si el evento tiene venta abierta.

## Qué se podría romper

1. **Si una entrada tiene `venta_hasta` mal puesta, desaparece de la vitrina.**
   Hoy una fecha mala no tenía efecto ninguno en el front; con esto, sí. El riesgo
   está acotado porque el ingest filtra con un ISO estricto y descarta la basura en
   vez de escribirla (`api-evento-ingest:206`), pero un humano editando la base a
   mano puede poner cualquier cosa. **Mitigación:** `enVentana` ignora las fechas
   ilegibles (`isNaN`) en vez de esconder la entrada — ante una fecha corrupta se
   comporta como hoy, que es el lado seguro.

2. **Un evento cuyos tickets estén todos fuera de ventana se verá sin entradas.**
   Es lo correcto, pero es un cambio visible: hoy mostraría las entradas y el
   servidor las rebotaría. Si algún evento viejo tiene ventanas puestas por error,
   quedaría vacío. **Lo comprobé:** hoy no hay ninguna fila con `venta_desde` o
   `venta_hasta` en la base, así que el cambio no afecta a ningún evento existente
   — sólo a Halloween cuando se cargue.

3. **El chip del contador puede cambiar de fecha en eventos que ya lo muestran.**
   Pasa a considerar también `ventaHasta`, así que si un evento tuviera las dos
   cosas, podría adelantarse. Mismo caso que arriba: ninguna fila tiene ventana
   hoy, así que ningún evento vivo cambia.

4. **Tres copias del helper en vez de un módulo compartido.** Es a propósito:
   agregar un `<script>` nuevo a tres páginas públicas es un patrón nuevo y una
   dependencia de red más en el camino crítico de la compra. Tres helpers locales
   de 6 líneas son más feos y más seguros. Si se prefiere el módulo, va a
   `frate-format.js`, que ya está en las tres.

## Cómo se revierte

Las tres páginas son archivos estáticos en Vercel: `vercel rollback` al deploy
anterior, o quitar `&& enVentana(t)` de los seis filtros y las dos líneas del
mapper. No hay migración, no hay estado, no hay nada que deshacer en la base.

## Qué NO toqué y queda anotado

- **`guardarEvTickets` (admin.html:6218)** escribe `disponible: t.disponible||0`.
  Si un admin abre el editor del evento y guarda mientras se vende, devuelve el
  contador al valor que tenía al abrir el modal → sobreventa. **No lo arreglo
  acá**: es otro archivo, otra causa y merece su propio diff. Lo que sí verifiqué
  es que ese guardado **no borra las ventanas**: `_saveTt` hace un UPDATE con un
  `row` explícito que no incluye `venta_desde`/`venta_hasta`, y un PATCH no pisa
  las columnas que no menciona. Los tramos sobreviven a un guardado del admin.
- **El editor del admin no tiene campos para `venta_desde`/`venta_hasta`.** Con
  esta propuesta la vitrina los respeta, pero para cambiarlos hay que ir a la base.
  Los inputs + el semáforo por fila son el paso siguiente, aparte.
- **`_briefTickets` (admin.html:5490)**, el importador del botón del admin, sigue
  buscando por nombre y fusionando los tramos. Es el otro diff pendiente.
- **La ventana de 48 h del chip** (`proximoDeadline`), por lo dicho arriba.
