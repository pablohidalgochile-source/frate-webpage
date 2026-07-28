# FRATE OS · Manual de FLYER — índice y contradicciones

Serie de 7 manuales del sistema **FLYER** (donde nace el evento), en el mismo formato
que la serie de la Web y del ERP. Se leen en `frate.cl/os-flyer` con login de staff
(roles admin / rrpp / portero). Acento **verde/cyan #06E5B0** 🟢 para reconocer el sistema de un vistazo.

---

## 1. Índice — qué explica cada uno y para quién

| # | Ruta | Título | Qué explica | Para quién | Demo que se toca |
|---|---|---|---|---|---|
| 00 | `/os-flyer` | **El mapa** | Los 4 cerebros, de qué es dueño FLYER, qué manda y recibe, los dos hilos (event_uid y RUT+correo), qué pasa si algo se cae. | Todo el equipo | Nacimiento del `event_uid` (fecha → uid, sufijo por hora) |
| 01 | `/os-flyer-evento` | **Un evento** | De una fecha + canción a una campaña completa con IA (título, caption, concurso). Lo mínimo que pones tú vs lo que arma la IA. Qué NO inventa. | Quien crea eventos | Regenerar / editar un título |
| 02 | `/os-flyer-diseno` | **Un flyer** | Studio: las 6 plantillas, el editor de capas (mover, texto, vacío=oculto, fotos), exportar PNG. | Quien arma la gráfica | — (tabla de capas) |
| 03 | `/os-flyer-reel` | **Un reel** | El mini-estudio de video: capas, efectos dosificables, la canción como fondo, render en la nube en un clic. | Quien arma el video | Simular el render (barra de progreso) |
| 04 | `/os-flyer-brief` | **El brief** | Las dos caras del archivo (7 secciones legibles + JSON escondido), el uid candidato, las entradas con precio/cupo, reexportar seguro. | Entender la conexión | Ver el JSON crudo de un evento real |
| 05 | `/os-flyer-mesa` | **La mesa** | El flujo guiado Evento→Studio→Reel→Exportar, guiado pero no encerrado, el paquete de descarga (flyer + reel + brief + caption / ZIP). | El día a día | Recorrer los 4 pasos |
| 06 | `/os-flyer-reglas` | **Reglas de oro** | Todo en una hoja: lo que FLYER es, lo que nunca hace, lo que está bien resuelto, y **lo que NO hace todavía** (capítulo honesto de límites). | Para tener a mano | — |

**Orden sugerido de lectura:** 00 primero (el mapa), luego 01→05 en fila, y 06 como resumen para imprimir.

---

## 2. Lista de contradicciones (resolver antes / durante la reunión)

Puntos donde más de un sistema se cree dueño del mismo dato. Los dos primeros ya los
cerró el dueño de FRATE; hay que dejarlos escritos **igual** en los manuales de los dos
lados para que no reaparezcan.

### 🔴🟢 CERRADA — ¿Quién es dueño del `event_uid`?
- **Antes:** el contrato Brief v1 decía "FLYER es el único que crea el uid".
- **Ahora (v3):** **FLYER es dueño del candidato; el ERP del confirmado.** Cualquier app
  puede editar el uid en su propia copia mientras trabaja; después se conectan los eventos
  internamente por ese mismo hilo.
- **Acción:** el manual del ERP y el de FLYER (00 y 04) ya lo dicen así. Revisar que el manual
  de la **Web** no siga diciendo que FLYER "crea" el uid a secas.

### 🔴🟢 CERRADA — ¿Quién es dueño del precio de las entradas?
- **Tensión:** la tabla de cerebros le da a la **Web** "Precio, entradas y QR"; pero FLYER
  ahora **define** los tipos con precio y cupo en el brief.
- **Resuelto:** **FLYER siembra el precio y el cupo inicial; la Web es la verdad en vivo**
  (lo vendido, el disponible). Un reimport nunca le devuelve el cupo a una entrada ya vendida.
- **Acción:** dejarlo escrito igual en el manual de la Web (02 El dinero) y en el de FLYER (04 El brief).

### 🟡 ABIERTA (menor) — La "gráfica" del evento
- FLYER es dueño de la gráfica (flyer + reel). Pero la imagen del flyer viaja a la Web como
  `imagen_url` y ahí se muestra. No es conflicto de propiedad: la Web **muestra**, no **posee**.
- **Acción:** que el manual de la Web diga "la imagen viene del brief" y no "la Web arma la gráfica".

### 🟡 PENDIENTE de otro equipo — El uid confirmado de vuelta
- Para cerrar del todo la regla del uid, el ERP debe **devolverle a FLYER el uid confirmado**
  (endpoint árbitro). Hoy FLYER manda el candidato y ya está cableado para recibir el confirmado;
  falta ese enganche del lado del ERP. Está en el handoff FLYER→ERP.

---

## 3. Estado de entrega

- ✅ 7 manuales HTML (`os-flyer*.html`) — mismo formato que Web/ERP, acento **verde/cyan #06E5B0**, con login.
- ✅ Plumbing: `os-flyer.css` (acento) · `os-guard.js` (serie FLYER cableada) · `vercel.json` (7 rewrites).
- ✅ **Publicado en producción** (frate.cl/os-flyer … os-flyer-reglas). Aditivo: no tocó páginas existentes; los `.sql`/`.md` siguen protegidos por `.vercelignore`.
