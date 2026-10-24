-- ============================================================
-- FRATE · Limpiar duplicados YA cargados en Formularios
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Duplicado = mismo TIPO + mismo NOMBRE (ej: "ANTONELLA GARRIDO" 3 veces).
-- Deja 1 por persona (el más AVANZADO en el pipeline; si empatan, el más nuevo)
-- y marca los demás como 'no_realizado' (NO los borra → reversible).
-- Corre PRIMERO el paso 1 (revisar). Corre frate-formularios-etapas.sql antes.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 · REVISAR (solo mira — no cambia nada)
-- ─────────────────────────────────────────────────────────────
select tipo,
       upper(btrim(nombre))                              as nombre,
       count(*)                                          as veces,
       string_agg(distinct coalesce(email,'—'), '  |  ') as correos,
       string_agg(distinct coalesce(telefono,'—'),'  |  ') as telefonos,
       min(created_at)::date                             as primera,
       max(created_at)::date                             as ultima
from public.formularios
group by tipo, upper(btrim(nombre))
having count(*) > 1
order by veces desc, nombre;


-- ─────────────────────────────────────────────────────────────
-- PASO 2 · FUSIONAR (suave) — deja 1 y marca el resto 'no_realizado'
-- Corre este bloque cuando el paso 1 se vea bien.
-- ─────────────────────────────────────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by tipo, upper(btrim(nombre))
           order by
             case estado
               when 'realizado'  then 6 when 'confirmado' then 5 when 'sin_disp' then 4
               when 'contactado' then 3 when 'sin_info'   then 2 when 'nuevo'    then 1 else 0 end desc,
             created_at desc
         ) as rn
  from public.formularios
)
update public.formularios f
set estado    = 'no_realizado',
    historial = coalesce(f.historial,'[]'::jsonb) || jsonb_build_object('ts', now()::text, 'ev', 'duplicado — fusionado')
from ranked r
where f.id = r.id
  and r.rn > 1
  and f.estado <> 'realizado';   -- nunca tocar los ya realizados


-- ─────────────────────────────────────────────────────────────
-- PASO 3 · VERIFICAR (grupos con 2+ ABIERTOS deberían quedar en 0)
-- ─────────────────────────────────────────────────────────────
select tipo, upper(btrim(nombre)) as nombre, count(*) as abiertos
from public.formularios
where estado not in ('realizado','no_realizado')
group by tipo, upper(btrim(nombre))
having count(*) > 1
order by abiertos desc;


-- ─────────────────────────────────────────────────────────────
-- OPCIONAL · Si prefieres BORRAR los duplicados en vez de marcarlos
-- (DESTRUCTIVO, no se puede deshacer). Descomenta y corre.
-- ─────────────────────────────────────────────────────────────
-- with ranked as (
--   select id, row_number() over (
--     partition by tipo, upper(btrim(nombre))
--     order by case estado when 'realizado' then 6 when 'confirmado' then 5 when 'sin_disp' then 4
--                          when 'contactado' then 3 when 'sin_info' then 2 when 'nuevo' then 1 else 0 end desc,
--              created_at desc) as rn
--   from public.formularios
-- )
-- delete from public.formularios f using ranked r
-- where f.id = r.id and r.rn > 1 and f.estado <> 'realizado';
