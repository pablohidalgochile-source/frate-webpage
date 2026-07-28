# HANDOFF · Quién entra y quién firma — los 4 sistemas

**Para:** ERP · POS · Web/Ticketera · Flyer
**Estado:** el ERP ya está implementado y desplegado. Es la referencia.
**Decisión del dueño (27-07-2026):** *«cada uno con su propio login y además una clave compartida, así debería ser para todos los sistemas»*.

Pégale este documento entero a la sesión de tu sistema. No es una sugerencia de diseño: es el contrato que los cuatro tienen que cumplir para que después exista un login único de verdad.

---

## 1. El problema que estamos cerrando

Los cuatro sistemas nacieron con **una llave compartida**: un PIN o una clave que sabe todo el equipo. Funciona, pero tiene dos consecuencias que ya nos costaron caro:

1. **Nadie sabe quién hizo qué.** En el ERP, aprobar un pago escribía literalmente la palabra `"admin"`. Con $21,8M mensuales en sueldos pasando por ahí, no había forma de saber quién aprobó.
2. **No se puede dar acceso parcial.** Si la llave abre todo, no existe «que el de bodega entre pero solo vea inventario».

---

## 2. El modelo: dos puertas

Todo sistema tiene **exactamente dos** formas de entrar a su panel de administración.

### 🚪 Puerta principal — con la ficha propia

La persona se identifica con **algo suyo**: su RUT, su correo, su usuario. Y su clave personal.

- El sistema busca su ficha, valida la clave y **guarda quién es en la sesión**.
- A partir de ahí, **todo lo que haga queda firmado con su nombre**.
- Su rol decide qué ve.

### 🔑 Puerta de respaldo — la llave compartida

La clave de siempre, que sabe todo el equipo.

- **No se elimina.** Existe para cuando alguien pierde su clave un sábado a las 3 de la mañana y hay que abrir la caja igual.
- Entra con acceso completo, **pero lo que haga se firma como «llave compartida»**, no como una persona.
- La pantalla lo advierte de frente: *«Esta llave la sabe todo el equipo, así que no queda registro de quién entró. Úsala solo si perdiste tu clave.»*

> **Por qué no se borra la llave:** un sistema que puede dejarte afuera en medio de una noche es peor que uno con una llave imperfecta. La llave se desincentiva mostrando que no firma, no prohibiéndola.

---

## 3. Las seis reglas que todos deben cumplir

**R1 · Cada acción que toca plata o datos de terceros queda firmada.**
No con un rol («admin»), no con un sistema («erp»): con **la persona**. Si entró por la llave compartida, se firma «llave compartida» — que es la verdad, y por eso incomoda.

**R2 · La llave compartida nunca se elimina, pero nunca es la puerta por defecto.**
Se ofrece segunda, con su advertencia.

**R3 · Los permisos fallan cerrados.**
Un rol al que no se le asignó ningún módulo **no ve nada**. Nunca «como no sé qué puede ver, que vea todo».

**R4 · La ficha manda sobre la sesión.**
Si a alguien lo dan de baja o le suspenden el acceso, su sesión deja de valer aunque el navegador la tenga guardada. Se revalida contra la base, no contra `localStorage`.

**R5 · Una persona es una sola ficha en los cuatro sistemas.**
El hilo es el **RUT** para la gente que trabaja con nosotros, y el **correo** para las cuentas. Si tu sistema usa correo y otro usa RUT, tu ficha tiene que guardar **los dos**.

**R6 · Nadie se puede auto-degradar ni auto-eliminar.**
El rol de máximo privilegio no puede quitarse a sí mismo el acceso ni borrar su propia ficha. Se necesita otro con el mismo nivel.

---

## 4. Cómo quedó implementado en el ERP

Esto es lo concreto, por si te sirve de molde. **No copies los nombres de tabla** — copia la forma.

### La sesión

```js
// Entró con su ficha
{ type:'admin', via:'ficha', personal_id, nombre, rut, role }

// Entró con la llave compartida
{ type:'admin', via:'llave' }
```

### Quién firma

Una sola función, leída desde la sesión guardada, para poder llamarla desde
cualquier servicio sin arrastrar props:

```js
export function actorActual() {
  const s = JSON.parse(localStorage.getItem('frate_session') || 'null')
  if (!s) return 'desconocido'
  if (s.type === 'admin' && s.via === 'ficha' && s.nombre) return s.nombre
  if (s.type === 'admin') return 'llave compartida'
  if (s.type === 'staff' && s.nombre) return s.nombre
  return 'desconocido'
}
```

Se usa en cada escritura que importa: `pago_aprobado_by`, `created_by`, `liquidado_por`.

### Los roles

| | |
|---|---|
| **Máximo** | `admin` — todo el panel |
| **Acotados** | `productor` · `adquisiciones` · `audiovisual` · `servicios` · `bodega` · `puerta` · `seguridad` |
| **Sin panel** | `staff` — solo el portal personal |

La matriz «rol → módulos que ve» vive en una sola fila de configuración, editable sin tocar código. Ejemplo real:

```
seguridad → inicio · eventos · puerta · personal · documentación
            (NO ve plata: ni pagos, ni inventario, ni configuración)
```

### La deuda que quedó, y que probablemente también tengas

🔴 **Las claves personales están en texto plano.** Cualquiera con acceso a la tabla las lee. No se corrigió todavía porque hashearlas deja a las 83 personas afuera hasta que reconfiguren. **Necesita un plan de migración, no un commit.** Revisa si tu sistema tiene el mismo problema.

---

## 5. Qué necesito de tu sistema

Respóndeme estas seis. **Verifica en el código real, no supongas.** Si algo no lo puedes confirmar, dilo.

1. **¿Cómo se entra hoy a tu panel?** ¿Clave compartida, usuario por usuario, o las dos?
2. **¿Cuál es tu rol de máximo privilegio?** Cómo se llama, en qué tabla y columna vive, y cómo se asigna.
3. **¿Tus acciones quedan firmadas?** Busca en tu código escrituras tipo `created_by`, `updated_by`, `aprobado_por`. ¿Guardan una persona o una palabra fija? Dame archivo y línea.
4. **¿Tienes roles acotados?** ¿Existen y de verdad recortan, o están escritos pero nadie los aplica? *(En el ERP existían hace meses y no recortaban nada — revísalo de verdad, no por el nombre del archivo.)*
5. **¿Tu ficha de persona guarda RUT y correo?** Si guarda solo uno, dime cuál falta.
6. **¿Cómo guardas las claves?** Texto plano o hash.

Y después: **qué te falta para cumplir las seis reglas**, con una estimación honesta.

---

## 6. Lo que viene después (no lo hagas todavía)

Esto es el **paso corto**: que cada sistema sepa quién entra, por su cuenta.

El **paso siguiente** es el login único: un solo proveedor de identidad que los cuatro respeten, para que entrar a uno sea entrar a todos. Pero eso solo se puede construir encima de sistemas que ya sepan distinguir personas. Un sistema con llave compartida no se puede conectar a un SSO — no tiene a quién conectar.

Por eso el orden importa: **primero identidad en cada casa, después la puerta común.**

---

## Reglas de la respuesta

- Verifica contra el código real. Ábrelo.
- No cambies nada grande sin confirmación del dueño.
- No escribas ni pidas contraseñas en el chat ni en el repo.
- Español de Chile, tuteo. Nunca argentinismos ni voseo.
