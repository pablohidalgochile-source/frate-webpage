# Pulso + Pulseras — Handoff para la web frate.cl

**Para:** la IA / dev del proyecto web (FRATE WEBPAGE · frate.cl).
**Objetivo:** que la web sea **hermana en tiempo real** del ERP para el conteo de la noche — **aforo** (gente adentro) + **pulseras** por color. Uno cuenta, el otro lo ve al instante. Con **el diseño propio de la web** (NO copiar el JSX/estilos del ERP).

> El ERP (React 18 + Supabase) ya tiene esto funcionando y probado (FASE 110). Acá va el paquete para reconstruirlo 1:1: la lógica (código real), el esquema (SQL) y la arquitectura. Léelo junto a **`SPEC-ARQUITECTURA.md`** (el "por qué quedan sincronizadas solas" está ahí, sección 1).

---

## 0. La clave (léela primero)

**No hay que inventar ningún puente.** La web y el ERP quedan sincronizadas **porque apuntan al mismo Supabase** y comparten:
1. la tabla `aforo_live`,
2. el RPC atómico `incrementar_aforo`,
3. el canal realtime sobre `aforo_live`.

La web marca una pulsera → `incrementar_aforo` → la base actualiza la fila → el ERP lo ve al instante por realtime, y viceversa. **Son hermanas porque mueven la misma fila por el mismo RPC.** Nada de merge, nada de conflictos.

---

## 1. Cómo usar este paquete

```
docs/pulso-pulseras-web/
├── HANDOFF.md              ← este archivo (guía de porting)
├── SPEC-ARQUITECTURA.md    ← la arquitectura completa (LEER PRIMERO)
├── sql/                    ← el esquema (tabla + RPC atómico + realtime)
│   ├── SQL_FASE_110_AFORO.sql
│   └── SQL_FASE_110B_PULSERAS_SYNC.sql
└── code/
    └── aforoService.js     ← LA lógica (portar 1:1, sin diseño)
```

**Orden:** (1) lee `SPEC-ARQUITECTURA.md` · (2) corre el `sql/` en tu Supabase (el mismo del ERP si quieres que sean hermanas de verdad) · (3) porta `code/aforoService.js` · (4) ponle tu UI de puerta.

> ⚠️ **Para que sean hermanas reales, la web debe usar el MISMO proyecto Supabase que el ERP.** Si usas otra base, el conteo será independiente (no se ven entre sí). El SQL ya está corrido en la base del ERP — solo conéctate a esa.

---

## 2. Los flujos (todo pasa por un RPC)

| Acción | Función del servicio |
|---|---|
| Entra una persona (le das pulsera) | `darPulsera(evento, color, +1)` → pulsera −stock **y** aforo +1, atómico |
| Deshacer / sale | `darPulsera(evento, color, -1)` |
| Solo aforo | `incAforo(evento, ±1)` |
| Solo una pulsera | `incPulsera(evento, color, ±1)` |
| Capacidad máxima | `setCapacidad(evento, n)` |
| Estado inicial | `loadAforo(evento)` |
| **En vivo** | `subscribeAforo(evento, fila => setState(fila))` |
| Evento abierto de la noche | `findEventoActivo()` |

## 3. Contratos de datos (shapes)

- **`aforo_live`**: `{ evento_id, aforo, pulseras: {"Roja":12,...}, capacidad, updated_at }` — el conteo en vivo (entregadas por color + aforo).
- **Definición de pulseras** (la manda el ERP en `eventos_operativos.conteos_data.pulseras`): `{ color, tipo, inicial, extra }` → `total = inicial + extra`, `quedan = total − aforo_live.pulseras[color]`.
- **Colores/tipos** globales: `app_config.colores_pulsera` / `tipos_pulsera` (jsonb).

Detalle completo + tabla de flujos en `SPEC-ARQUITECTURA.md §3–§5`.

## 4. Qué EXCLUIR (tu diseño)

- **No copies** el `PulsoEvento.js` del ERP (FAB flotante + panel) ni sus estilos. La web hace su propia pantalla de puerta (para el guardia/staff de ingreso).
- **Sí replica**: la tabla, el RPC atómico, el realtime, el modelo de pulseras, el cotejo (entregadas vs aforo).

## 5. Notas de porting

- `aforoService.js` importa `./supabase` (tu cliente) y `./fechaChile` (helpers CL: `hoyChile/ayerChile/esMadrugadaChile`). Si no los tienes: `hoyChile()` = `new Date().toLocaleDateString('en-CA')` (YYYY-MM-DD, zona CL), `esMadrugadaChile()` = hora < 5. O quita la regla de madrugada (solo afecta el flag `fueraDeHorario`, informativo).
- `loadColoresDia()` usa `syncService.loadPulserasRemoto()` → reemplázalo por `supabase.from('app_config').select('colores_pulsera').single()`.
- **RLS**: en el ERP `aforo_live` está abierta a `anon`. Para la web pública endurece (dispositivo de puerta autenticado). Ver `SPEC §7`.
- El RPC ya devuelve la fila actualizada — no hace falta releer después de escribir; y el realtime igual te la trae.

---

*Handoff generado desde la implementación real del ERP (FASE 110). Sin diseño — la web pone el suyo. Español de Chile.*
