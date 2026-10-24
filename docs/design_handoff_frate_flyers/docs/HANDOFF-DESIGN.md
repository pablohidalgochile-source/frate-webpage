# HAND OFF → CLAUDE DESIGN
## Generación de flyers profesionales para FRATE (Fraternidad Campus Central)

> **Para quién es esto:** el agente/sesión de diseño que tomará el reto de generar
> flyers de **calidad profesional** a partir de los datos de un evento.
> **Estado:** el intento de generarlos con un editor de capas en canvas (este repo)
> quedó **amateur**. Se necesita repensar el enfoque de diseño desde cero.

---

## 1. El objetivo en una frase

Generar **flyers de fiesta de calidad profesional** (nivel agencia), **auto-rellenados**
con los datos de cada evento y **editables**, para una discoteca universitaria — al
nivel de los dos flyers de referencia (ver §4), no por debajo.

---

## 2. Contexto del negocio

- **FRATE / Fraternidad Campus Central** — discoteca universitaria en Santiago de Chile.
- Público 18-25 años. Tono: pícaro con clase, chileno auténtico, sin vulgaridad.
- Producen contenido **cada jueves, viernes y sábado** → necesitan flyers rápido y bonitos.
- Concepto creativo central: **"La frase tiene rostro"** — cada fiesta nace de una frase
  emocional (ej. *"Me encanta tu sonrisa"*) que parece dedicada a alguien real, montada
  sobre el rostro de una persona.
- Estética: **dark / neón**, rosa (#ff2d78) + cyan (#00e5ff) + morado (#9b30ff), negro,
  acentos dorados. Estilo "interfaz / HUD / chat / forense" muy cargado de elementos.

---

## 3. Ecosistema actual (3 apps, repos separados)

| App | Carpeta | Deploy / repo | Rol |
|-----|---------|---------------|-----|
| **FLYER LAB** (original) | `~/Desktop/FRATE FLYER LAB` | `frate-flyer-lab.vercel.app` | Versión vieja. No tocar. |
| **FLYER LAB EXPRESS** | `~/Desktop/FRATE-FLYER-LAB-EXPRESS` | `flyer.frate.cl` · repo privado `pablohidalgochile-source/frate-flyer-lab-express` | **VIVO Y EN USO.** Genera la **copy** (caption, concurso, brief) con IA. Login + sync Supabase. **Es la fuente de datos.** |
| **FLYER STUDIO** (este repo, v3) | `~/Desktop/FRATE-FLYER-STUDIO` | repo privado `pablohidalgochile-source/frate-flyer-studio` | Intento de generar el flyer gráfico. **Estado amateur — a repensar.** |

El **Express** ya hace bien la parte de texto/concepto. Lo que falta resolver es el
**flyer gráfico**.

---

## 4. Las referencias de diseño (el estándar a alcanzar)

El usuario tiene **dos flyers profesionales reales** que definen el nivel esperado
(ambos de la campaña *"ME ENCANTA TU SONRISA"*):

- **Flyer A — "REC · Diagnóstico forense":** rostro femenino full-bleed tras un "vidrio
  roto", barra superior estilo cámara (`● REC`, `180FPS`, batería, timecode), columna
  izquierda de tarjetas HUD (`SU MIRADA` + heartbeat, `NIVEL DE IMPACTO 99.7%`,
  `PELIGROSIDAD EXTREMA`, ubicación, hora), columna derecha de **burbujas de chat**
  con timestamps y checks, **título con lettering "chorreado/graffiti"** (`DIAGNÓSTICO:
  ME ENCANTA TU SONRISA`), barra `ANÁLISIS COMPLETO 99%`, footer con fecha, logo FRATE,
  concurso, código de barras, geolocalización, redes.
- **Flyer B — "Scanner · Archivo encontrado":** rostro con crosshair de scanner,
  badge grande de fecha, HUD `ARCHIVO ENCONTRADO` (caso/ubicación/hora/impacto),
  chat bubble + `ESTÁ ESCRIBIENDO…`, título graffiti, **4 polaroids** de la fiesta,
  concurso con premios, logo, código de barras.

> ⚠️ **Estos dos JPG los tiene el usuario** y debe adjuntarlos a la sesión de diseño.
> Son la vara de calidad.

### Assets de marca ya existentes en el equipo (en `~/Desktop`)
- **`FRATE_ME_ENCANTA_TU_SONRISA_PSD_CAPAS.psd`** ← **CLAVE.** El flyer profesional real
  **con sus capas**. Abrirlo muestra exactamente cómo está construido (tipografías,
  efectos, recortes, lettering, texturas). **Punto de partida ideal del diseño.**
- `~/Desktop/FRATE SHOW DESIGN/` — otros recursos de marca/diseño del proyecto.
- `~/Desktop/FRATE 2025/`, `~/Desktop/FRATE 2026/` — material de campañas.

---

## 5. Por qué el enfoque actual quedó amateur (aprendizajes)

El Studio (este repo) dibuja el flyer **programáticamente con primitivas de canvas 2D**
(`<canvas>`: rectángulos, círculos, texto con fuentes Google). Limitaciones de raíz:

- **Sin lettering real:** el título "chorreado/graffiti" de FRATE es arte hecho a mano
  (un PNG/vector), **no una fuente**. Con fuentes web se ve genérico.
- **Sin tratamiento de foto pro:** recortes, máscaras, "vidrio roto", blending del rostro
  con el fondo — el canvas 2D básico no los hace.
- **Sin texturas, grain, glows compuestos, blend modes.**
- **Composición "a ojo" por coordenadas:** no tiene la jerarquía, el balance ni el detalle
  de un diseñador. Las tarjetas/burbujas se ven planas.
- Resultado: estructura correcta, **acabado amateur**.

**Conclusión:** no se debe "dibujar el diseño con código". Hay que **invertir el flujo**:
partir de una pieza diseñada profesionalmente y solo **parametrizar** las zonas dinámicas.

---

## 6. Los datos disponibles para auto-rellenar

El Express guarda cada evento en Supabase (tabla `flyer_express_packages`,
columna `form_data` JSON). Campos relevantes para un flyer (de
`EventsExpress.jsx`):

```
eventName / selectedTitle      título del evento
date / time / openingDay       fecha y horario
captionFinal                   caption completo (largo)
concursoFlyer                  concurso corto para flyer (2 líneas)   ← clave gráfico
prize                          premio del concurso
contestTarget                  a quién se etiqueta
editorialMood[] / customMood   mood editorial
baseConcept                    concepto base
songTitle / songMainArtist /   datos de la canción inspiradora
  songFeatArtists / songYear /
  songCountry / songGenre /
  songMood / songWhy
songArtwork                    carátula (URL imagen)
youtubeUrl                     → thumbnail YouTube
fotosReferencia[]              fotos subidas {src, label, type}        ← rostro/personaje
logosFiles[] / logosExtras     logos de marcas
dayInfo {djs, promos,          operación del día (listas)
  eventos, convenios,
  reservas, extras, otros}
exportBrief {title, markdown,  brief completo de producción
  plainText, html}
infoEspecial                   info especial libre
```

Acceso: misma instancia Supabase del Express (env `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`), mismo login (Supabase Auth). **No** re-implementar la captura
de datos: ya existe y funciona.

---

## 7. El reto de diseño (lo que hay que decidir y producir)

**Tensión central:** calidad profesional ⟷ auto-generación ⟷ editable. Hay que encontrar
el punto correcto. Entregables esperados de la fase de diseño:

1. **Sistema visual / design system de flyer** (tipografías reales incl. el lettering,
   paleta, grilla, componentes: tarjetas HUD, burbujas de chat, badges, barras, footer).
2. **2-3 plantillas maestras** diseñadas a nivel pro (empezando por las 2 referencias),
   con **zonas dinámicas definidas** (slots de texto y de foto).
3. **Decisión del motor de render** (ver §8).
4. **Mapeo** de cada slot ↔ campo de datos del §6.

---

## 8. Opciones de enfoque técnico (a evaluar por Claude Design)

| Enfoque | Calidad | Editable | Esfuerzo | Notas |
|---------|---------|----------|----------|-------|
| **A. Plantillas pro con slots** (Bannerbear / Placid / Templated / Creatomate) | ★★★★ | media (dentro de la plantilla) | bajo-medio | Diseñas la pieza linda una vez; API inyecta texto/foto. Probablemente lo correcto para empezar rápido con calidad. |
| **B. HTML/CSS → imagen** (Satori + resvg, o Puppeteer) | ★★★★ | alta (código) | medio | CSS real: gradientes, máscaras, blend, fuentes premium, sombras. Cada plantilla en JSX/CSS. Mucho mejor que canvas 2D. |
| **C. Editor pro embebido** (Polotno SDK / Canva SDK) | ★★★★ | **alta (tipo Canva/PS real)** | medio | Da el "Photoshop editable" de verdad + plantillas + export. Mejor balance edición+calidad. |
| **D. IA generativa** (fondos/personajes/texturas) + composición | variable | baja | medio | Útil para fondos y el tratamiento del rostro; combinar con A/B/C. |
| **E. Canvas 2D a mano** (enfoque actual) | ★★ | alta | alto | **Descartado** — produce resultado amateur. |

> Recomendación de partida (no vinculante): **el lettering del título y el tratamiento del
> rostro vienen del PSD/assets**; el resto se parametriza con **B (Satori/HTML→imagen)** o
> **C (Polotno)**. Definirlo es parte del trabajo de diseño.

---

## 9. Restricciones y reglas de marca

- **Idioma:** español de Chile (tú/tienes/quieres/aquí — NUNCA vos/tenés/acá).
- **Marca:** dark/neón; rosa `#ff2d78`, cyan `#00e5ff`, morado `#9b30ff`, dorado, negro.
- **Formato:** vertical para IG (story 9:16 y/o afiche 2:3 / post 4:5). 1080px de ancho mínimo.
- **Tono copy:** picardía elegante, sin vulgaridad.
- **Seguridad:** repos privados; claves API solo en env vars (nunca en código).
- **No tocar** el Express (vivo) ni el Lab original. El trabajo nuevo va aparte.

---

## 10. Estado del código (qué reusar / qué descartar de este repo)

- **Descartar como enfoque de diseño:** `src/lib/templates/scanner.js` y la composición
  por capas de canvas (`composePortada.js`). Sirvieron de prueba; el acabado es amateur.
- **Posiblemente reutilizable:** el scaffolding React+Vite, y la idea de **slots ↔ datos**.
- **El `CanvasEditor.jsx`** (editor de capas) sólo sirve si se opta por edición canvas;
  si se va por Polotno/Satori, se reemplaza.
- **Pipeline de datos:** reutilizar el del Express (Supabase). No reinventar.

---

## 11. Preguntas abiertas para Claude Design

1. ¿Motor de render? (Plantillas-API vs Satori/HTML vs Polotno vs híbrido — §8).
2. ¿El lettering del título se trata como **asset PNG/SVG por campaña** (lo más realista)
   o se busca una fuente/efecto que se le acerque?
3. ¿Cuánta edición necesita el usuario final tras auto-generar — retoques menores o
   reposicionar todo? (define cuánto pesa "editable").
4. ¿El tratamiento del rostro (recorte, vidrio roto, scanner) se hace por evento a mano,
   se automatiza con IA, o se deja como overlay sobre la foto cruda?
5. ¿Cuántas plantillas maestras para el MVP de diseño? (sugerido: las 2 de referencia.)

---

### Resumen de una línea
El Express genera la **copy** perfecta y guarda todos los **datos** en Supabase. Falta el
**flyer gráfico a nivel profesional**: hay que diseñarlo partiendo del **PSD real** y elegir
un **motor de render** que mantenga la calidad (no canvas 2D), parametrizando las zonas
dinámicas con los datos del evento.
