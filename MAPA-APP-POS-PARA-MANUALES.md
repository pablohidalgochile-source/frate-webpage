# MAPA DE LA APP POS — fuente de verdad para la serie del libro

**Para:** quien escribe `os-pos.html` + `os-pos-{turno,venta,dinero,puerta,catalogo,reglas}.html`.
**Regla:** todo esto está **verificado contra el código real del POS** (schema `pos`, `apps/web`). No inventes cifras ni flujos: si algo no está acá, pregúntame. Color del sistema: **morado `#A855F7`** (ya en `--sys-pos`).

Estructura de la serie (igual que ERP): **00 El mapa · 01 El turno · 02 La venta · 03 El dinero · 04 Puerta y barra · 05 El catálogo · 06 Reglas de oro.**

---

## DATOS REALES · evento BESUCONA (25-jul-2026) — úsalos, son verdaderos
- **Total cobrado:** $4.378.000 en **267 ventas** (269 pagos; hay ventas mixtas).
- **Por método:** Débito $2.727.500 (171) · Crédito $805.500 (45) · Efectivo $845.000 (53). Tarjeta ≈ **81%** de la noche.
- **Las 3 cajas (cotejo → cierre):**

| Caja | Operador | Cotejo (sencillo) | Fondo | Efectivo esperado | Contado | Diferencia |
|---|---|---|---|---|---|---|
| Puerta 1 | Constanza | 2×$10.000 · 4×$5.000 · 50×$1.000 | $90.000 | $187.000 | $187.000 | **$0** |
| Puerta 2 | Daniela | 3×$10.000 · 4×$5.000 · 50×$1.000 | $100.000 | $240.000 | $241.000 | **+$1.000** |
| Caja Schop | — | 2×$10.000 · 4×$5.000 · 50×$1.000 · 10×$500 · 20×$100 | $97.000 | $211.000 | $201.000 | **−$10.000** (faltante real) |

> El −$10.000 de Schop **no es bug**: es plata que faltó. Sirve para el capítulo "cuando hay diferencia".

---

## CÓMO SE ENTRA + ROLES (para el 00 y para el manual, y de paso lo pide el contrato de identidad)
- **Panel (backoffice):** login **individual** con Supabase Auth (correo + clave por persona). Clave hasheada (bcrypt). Hoy el único login es el del dueño (`pablohidalgochile@gmail.com`, rol `super_admin`).
- **Sunmi (operación):** el cajero **no tiene login**: entra con un **PIN por terminal** (`activation_code`). Los cajeros son **nómina** (`event_staff`, con RUT), no usuarios.
- **Rol máximo:** `super_admin` ("Acceso total"): `has_permission()` le pasa todo y `is_super_admin()` le salta el aislamiento por organización.
- **Los 11 roles (reales, en `pos.roles`):** `super_admin` · `owner` · `admin` · `gerente` · `jefe_barra` · `jefe_puerta` · `cajero` · `bartender` · `puerta` · `auditor` · `soporte_tecnico`. **Recortan de verdad** (fail-closed: rol sin permiso → no ve nada).

---

## 00 · EL MAPA  (`os-pos.html`)
**Hero:** "El cerebro que **cobra la noche**" / sub: qué guarda el POS, de qué manda y de cuáles obedece.
**Cap 1 · Los 4 cerebros** (usa `.cer`, marca POS): Flyer (nace el evento) · Web (vende y registra: entradas, QR, clientes) · **POS (cobra adentro: barra y caja)** · ERP (consolida: personal, finanzas, ficha maestra).
**Cap 2 · De qué es dueño el POS** (tabla): Consumo en barra ✅POS · Caja del turno (fondo, cotejo, cierre) ✅POS · **Entrada y cover: COMPARTIDO POS+Web** · Catálogo → del Flyer/ERP · Cliente/ficha → Web.
**Contradicción (`.choque`) — la entrada es compartida (R35):** un QR es un token de **namespace compartido POS↔Web**; ambos venden y ambos queman; leer el código del otro es normal. Quemar es **idempotente cruzado** (doble scan = un ingreso); el **ERP concilia y gana el primer quemado**. *(Verificado: vista `public.v_pos_qr_burns`, comentario R35.)*
**Cap 3 · Qué pasa si algo se cae:** internet 🟢 (el POS vende offline y sincroniza) · Web 🟡 (cobras consumo igual; covers ya importados siguen) · una máquina 🔴 (se pierde esa caja → varias máquinas c/u con respaldo) · ERP 🟡 (vendes/cierras normal; la consolidación se pone al día).

## 01 · EL TURNO  (`os-pos-turno.html`)  — el viaje de una caja
**Flujo (`.paso`):** 1 Abrir (contar el sencillo = cotejo + PIN) → 2 Vender → 3 Corte X (lee el turno sin cerrar) → 4 Cerrar (contar el cajón y cuadrar).
**Cap 1 · El cotejo:** abrir NO es escribir "$90.000", es **contar los billetes**; el POS suma solo. Tabla con las 3 cajas de BESUCONA (arriba).
**Casos reales (2 roles):** 👤 Operador → *Constanza cuenta 2×$10.000+4×$5.000+50×$1.000, pone su PIN, imprime apertura, fondo $90.000.* 🛠 Admin → *ve que Puerta 2 anotó mal el fondo y lo corrige en Eventos → BESUCONA → ⋯ → Editar fondo/cotejo.*
**Demo interactiva (cuadre):** sliders fondo + ventas efectivo → "debe haber = fondo + ventas"; input contado → diferencia (verde si $0). Caso real: P1 $90.000+$97.000=$187.000, calzó en $0.
**Callouts:** 🟡 oro: efectivo esperado = **fondo + ventas efectivo**, nunca solo el fondo; la tarjeta cuadra aparte. 🔴 peligro: **no abras dos veces la misma caja** (reapertura → sesión vieja → diferencia falsa gigante; se corrige el cotejo, no se reabre). *(Verificado: bug real de reapertura, fix SQL 64 cuenta por activación.)*

## 02 · LA VENTA  (`os-pos-venta.html`)  — el viaje de una venta
**Flujo (`.paso`):** Producto → Carrito → Pago → Comprobante (ticket con QR).
**Cap 1 · Cómo se paga** (tabla, métodos REALES): Efectivo (registra + vuelto; cuadra en el cajón) · Tarjeta (cobra en el Mercado Pago **Point** y espera OK; cuadra vs voucher) · **Mixto** (parte efectivo + parte tarjeta en una venta) · Cortesía ($0 con motivo, igual emite ticket QR, queda auditada). *(Métodos reales: cash/debit/credit/transfer/prepaid/mixed/courtesy.)*
**Callout 🔴:** la tarjeta se cobra **antes** de registrar; si algo falla, el POS **reintenta con el mismo folio** y el servidor lo colapsa en UNA venta — nunca cobra dos veces ni pierde el cobro.
**Casos reales:** 👤 Operador → *3 chelas + 2 shots, cobra débito en el Point; o mixto si pagan mitad y mitad.* 🛠 Admin → *en Ventas en vivo ve subir el total ($4.378.000); "Corregir venta" con PIN si el cajero se equivocó.*
**Cap 2 · La noche en plata:** stats BESUCONA (267 ventas · $4.378.000 · tarjeta 81%) + tabla por método.
**Callout 🟢:** vende sin internet (guarda y sincroniza); candado por folio contra doble-toque.

## 03 · EL DINERO  (`os-pos-dinero.html`)  — el viaje del efectivo y la tarjeta
**Cap 1 · Esperado vs contado:** Efectivo = fondo + ventas efectivo, contado billete a billete, la diferencia es plata real. Tarjeta = vs voucher del datáfono (con Point integrado se autocompleta). Tabla de las 3 cajas (P1 $0 · P2 +$1.000 · Schop −$10.000).
**Callout 🟡:** la **propina de tarjeta va aparte** (línea separada en el cierre, no infla las ventas). *(Verificado: SQL 22 propina como línea aparte.)*
**Casos reales:** 👤 Operador → *cierra Puerta 2, cuenta $241.000, sobra $1.000, escribe observación y cierra.* 🛠 Admin → *revisa los 3 cierres; el −$10.000 de Schop es faltante real, habla con quien tuvo la caja.*
**Cap 2 · Cuando hay diferencia:** $0 cierra sola · sobra/falta poco → observación obligatoria · falta real → alguien responde.

## 04 · PUERTA Y BARRA  (`os-pos-puerta.html`)  — el viaje de una entrada y un cover
**Cap 1 · Entrada en la puerta, cover en la barra:** la Puerta valida SOLO entradas (un cover se rechaza sin quemarse: "canjéalo en la barra"); la Barra valida SOLO covers; cada cover se quema una vez, el 2° intento avisa "ya utilizado". *(Verificado: `validate_ticket` con `p_expected_type`.)*
**Contradicción/callout 🟡 (R35):** Web y POS venden y queman la MISMA entrada, cada uno lee el QR del otro; idempotente cruzado; el ERP concilia y gana el primer quemado. Los covers que vende la Web **entran al POS** (`import_web_covers` → `pos.tickets`) para leerse igual que los propios.
**Demo interactiva (un QR = un ingreso):** botones "Escanear en POS" / "Escanear en Web" / "Reiniciar" → 1° = ACEPTADO, 2° = YA UTILIZADO (da igual el origen).
**Casos reales:** 👤 Operador → *escanea cover: ACEPTADO; mismo QR otra vez: YA UTILIZADO.* 🛠 Admin → *configura Puerta=entradas, Barra=covers; revisa la conciliación de QR con la Web.*

## 05 · EL CATÁLOGO  (`os-pos-catalogo.html`)  — el viaje de un producto
**Flujo (`.paso`):** Producto → Combo (2×1, packs, precio-con-cover) → Promo (con hora de inicio y **expiración**) → **Inventario** (se mapea al stock del ERP, 🔵).
**Callout 🟡:** la promo **expira sola** (desaparece del POS al vencer; nadie tiene que sacarla a mano). 🟢: el **stock baja en el cierre o por lote, NUNCA en la venta** (meter esa resta en la venta ya tumbó cobros con tarjeta una vez → por eso va aparte). *(Verificado: memoria "NUNCA sync en el path de venta"; disponibilidad por `available_from/until`.)*
**Casos reales:** 👤 Operador → *a las 2 AM la promo 2×1 ya no aparece: expiró sola, cobra precio normal.* 🛠 Admin → *arma la carta de BESUCONA: productos, combo con precio-con-cover, promo 00:00–01:00, mapea al stock del ERP.*

## 06 · REGLAS DE ORO  (`os-pos-reglas.html`)
**Nunca (🔴):** no desplegar en vivo (las máquinas quedan a medias; se sube entre eventos) · no meter stock/sincronización dentro de la venta (todo lo pesado va en el cierre/lote) · no reabrir una caja para "arreglarla" (crea 2ª sesión y descuadra; se corrige el cotejo).
**Bien resuelto (🟢):** vende sin internet · un QR = un ingreso (idempotencia cruzada) · el cotejo billete a billete · la tarjeta no se cobra dos veces (reintento por folio).
**Lo que el POS NO hace (todavía) — honestidad:** no emite boleta con validez SII (imprime comprobante propio con QR, sin timbre) · no descuenta stock en tiempo real en la venta (se ajusta en el cierre) · no maneja mesas ni cuentas por mesa (venta directa de barra y puerta).
**Casos reales:** 👤 Operador → *si la Sunmi se pone rara tras una actualización, ciérrala del todo y ábrela; las ventas quedan en cola, no se pierden.* 🛠 Admin → *nunca subir versión en vivo; corregir cierres por el cotejo, no reabriendo.*

---

## NAVEGACIÓN (pie de cada página, estilo ERP)
`FRATE OS · POS · Manual 0X · [Ver la serie del ERP] · [Siguiente: … →]`. El índice `os-pos.html` lista los 7 con tarjetas `.mn` (00→06).

## Referencias en el repo POS (por si quieres el detalle técnico)
`frate-pos/docs/os/` (mi versión previa, autocontenida) · `supabase/64_fix_cierre_por_activacion.sql` (bug reapertura) · `65/66_import_web_covers.sql` (covers R35) · `54_pos_qr_burns.sql` (conciliación) · `36_fix_cierre_totales.sql` (cuadre). Cualquier duda de contenido, me preguntas — no inventes.
