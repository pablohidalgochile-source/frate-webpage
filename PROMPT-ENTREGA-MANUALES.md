# Prompt · Entrega de manuales a FRATE OS

Copia todo lo que está bajo la línea y pégalo en la sesión de **ERP**, **POS** o **FLYER**.
Reemplaza `{{SISTEMA}}` por `ERP` · `POS` · `FLYER`, y `{{CLAVE}}` por `erp` · `pos` · `fly`.

---

# Cómo se publica en FRATE OS · contrato de entrega

**FRATE OS** es el libro del sistema: `frate.cl/os-libro`. Cuatro series (Web · ERP · POS · Flyer), un solo login, una sola identidad visual. Lo lee todo el equipo de administración.

**A partir de ahora la publicación la maneja un solo proyecto: la WEB.** Es quien despliega a `frate.cl` y quien responde si algo sale roto. Tú escribes el contenido de `{{SISTEMA}}` — que es lo que nadie más puede hacer, porque solo tú conoces tu código.

## Por qué existe esta regla

El 28 de julio de 2026 el libro estuvo a punto de publicarse con **seis capítulos que daban 404**. Dos sistemas habían dejado cableado el enganche —la ruta, el índice, la barra de navegación— de capítulos cuyo HTML no existía en ninguna parte del disco. Se detectó al revisar antes de publicar; si no, el equipo entero se habría encontrado con links muertos en plena reunión.

De ahí sale la regla que ordena todo lo demás:

> **Un capítulo se engancha en la misma tanda en que se entrega su archivo. Nunca antes.**

Media hora de plumbing sin contenido convierte el índice en un campo minado, y quien publica no tiene cómo adivinar qué falta.

---

## PASO 1 — Mándame primero tu inventario (antes de escribir nada)

No escribas ni muevas archivos todavía. Respóndeme esta tabla:

| Capítulo | Ruta que propones | ¿Existe el HTML hoy? | ¿Dónde está? | Estado |
|---|---|---|---|---|
| ej. 03 · La caja | `/os-erp-caja` | sí | `FRATE WEBPAGE/os-erp-caja.html` | publicado |
| ej. 07 · Arqueo | `/os-erp-arqueo` | **no** | — | escrito a medias |

Y además:

1. **Qué tienes escrito y NO está publicado** — archivos, dónde viven, y por qué no se subieron.
2. **Qué tienes enganchado y NO existe** — si alguna vez agregaste una entrada en `os-guard.js`, `vercel.json` o `os-libro.html` apuntando a un archivo que no escribiste, **dímelo ahora**. No es un reto: es lo que necesito para no publicar un 404.
3. **Qué documentación tienes que NO es del libro** — READMEs, handoffs, guías internas. Dime cuáles y yo te digo si van al libro, quedan internas, o hay que reescribirlas.
4. **Qué está desactualizado** — si sabes que un capítulo publicado dice algo que ya no es cierto, márcalo. Es más barato corregirlo que descubrirlo el equipo.

Con eso te respondo qué falta, qué se publica y en qué orden.

---

## PASO 2 — Cómo se escribe un capítulo

Copia esta estructura **exacta**. Está verificada contra el código vivo, no la cambies de memoria.

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FRATE OS · {{SISTEMA}} 03 El dinero</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💵</text></svg>">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/os-manual.css">
<link rel="stylesheet" href="/os-{{CLAVE}}.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
<div id="bar"></div>
<div class="wrap">

  <div class="hero">
    <div class="eyebrow">Manual 03 · {{SISTEMA}}</div>
    <h1>El<br><em>dinero</em></h1>
    <p class="sub">Una frase de qué explica este capítulo y por qué importa.</p>
    <div class="meta"><span>Para quién es</span><span>·</span><span>6 min</span></div>
  </div>

  <section>
    <div class="stag">Etiqueta de la sección</div>
    <h2>La idea central del capítulo</h2>
    <p class="lead">La bajada, en una o dos frases.</p>
    <p>El cuerpo. Frases cortas.</p>
    <div class="oro"><b>Regla de oro.</b> Lo importante.</div>
    <div class="peligro"><b>Nunca.</b> Lo que no se hace jamás.</div>
    <div class="bien"><b>Esto está resuelto.</b> Y por qué.</div>
  </section>

  <div class="pie">FRATE OS · Manual 03 · <a href="/os-{{CLAVE}}-anterior">← Anterior</a> · <a href="/os-{{CLAVE}}-siguiente">Siguiente →</a></div>
</div>

<script src="/os-guard.js"></script>
<script>document.getElementById('bar').innerHTML = osBarra('03','{{CLAVE}}'); osProteger();</script>
</body>
</html>
```

**Las cuatro líneas que no se negocian** (son las que enganchan tu página al libro):

| | |
|---|---|
| `<div id="bar"></div>` | Va justo después de `<body>`. Ahí se pinta la barra. |
| `/os-manual.css` + `/os-{{CLAVE}}.css` | Rutas **absolutas**. No copies el CSS ni lo pegues inline. |
| `<script src="/os-guard.js"></script>` | Antes de tu script, después de supabase-js. |
| `osBarra('NN','{{CLAVE}}'); osProteger();` | `NN` es el número de tu capítulo, con cero adelante. `osProteger()` es el login — **sin eso tu manual queda público**. |

### Clases del molde — usa estas, no inventes CSS

```
Portada    .hero .eyebrow h1<em> .sub .meta
Sección    section .stag h2 h3 .lead
Avisos     .oro (regla)  .peligro (nunca)  .bien (bien resuelto)  .no (ojo)  .ok  .nota
Datos      .tabla  .kpis>.kpi(.v .o .r .a)  .num
Flujos     .flujo>.paso  .receta>.rcab>.cod .quien + .rbody>.cuando .paso
Pantallas  .pant>.barra + .fila>.sem       Demos: .demo>.dl + .btn(.g)
Sistemas   .cerebros>.cer(.web .erp .pos .fly)
Cierre     .pie
```

Colores: **no pongas hexadecimales sueltos.** Usa las variables — `var(--txt)` `var(--gris)` `var(--gris2)` `var(--oro)` `var(--verde)` `var(--rojo)` `var(--azul)` `var(--bor)` `var(--neg2)` `var(--neg3)`. El acento de tu serie ya lo pone `/os-{{CLAVE}}.css`: `var(--acc)`.

Si necesitas algo que el molde no tiene, mételo en un `<style>` dentro de tu página. **No edites `os-manual.css`** — es de las cuatro series a la vez.

### Dónde dejas el archivo

| Serie | Dónde | Ejemplo |
|---|---|---|
| ERP · Flyer | Raíz de `FRATE WEBPAGE/` | `os-erp-caja.html` → `/os-erp-caja` |
| POS | Carpeta `FRATE WEBPAGE/os-pos/` | `os-pos/03-dinero.html` → `/os-pos-dinero` |

Ruta completa: `/Users/n3/Desktop/FRATE 2026/FRATE ERP APP/FRATE WEBPAGE/`

---

## PASO 3 — Qué NO tocas

Estos cuatro son míos. Si los editas, chocamos y alguien pierde trabajo:

```
os-guard.js      el conmutador, las series y el login
vercel.json      las rutas limpias
os-libro.html    el índice
os-manual.css    el molde compartido
```

**Tú me dices** *"agrega el capítulo 07, se llama X, el archivo está en Y"* y yo lo engancho, lo verifico y lo publico. Es una línea de trabajo para mí y me evita descubrir enganches rotos después.

Tu propio `os-{{CLAVE}}.css` sí es tuyo — pero avísame si lo cambias.

---

## PASO 4 — Antes de entregar, revisa esto

```
[ ] El archivo HTML EXISTE en la carpeta de la Web.
[ ] Abre con <div id="bar"></div> y cierra con osBarra + osProteger.
[ ] Las dos hojas de estilo con ruta absoluta (/os-manual.css y /os-{{CLAVE}}.css).
[ ] Cada href="/..." que pusiste apunta a un capítulo que YA existe.
    Si el siguiente capítulo todavía no está escrito, NO lo enlaces.
[ ] Etiquetas balanceadas. Compruébalo con un parser, no contando a ojo.
[ ] Si metiste JavaScript (una demo), no lanza errores en consola.
[ ] Cero datos personales de clientes: nada de RUT, correo ni teléfono reales.
    Cifras agregadas sí; nombres individuales, inventados.
[ ] Todo lo que afirmas lo verificaste contra el código real. Si no lo pudiste
    confirmar, lo dices en el texto en vez de suponer.
```

---

## Cómo se escribe

- **Español de Chile, tuteo estándar.** Nunca argentinismos ni voseo: nada de *"vos / tenés / querés / mirá / fijate / dale"*. Se dice *"tienes / puedes / mira / fíjate"*.
- **Explica la lógica, no los botones.** Si alguien entiende el capítulo, cualquier pantalla se le explica sola. Nada de *"haz clic en el botón azul"*.
- **Organiza por viajes**, no por listas de funciones: *el viaje de un turno*, *el viaje de una venta*, *el viaje de una publicación*.
- **Números reales.** El equipo reconoce su realidad cuando ve sus propias cifras.
- **Di la verdad sobre los límites.** Un capítulo de *"lo que el sistema todavía no hace"* evita que el equipo prometa cosas imposibles.
- Escribe para alguien que **no es programador** y que va a operar esto **un jueves a las 2 de la mañana**.

---

## Dos cosas más

**Los `.md` no se publican.** El sitio excluye `*.md`, así que tus READMEs y handoffs quedan en el repo pero no salen a internet. Aprovéchalos para dejarme notas.

**Si algo tuyo contradice a otro manual, dímelo.** Si el ERP se cree dueño de un dato del que la Web también se cree dueña, eso se resuelve **antes** de que el equipo lo lea, no después.

---

**Empieza por el PASO 1: mándame el inventario.** Con eso te digo qué publicamos primero.
