-- ⚠️ ESTE ARCHIVO YA SE CORRIÓ Y NO HACÍA FALTA. Queda como registro.
--
-- Lo escribí creyendo que `puerta_rechazos` no existía. Existe hace tiempo:
-- es el registro de rechazos que la PUERTA ya lleva —ebriedad, carnet, fecha,
-- vetado, se_fue— y tenía 29 casos reales cuando Pablo corrió esto.
-- Lo creó `frate-puerta-deshacer.sql`.
--
-- Su forma verdadera es:
--   id · qr_id · evento_id · nombre · motivo · nota · portero_id · created_at
-- No tiene `caja` ni `edad`, que era lo que mi función le estaba mandando.
-- `api-puerta` ya quedó corregida: escribe el motivo y pone la edad en `nota`,
-- dejando `nombre` y `qr_id` vacíos a propósito.
--
-- QUÉ HIZO DE VERDAD AL CORRERLO:
--   · create table if not exists  → nada, ya existía
--   · enable row level security   → nada, ya estaba activa
--   · una política de lectura más para admin (ahora hay 2, se suman, no chocan)
--   · un índice duplicado: ix_puerta_rechazos_evento repite idx_prech_evento
--   · revoke de anon → inofensivo: la puerta escribe por funciones
--     `security definer`, que no dependen de los permisos de anon
--
-- Nada se rompió. Lo único que sobra es el índice repetido.


-- ── Limpieza opcional · sacar el índice que quedó duplicado ───────
drop index if exists public.ix_puerta_rechazos_evento;


-- ── Chequeo · cómo quedó de verdad ────────────────────────────────
select 'puerta_rechazos'                                       as tabla,
       (select count(*) from public.puerta_rechazos)            as filas,
       (select count(*) from pg_policies
         where schemaname='public' and tablename='puerta_rechazos') as politicas,
       (select count(*) from pg_indexes
         where schemaname='public' and tablename='puerta_rechazos') as indices;
