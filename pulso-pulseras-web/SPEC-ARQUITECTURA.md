# Pulso del evento + Pulseras — Arquitectura (para replicar en la web frate.cl)

**Objetivo:** que la web sea **hermana en tiempo real** del ERP para el conteo de la noche: aforo (gente adentro) + pulseras entregadas por color. Uno cuenta, el otro lo ve al instante. Mismo dato, dos caras.

---

## 0. La idea en una frase

El staff de ingreso marca cada persona que entra (le da una pulsera de un color) → eso **descuenta del stock de ese color y suma al aforo, en un solo paso atómico** → todos los dispositivos (ERP + web) lo ven **al instante** por realtime. Cotejo: pulseras entregadas vs personas contabilizadas (alerta si se entregan de más). Es dato sensible = entradas = plata, por eso los incrementos son **atómicos** (nunca se pierden cuentas aunque cuenten 5 celulares a la vez).

---

## 1. Por qué quedan sincronizadas solas (el corazón del asunto)

**No hay puente entre proyectos. No hay que sincronizar nada a mano.** Ambos proyectos apuntan al **mismo Supabase** y comparten TRES cosas:

1. **Una tabla:** `aforo_live` (una fila por evento: aforo + pulseras por color + capacidad).
2. **Un RPC atómico:** `incrementar_aforo(evento, aforo, pulsera, delta)` — el ÚNICO camino para modificar el conteo. Hace el ajuste dentro de la base (no en el cliente), así dos dispositivos que marcan al mismo tiempo **no se pisan**.
3. **Un canal realtime:** `postgres_changes` sobre `aforo_live` filtrado por `evento_id`. Cada cambio se empuja a todos los suscritos.

Con eso: la web marca una pulsera → llama a `incrementar_aforo` → la base actualiza `aforo_live` → el ERP (y cualquier otro dispositivo) recibe el `payload.new` por el canal y repinta. **Son hermanas porque miran la misma fila y la mueven por el mismo RPC.** Cero lógica de merge, cero conflictos.

---

## 2. El evento de la noche

Solo puede haber **1 evento abierto** a la vez (`eventos_operativos.estado in ('abierto','activo')`). El Pulso trabaja sobre ese. Ver `findEventoActivo()` en el código: trae el único abierto + sus pulseras.

- Regla de madrugada: un evento sigue "vigente" hasta las 05:00 del día siguiente (por eso `fueraDeHorario` solo **avisa**, no lo abandona). Ver `fechaChile.js` (helper `esMadrugadaChile`).

---

## 3. Modelo de datos

### 3.1 `aforo_live` (la fuente de verdad del conteo en vivo)
```
evento_id  UUID PRIMARY KEY   -- el evento de la noche
aforo      INTEGER            -- personas dentro (contador +/-)
pulseras   JSONB              -- { "Roja": 12, "Azul": 5, ... } = ENTREGADAS por color
capacidad  INTEGER            -- capacidad máxima opcional (para el %)
updated_at TIMESTAMPTZ
```
`pulseras` guarda las **entregadas/utilizadas** por color. El **stock inicial** (cuántas hay para dar) NO vive acá — vive en el evento (`conteos_data.pulseras`, ver 3.2). Así: **quedan = total_inicial − utilizadas**.

### 3.2 Definición de pulseras del día (`eventos_operativos.conteos_data.pulseras`)
Array de `{ color, tipo, inicial, extra }`:
- `inicial` = entregadas al anfitrión en la planificación.
- `extra` = entregadas extra durante la noche (solo admin).
- `total = inicial + extra` = disponible a entregar.
- (`utilizadas` NO va acá — va en `aforo_live.pulseras[color]`).

Esta definición la **manda el ERP** (pestaña Entradas/Pulseras del Conteo). La web la **lee** (para saber los colores y el stock) pero normalmente no la edita. Ver `pulserasDeEvento(ev)` en el código.

### 3.3 Colores/tipos globales (`app_config.colores_pulsera` / `tipos_pulsera`)
La paleta de colores y tipos de pulsera vive en `app_config` (jsonb) para que TODOS los dispositivos lean lo mismo. Ver SQL_FASE_110B + `loadColoresDia()`.

---

## 4. Los flujos (todos pasan por `incrementar_aforo`)

| Acción | Llamada | Efecto |
|---|---|---|
| **Entra una persona** (le das pulsera color X) | `darPulsera(evento, 'Roja', +1)` | pulseras.Roja +1 **y** aforo +1, atómico |
| **Deshacer / sale** | `darPulsera(evento, 'Roja', -1)` | pulseras.Roja −1 **y** aforo −1 |
| Ajustar solo aforo (sin pulsera) | `incAforo(evento, ±1)` | aforo ±1 |
| Ajustar solo una pulsera (sin aforo) | `incPulsera(evento, color, ±1)` | pulseras[color] ±1 |
| Fijar capacidad máxima | `setCapacidad(evento, n)` | capacidad = n |
| Cargar estado inicial | `loadAforo(evento)` | trae la fila (la crea con 0 si falta) |
| Escuchar cambios en vivo | `subscribeAforo(evento, cb)` | `cb(fila)` en cada cambio |

**Clave:** `darPulsera` mueve pulsera **+** aforo en el MISMO RPC (un solo update en la base). Nunca quedan desfasados. `GREATEST(0, …)` en el SQL evita negativos.

---

## 5. Lo que se muestra (el Pulso)

Con `aforo_live` + la definición de pulseras se arma el panel:
- **Aforo:** `aforo` / `capacidad` (con % y color si se pasa).
- **Por color:** entregadas (`aforo_live.pulseras[color]`) · quedan (`total − entregadas`) · alerta si `entregadas > total` (se dieron de más).
- **Cotejo:** total pulseras entregadas vs `aforo` (deberían calzar; diferencia = pulseras sin registrar como persona, o viceversa).
- Opcional (solo lectura): resumen de staff/reservas/cumples del evento — ver `loadResumenVivo()`.

El **diseño lo pone la web** (esto es solo la lógica y el dato).

---

## 6. Qué portar y qué no

**Portar 1:1 (lógica):** todo `code/aforoService.js` — es el contrato completo (findEventoActivo, loadAforo, incAforo, incPulsera, **darPulsera**, setCapacidad, **subscribeAforo**, totalPulseras). Corre el `sql/`.

**NO copiar:** el diseño/JSX del Pulso del ERP (`PulsoEvento.js` — FAB flotante + panel). La web pone su propia UI (una pantalla de puerta linda para el guardia). Solo reusa las funciones del servicio.

**Adaptar:** `aforoService.js` importa `./supabase` (tu cliente) y `./fechaChile` (helpers de fecha CL — `hoyChile/ayerChile/esMadrugadaChile`; si no los tienes, son 3 funciones triviales de fecha, o quita la regla de madrugada). `loadColoresDia()` usa `syncService.loadPulserasRemoto()` — reemplázalo por un `select colores_pulsera from app_config` directo.

---

## 7. RLS / seguridad (para producción)

En el ERP la RLS de `aforo_live` está **abierta a anon** (`allow_all`) — la app confía en la UI. Para la web pública **endurece**: idealmente el conteo lo hace un dispositivo autenticado (staff de puerta). Si dejas anon, al menos limita por `evento_id` del evento abierto. El RPC ya es la única vía de escritura (no se puede corromper el contador desde afuera si bloqueas el UPDATE directo a la tabla).
