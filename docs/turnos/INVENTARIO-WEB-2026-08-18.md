<!-- BORRADOR · turno 2026-08-18 · sin revisar -->

# FRATE WEB · Inventario honesto
**18 de agosto de 2026** — escrito por la sesión de la ticketera, sin adornos.

---

## Tamaño real

| | |
|---|---|
| Páginas `.html` | 74 |
| Edge functions | 39 |
| Archivos `.sql` | **245** |
| JS compartidos | 17 |
| `admin.html` | **1.453 KB** en un solo archivo |

Ese último número es el dato incómodo: el panel completo vive en un archivo de
1,4 MB con un solo bloque `<script>` de 1,1 MB. Funciona, pero cualquier
edición por texto puede partir una cadena a la mitad. Ya pasó tres veces esta
semana; una dejó el admin caído.

---

## Lo que está HECHO y probado en vivo

- **Venta**: carrito → MercadoPago → QR. El precio se valida en el servidor, el
  webhook re-consulta a MP, compara monto y es idempotente.
- **Transferencia** por Khipu, con conciliación propia.
- **Puerta**: escaneo, incidencias, registro por carnet, aforo en vivo.
- **Devoluciones**: parciales, notas de crédito, cambio de día, ticket de diferencia.
- **Comunidad**: listas, RRPP con pago por persona escaneada, portal de embajadoras.
- **WhatsApp**: inbox nativo, ahora unificado con chat web e Instagram.
- **Correos**: comprobante con QR, bienvenida, rebotes.
- **Google**: entrar con cuenta, con creación de ficha y datos faltantes.

---

## Lo que está A MEDIAS

**El canon de La Frate.** Existe el handoff maestro completo (nueve Casas,
siete rangos, Créditos, Matrícula, Frate ID). El sistema tiene motor de puntos
y membresías, pero **no tiene Casas ni rangos**, y tiene **un solo contador**
donde el canon exige dos. Esperando once decisiones del dueño.

**Los convenios.** Pantalla construida y desplegada; la tabla **no existe** en
producción. Sale vacía a propósito hasta que se corra el SQL.

**Los premios por link.** Igual: página pública, panel y funciones listas; las
tablas esperan.

**La bandeja de cumples y reservas.** Funciona, pero lee dos tablas distintas
(`reservas` y `formularios`) porque una persona cae en una u otra según por
dónde pidió. Se unificó en pantalla, no en datos.

**La verificación de marca de Google.** Enviada, en manos de Google.

---

## Lo que está ROTO o abierto

**La vista `v_lista_publica` deja listar todas las listas sin sesión** —
incluidos nombres de cumpleaños— porque se creó con `security_invoker = off`,
que se salta la RLS. La tabla base ya está cerrada; la vista no. Con los
códigos a la vista, alguien podría inscribirse en cualquier cortesía abierta.
**Es lo primero que hay que arreglar.**

**Cualquiera con cuenta puede escribirse puntos.** La política de update no
tiene `with check` y el trigger que protege rol y crédito no incluye `puntos`.
Hoy no duele porque la lealtad está apagada. SQL escrito, sin correr.

**La ruleta y los referidos reparten crédito saltándose el interruptor** de
lealtad. Contenidos hoy solo porque la ruleta está oculta.

**El beneficio de Matrícula «entrada gratis» no tiene tope.** Descuenta todo el
subtotal de entradas del carrito. Contenido porque no hay membresías vendidas.

**`sync-erp` no encola cuando falla.** Si el ERP se cae, se pierden check-ins
sin dejar rastro.

**Un portero puede marcar cobrado un ticket de diferencia** sin que la caja
cobre, y el bloqueo del QR es solo de pantalla.

---

## Deuda técnica medible

| | |
|---|---|
| Bucles que traen todas las filas para sumar | **6** |
| `count: 'exact'` sobre tablas que crecen | **17** |
| Archivos `.sql` sin registro de cuáles se corrieron | **245** |

Ese último es el peor. **El repo no es la base.** No hay carpeta de migraciones
ni bitácora. Hoy se construyó una pantalla completa contra una tabla
inexistente y nadie se enteró hasta abrirla.

Mitigación existente: `frate-REVISION-TODOS.sql` le pregunta a la base cuáles
de los 125 archivos verificables están aplicados. Es un parche, no una solución.

---

## SQL escrito y sin correr

`SEGURIDAD-listas-3` · `SEGURIDAD-puntos` · `convenios-1` · `premios-1` y `-2`
· `listas-duenio-real` · `eventos-vencidos-revision` · `logo-correos` ·
`totales-servidor` · `URGENTE-indices`

---

## Documentación

Diez `.md` en la raíz: contratos con el ERP, arquitectura del CRM y del sync,
hand-offs de diseño y del bot. Está **al día en los contratos entre proyectos**
y **ausente en lo interno**: no hay documento que explique cómo funciona el
admin por dentro, ni cuál de los 245 SQL corresponde a qué.

---

## Lo que necesita el dueño

1. Cerrar la vista `v_lista_publica` — es lo único que está abierto ahora.
2. Correr `SEGURIDAD-puntos` antes de encender cualquier cosa de lealtad.
3. Responder a Isidora, Álvaro y Carol — tres devoluciones esperando.
4. Las once decisiones del canon de La Frate.
