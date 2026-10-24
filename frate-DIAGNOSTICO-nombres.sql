-- ============================================================
-- FRATE · DIAGNÓSTICO de nombres "(CUMPLEAÑER@) COMPRADOR"
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- SOLO LEE. No cambia absolutamente nada. Pégame los dos resultados.
-- ============================================================

-- ╔════════════════════════════════════════════════════════╗
-- ║ BLOQUE 1 · ¿Cuántos hay sucios en cada lugar?          ║
-- ╚════════════════════════════════════════════════════════╝
select 'ÓRDENES · comprador'     as donde,
       count(*) filter (where nombre_cliente ~ '\(')                          as con_parentesis,
       count(*)                                                               as total
from public.pedidos
union all
select 'ÓRDENES · nombre en el TICKET (lo que ve la puerta y el correo)',
       count(*) filter (where personas::text ~ '\('), count(*)
from public.items_pedido
union all
select 'CRM · personas',        count(*) filter (where nombre ~ '\('), count(*) from public.personas
union all
select 'LISTAS · inscritos',    count(*) filter (where nombre ~ '\('), count(*) from public.lista_inscritos
union all
select 'RESERVAS',              count(*) filter (where nombre ~ '\('), count(*) from public.reservas
union all
select 'FORMULARIOS',           count(*) filter (where nombre ~ '\('), count(*) from public.formularios;


-- ╔════════════════════════════════════════════════════════╗
-- ║ BLOQUE 2 · Cómo quedaría cada uno (vista previa)       ║
-- ║ (corre este SELECT aparte)                             ║
-- ╚════════════════════════════════════════════════════════╝
select id,
       nombre_cliente                                                             as actual,
       nullif(btrim(regexp_replace(nombre_cliente,'\s*\([^)]*\)\s*',' ','g')),'')  as quedaria,
       btrim((regexp_match(nombre_cliente,'\(([^)]*)\)'))[1])                      as vino_por_cumple
from public.pedidos
where nombre_cliente ~ '\('
order by id desc
limit 40;


-- ╔════════════════════════════════════════════════════════╗
-- ║ BLOQUE 3 · ¿Qué cumpleaños traen más gente?            ║
-- ║ (el dato de CRM que hoy se pierde)                     ║
-- ╚════════════════════════════════════════════════════════╝
select btrim((regexp_match(nombre_cliente,'\(([^)]*)\)'))[1]) as cumpleaniero,
       count(*)                                               as personas_que_trajo
from public.pedidos
where nombre_cliente ~ '\('
group by 1
order by 2 desc
limit 25;
