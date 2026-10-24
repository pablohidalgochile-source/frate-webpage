-- ============================================================
-- FRATE · Limpiar nombres con ( ) — CRM + listas + reservas + formularios
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- Formato real: "(MARÍA GONZÁLEZ) JUANITA PÉREZ"  (el () puede ir al inicio o al final)
--   → nombre queda:  JUANITA PÉREZ
--   → se guarda:     datos_extra.vino_por = "MARÍA GONZÁLEZ"   (por quién / qué cumpleaños vino)
--
-- SEGURO y RE-EJECUTABLE (idempotente): puedes correrlo las veces que quieras.
-- NO borra a nadie. Si al quitar el () el nombre quedaría vacío, la fila NO se toca.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 · VISTA PREVIA  (corre esto SOLO y revisa antes de aplicar)
-- ─────────────────────────────────────────────────────────────
-- Cuántos registros sucios hay en cada tabla
select 'personas'        as tabla, count(*) as con_parentesis from public.personas        where nombre ~ '\('
union all select 'lista_inscritos', count(*) from public.lista_inscritos where nombre ~ '\('
union all select 'reservas',        count(*) from public.reservas        where nombre ~ '\('
union all select 'formularios',     count(*) from public.formularios     where nombre ~ '\(';

-- Ejemplos: actual → cómo quedaría → qué se guarda en vino_por
select id,
       nombre                                                                   as actual,
       nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '')    as nombre_limpio,
       btrim((regexp_match(nombre, '\(([^)]*)\)'))[1])                           as vino_por
from public.personas
where nombre ~ '\('
order by id
limit 60;

-- Fichas que quedarían VACÍAS al quitar el () — estas NO se tocan (revísalas a mano)
select id, nombre
from public.personas
where nombre ~ '\('
  and nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '') is null;


-- ─────────────────────────────────────────────────────────────
-- PASO 2 · APLICAR  (corre este bloque completo cuando la vista previa se vea bien)
-- Va en una transacción: o se aplica todo, o nada.
-- ─────────────────────────────────────────────────────────────
begin;

-- 2a) CRM (personas): guarda la asociación y limpia el nombre
update public.personas
set datos_extra = coalesce(datos_extra, '{}'::jsonb)
                  || jsonb_build_object(
                       'vino_por',            btrim((regexp_match(nombre, '\(([^)]*)\)'))[1]),
                       'contexto_asociacion', 'lista/cumpleaños'
                     ),
    nombre = btrim(regexp_replace(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g'), '\s+', ' ', 'g'))
where nombre ~ '\('
  and nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '') is not null;

-- 2b) Listas de origen (lista_inscritos): la relación ya queda por lista_id → solo limpia el texto
update public.lista_inscritos
set nombre = btrim(regexp_replace(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g'), '\s+', ' ', 'g'))
where nombre ~ '\('
  and nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '') is not null;

-- 2c) Reservas / cumpleaños: limpia el nombre del titular
update public.reservas
set nombre = btrim(regexp_replace(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g'), '\s+', ' ', 'g'))
where nombre ~ '\('
  and nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '') is not null;

-- 2d) Formularios (Centro de Cumpleaños & Reservas): guarda vino_por (en la col jsonb 'datos') y limpia el nombre
update public.formularios
set datos = coalesce(datos, '{}'::jsonb)
            || jsonb_build_object(
                 'vino_por',            btrim((regexp_match(nombre, '\(([^)]*)\)'))[1]),
                 'contexto_asociacion', 'lista/cumpleaños'
               ),
    nombre = btrim(regexp_replace(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g'), '\s+', ' ', 'g'))
where nombre ~ '\('
  and nullif(btrim(regexp_replace(nombre, '\s*\([^)]*\)\s*', ' ', 'g')), '') is not null;

commit;


-- ─────────────────────────────────────────────────────────────
-- PASO 3 · VERIFICAR  (debería devolver 0 en todas, salvo las que quedaban vacías)
-- ─────────────────────────────────────────────────────────────
select 'personas'        as tabla, count(*) as quedan_sucios from public.personas        where nombre ~ '\('
union all select 'lista_inscritos', count(*) from public.lista_inscritos where nombre ~ '\('
union all select 'reservas',        count(*) from public.reservas        where nombre ~ '\('
union all select 'formularios',     count(*) from public.formularios     where nombre ~ '\(';

-- Revisar las asociaciones guardadas (por quién vino cada persona):
select id, nombre, datos_extra->>'vino_por' as vino_por
from public.personas
where datos_extra ? 'vino_por'
order by id
limit 40;
