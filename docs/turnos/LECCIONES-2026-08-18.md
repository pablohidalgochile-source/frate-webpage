<!-- BORRADOR · turno 2026-08-18 · sin revisar -->

# Tres lecciones de un día en producción
**FRATE WEB · 18 de agosto de 2026**

Escritas para que no vivan solo en una conversación. Las tres salieron de
errores reales de este día, dos de ellos míos.

---

## 1 · Un SQL urgente lleva solo lo indispensable

**Lo que pasó.** Le mandé a Pablo un arreglo de seguridad. De paso le agregué
una mejora que nombraba una columna (`co_duenios`) que no existe en su base.

El editor de Supabase corre todas las sentencias en **una transacción**. Esa
línea falló y se deshicieron **todas** las demás, incluidos los dos borrados de
políticas que eran el motivo del archivo.

Él lo corrió, quedó tranquilo, y el hoyo seguía abierto.

**La lección.** Un SQL que arregla algo urgente lleva **solo eso**. Nada de
aprovechar el viaje. Si la mejora de paso falla, se lleva puesto el arreglo, y
lo peor no es que falle: es que **el dueño cree que quedó hecho**.

**Cómo se detecta.** Si mandas un archivo con arreglos y mejoras juntos, pide
el resultado del chequeo final, no la palabra "corrido". Acá lo delató que una
política mostraba su condición original: si algo hubiera pasado, habría
cambiado.

---

## 2 · El repositorio no es la base de datos

**Lo que pasó.** Construí una pantalla completa de convenios —panel, formulario,
listado, funciones— contra una tabla que **no existía en producción**. Me
enteré al abrirla.

**Por qué pasa acá.** 245 archivos `.sql` sueltos, sin carpeta de migraciones y
sin registro de cuáles se corrieron. Nadie puede responder "¿esto está
aplicado?" sin preguntárselo a la base.

**La lección.** Antes de escribir código contra una tabla, **comprobar que la
tabla existe**. Y cuando el código tiene respaldos del tipo "si falta la
columna, reintenta sin ella", el silencio es peor que el error: la función
corre a media máquina y nadie se entera.

**El parche.** `frate-REVISION-TODOS.sql` le pregunta a la base cuáles de los
125 archivos verificables están aplicados. Es un parche, no una solución. La
solución es una carpeta de migraciones ordenada.

**Ojo con generalizarlo.** El ERP tiene 194 archivos con nombres parecidos y
**sí sabe** lo que está corrido: verificaron 19 tablas una por una. Misma
cantidad de archivos, problema distinto. La cantidad no es el síntoma; la falta
de registro sí.

---

## 3 · Ausencia de error no es prueba de nada

**Lo que pasó, tres veces en un día.**

Consulté una tabla con la llave pública, no dio error, y reporté "la tabla se
lee sin sesión". Falso: devolvía **cero filas**. Así se ve la RLS funcionando
—filtra filas, no tira error— y yo lo leí al revés.

Al revés también: un webhook devolvía 200 a una firma inválida y reporté que
estaba abierto. Falso: **rechazaba correctamente** y devolvía 200 a propósito,
que es lo que se hace con los webhooks para que el emisor no reintente eterno.

Y probé un parser con un RUT que inventé, cuyo dígito verificador no calzaba.
Reporté un bug del código que era un bug de mi prueba.

**La lección.** Una prueba que no distingue entre "funciona", "está bloqueado" y
"no hay datos" **no es una prueba**. Antes de reportar, preguntar: si esto
estuviera roto, ¿mi test se vería distinto? Si la respuesta es no, el test no
sirve.

**El caso más caro.** Sobre datos reales, conté como "entradas que nadie usó"
todos los carritos abandonados —porque los QR se generan al armar el carrito,
antes de pagar— y le dije al dueño que su puerta quizás no estaba escaneando.
Él me corrigió: *"según mi info esos días la info iba bien"*. Tenía razón.

---

## Lo que las tres tienen en común

Las tres son formas de **reportar con más confianza de la que los datos
aguantan**. El costo no es el error: es que el dueño toma una decisión creyendo
algo que no comprobaste.

Cuando no se pueda verificar, decirlo. "No pude comprobar esto" es una
respuesta útil. "Está bien" sin haberlo mirado, no.
