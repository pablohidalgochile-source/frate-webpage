# HAND-OFF · FLYER → WEB · Que el evento llegue ya armado

**De:** FRATE WEB (ticketera) · **Para:** FRATE FLYER
**Pedido de:** Pablo · **Fecha:** 2026-08-17

---

## El problema hoy

El brief que FLYER manda a la web trae esto:

```
nombre · fecha · hora · termino · color · encuadre
especial · cancion · caption · concurso · premio · youtube · event_uid
```

Todo lo visual y lo del contenido. **Pero ni entradas ni listas.**

Resultado: cada evento importado llega vacío. Pablo tiene que abrirlo,
cargarle los 5 tipos de ticket a mano, y después armar las 3 listas de
cortesía en otra pantalla. Todas las semanas, para cada día.

---

## Lo que proponemos

**Un solo campo nuevo en el brief:**

```json
{
  "tipo_de_dia": "JUEVES"
}
```

Valores: `JUEVES` · `VIERNES` · `SABADO` · `ESPECIAL` (o el que definan
juntos — la web los mapea).

Eso es todo lo que FLYER tiene que agregar.

---

## Por qué SOLO eso, y no los precios

Es la parte importante del acuerdo, así que la dejamos explícita.

FLYER **no** debería mandar los tipos de entrada con sus precios y stock.
Dos razones:

1. **El precio viviría en dos lugares.** Si FLYER manda "$8.000" y la web
   tiene "$9.000" en su catálogo, un día no van a coincidir y nadie va a
   saber cuál manda. Un solo dueño del precio: la web.

2. **Regla del negocio de Pablo:** los precios son referencia y *el monto
   final lo pone un humano*. Ese humano trabaja en la web, no en FLYER.

FLYER dice **qué día es**. La web decide **qué significa eso**.

---

## Qué hace la web al recibirlo

1. Lee `tipo_de_dia` del brief.
2. Busca en SU catálogo qué entradas corresponden a ese día
   (ya existe: es el mismo mecanismo de "Cargar mis tickets — FINDE").
3. Busca en SU biblioteca qué listas de cortesía van ese día
   (ya existe: es la biblioteca de "⚡ Armar el día").
4. Crea el evento **con sus entradas y sus listas ya puestas**, con los
   links de cada lista generados.

Pablo solo revisa precios y publica.

---

## Cómo se ve el flujo

```
   FLYER manda el brief
   nombre · fecha · hora · color · canción
   + tipo_de_dia: "JUEVES"        ← lo único nuevo
              │
              ▼
   La web lo expande con SU biblioteca
   busca qué significa «JUEVES» en su catálogo
   de entradas y en su biblioteca de listas
              │
              ▼
   El evento nace listo
   5 tipos de entrada · 3 listas creadas · links
   Pablo solo revisa precios y publica
```

---

## Compatibilidad

**El campo es opcional.** Si un brief llega sin `tipo_de_dia`, la web se
comporta exactamente como hoy: crea el evento vacío. Nada se rompe
mientras FLYER no lo mande, y nada hay que coordinar para el día del
cambio.

---

## Lo que necesitamos de ustedes

1. Que confirmen si `tipo_de_dia` les calza, o si prefieren otro nombre.
2. Que nos digan qué valores van a mandar, para mapearlos de nuestro lado.
3. Si ya tienen el concepto de "tipo de noche" en FLYER, mejor: úsenlo tal
   cual y nosotros nos adaptamos a su vocabulario.

De nuestro lado lo dejamos listo para recibirlo apenas se pongan de
acuerdo en el nombre.

---

## Un detalle que nos costó a nosotros

Cuando prueben, **verifiquen después del despliegue, no antes**. Nos pasó
tres veces esta semana entre los tres proyectos: uno confirma, el otro
mide en la ventana entre el push y el deploy, y sale el valor viejo.
