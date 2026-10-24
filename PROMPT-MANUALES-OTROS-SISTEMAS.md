# Prompt para ERP, POS y FLYER — manuales FRATE OS

Copia todo lo que está bajo la línea y pégalo en la sesión del sistema correspondiente.
**Reemplaza `{{SISTEMA}}`** por: `ERP` · `POS` · `FLYER`.

---

Necesito que construyas el **manual operativo** de este sistema, como parte de una serie llamada **FRATE OS** que explica los cuatro cerebros de Fraternidad Campus Central a todo el equipo de administración.

## Contexto que necesitas saber

Fraternidad corre sobre **cuatro sistemas**, cada uno dueño de una parte de la verdad:

| Sistema | Rol | De qué es dueño |
|---|---|---|
| 🎨 **FLYER** | Nace el evento | Nombre, fecha y gráfica del evento |
| 🌐 **WEB / ticketera** | Vende y registra | Precio, entradas y QR, check-in de puerta, CRM de clientes |
| 💵 **POS** | Cobra adentro | Consumo en barra y caja durante la noche |
| 🧠 **ERP** | Consolida | Personal, finanzas y la ficha maestra de cada persona |

**Tú vas a escribir el manual de `{{SISTEMA}}`.**

El manual de la WEB ya está hecho y es el modelo a seguir. Son 7 documentos publicados en `frate.cl/os` (requieren login del equipo):
`00 El mapa · 01 La entrada · 02 El dinero · 03 La persona · 04 La noche · 05 El panel · 06 Reglas de oro`

## Qué tienes que producir

Una serie de manuales de **`{{SISTEMA}}`**, en **páginas HTML** (una por manual), que:

1. **Se leen como presentación.** Se van a proyectar en una reunión. Tipografía grande, secciones cortas, mucho aire. Nada de párrafos densos.
2. **Explican la LÓGICA, no los botones.** El objetivo es que si alguien entiende el manual, cualquier pantalla se le explique sola. Nada de "haga clic en el botón azul".
3. **Se organizan como VIAJES** (recorridos de principio a fin), no como lista de funciones. Ejemplos: *el viaje de un producto*, *el viaje de un turno*, *el viaje de una publicación*.
4. **Usan datos reales** del sistema (números, nombres de eventos, cifras de una noche concreta). Los números reales hacen que el equipo reconozca su realidad. **Pero NO expongas datos personales de clientes** (RUT, correo, teléfono): en los ejemplos individuales usa nombres realistas inventados. Estos manuales se proyectan en una sala.
5. **Tienen demos que se tocan.** Al menos una por serie: un simulador, una calculadora, un ejemplo interactivo. Que se pueda apretar algo y ver qué pasa.
6. **Dicen la verdad sobre los límites.** Un capítulo "lo que el sistema NO hace (todavía)". Ser honesto evita que el equipo prometa cosas imposibles.

## Estructura obligatoria de cada manual

- **Portada**: número, título grande, una frase de qué explica, para quién es y cuánto se demora en leer.
- **Capítulos numerados**, cada uno con una idea central.
- **Avisos destacados** de tres tipos: 🟡 *regla de oro* (lo importante), 🔴 *peligro* (lo que nunca se hace), 🟢 *bien* (lo que está bien resuelto y por qué).
- **Tablas** para comparar opciones o estados.
- **Pie** con enlaces al manual anterior y al siguiente.

## Manual 00 — el que abre la serie

Tu **manual 00** tiene que incluir sí o sí:

1. **Los cuatro cerebros** con la tabla de arriba, marcando cuál eres tú.
2. **De qué datos eres dueño** — la lista concreta. "Dueño" significa: si hay una diferencia entre sistemas, mandas tú.
3. **Qué datos recibes de otros y qué mandas a otros**, y por qué canal.
4. **La regla de la identidad única**: una persona es una sola ficha en los cuatro sistemas. El RUT y el correo son el hilo que amarra todo.
5. **Qué pasa si otro sistema se cae** — y qué pasa si te caes tú.

## Lenguaje

- **Español de Chile**, tuteo estándar. **Nunca** argentinismos ni voseo (nada de *"vos/tenés/querés/mirá/dale"*). Usa *"tienes / puedes / mira / fíjate"*.
- Frases cortas. Cero jerga técnica sin explicar.
- Escribe para alguien que **no es programador** y que va a operar esto un jueves a las 2 de la mañana.

## Identidad visual (para que los 4 se vean como una sola serie)

```
Fondo         #08080a      Superficie   #0f0f12      Bordes    #232329
Texto         #f2f2f4      Texto suave  #8b8b95
Dorado #E6C860   Verde-aviso #4ade80   Neutros como arriba
Colores de sistema (IDENTIDAD OFICIAL — el acento de cada serie):
  Web  #FF3B3B (rojo)     ERP  #FF2D8B (fucsia)
  POS  #A855F7 (morado)   Flyer #06E5B0 (verde/cyan)
Títulos: Barlow Condensed 800/900, MAYÚSCULAS, muy grandes
Cuerpo:  system-ui / Inter, 1.6 de interlineado
Tarjetas y avisos: bordes redondeados 12-14px, borde izquierdo de color en los avisos
```

Cada paso de un flujo debe indicar **qué sistema manda** con su color: 🔴 Web (rojo) · 🩷 ERP (fucsia) · 🟣 POS (morado) · 🟢 Flyer (verde/cyan).

## Antes de escribir

1. **Revisa el código real** del sistema. No inventes cómo funciona: ábrelo y verifica. Si algo no lo puedes confirmar, dilo en vez de suponer.
2. **Saca números reales** de la base de datos para los ejemplos.
3. **Pregúntame** lo que no puedas deducir del código (procesos que ocurren fuera del sistema, decisiones de negocio).

## Entrégame

1. Las páginas HTML de la serie, publicadas y accesibles solo para el equipo (con login).
2. Un **índice** de qué explica cada una y para quién.
3. Una **lista de contradicciones** que hayas encontrado entre lo que hace tu sistema y lo que dicen los otros manuales. Esto es importante: si el ERP cree que es dueño de un dato del que la WEB también se cree dueña, hay que resolverlo antes de la reunión.

Confírmame primero **qué entendiste y qué manuales propones** para este sistema, con un mockup del estilo. Espera mi OK antes de construir todo.
