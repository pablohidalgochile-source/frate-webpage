-- ============================================================
-- FRATE · Limpiar "(CUMPLEAÑER@) COMPRADOR" en ÓRDENES y TICKETS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Complementa a `frate-limpiar-nombres.sql` (que limpia CRM/listas/
-- reservas/formularios pero NO toca pedidos ni items_pedido).
--
--   "(ANDREA GONZÁLEZ RODRÍGUEZ) BARBARA TINEO DIOSES"
--     → comprador : BARBARA TINEO DIOSES
--     → vino_por  : ANDREA GONZÁLEZ RODRÍGUEZ   (se CONSERVA, no se pierde)
--
-- SEGURO: idempotente (puedes correrlo varias veces), no borra a nadie,
-- y si al quitar el () el nombre quedaría vacío la fila NO se toca.
-- ============================================================


-- ╔════════════════════════════════════════════════════════╗
-- ║ PASO 1 · VISTA PREVIA — corre esto primero y revisa    ║
-- ╚════════════════════════════════════════════════════════╝

-- 1a) Cuántas órdenes y cuántos tickets están sucios
select 'ÓRDENES (comprador)' as donde, count(*) filter (where nombre_cliente ~ '\(') as sucios, count(*) as total from public.pedidos
union all
select 'TICKETS (nombre en el QR)', count(*) filter (where personas::text ~ '\('), count(*) from public.items_pedido;

-- 1b) Cómo quedaría cada orden
select id, nombre_cliente as actual,
       btrim(regexp_replace(regexp_replace(nombre_cliente,'\s*\([^)]*\)\s*',' ','g'),'\s+',' ','g')) as quedaria,
       btrim((regexp_match(nombre_cliente,'\(([^)]*)\)'))[1]) as vino_por
from public.pedidos where nombre_cliente ~ '\(' order by id desc limit 40;

-- 1c) Órdenes que quedarían SIN nombre → NO se tocan, revísalas a mano
select id, nombre_cliente from public.pedidos
where nombre_cliente ~ '\('
  and nullif(btrim(regexp_replace(nombre_cliente,'\s*\([^)]*\)\s*',' ','g')),'') is null;


-- ╔════════════════════════════════════════════════════════╗
-- ║ PASO 2 · APLICAR — corre este bloque completo          ║
-- ║ Va en transacción: o se aplica todo, o nada.           ║
-- ╚════════════════════════════════════════════════════════╝

-- Campo donde guardar al cumpleañer@ (aditivo, no rompe nada)
alter table public.pedidos add column if not exists vino_por text;

begin;

-- 2a) ÓRDENES: guarda el cumpleañer@ y limpia el nombre del comprador
update public.pedidos
set vino_por      = coalesce(nullif(btrim(vino_por),''), btrim((regexp_match(nombre_cliente,'\(([^)]*)\)'))[1])),
    nombre_cliente = btrim(regexp_replace(regexp_replace(nombre_cliente,'\s*\([^)]*\)\s*',' ','g'),'\s+',' ','g'))
where nombre_cliente ~ '\('
  and nullif(btrim(regexp_replace(nombre_cliente,'\s*\([^)]*\)\s*',' ','g')),'') is not null;

-- 2b) TICKETS: limpia el nombre de cada asistente dentro de items_pedido.personas
--     (es lo que ve el portero al escanear y lo que sale en el correo).
--     Conserva el orden del array y guarda vino_por dentro de cada persona.
update public.items_pedido ip
set personas = sub.nuevas
from (
  select ip2.id,
         jsonb_agg(
           case
             when (p->>'nombre') ~ '\('
              and nullif(btrim(regexp_replace(p->>'nombre','\s*\([^)]*\)\s*',' ','g')),'') is not null
             then p || jsonb_build_object(
                    'nombre',   btrim(regexp_replace(regexp_replace(p->>'nombre','\s*\([^)]*\)\s*',' ','g'),'\s+',' ','g')),
                    'vino_por', btrim((regexp_match(p->>'nombre','\(([^)]*)\)'))[1]))
             else p
           end
           order by ord
         ) as nuevas
  from public.items_pedido ip2,
       lateral jsonb_array_elements(ip2.personas) with ordinality t(p, ord)
  where jsonb_typeof(ip2.personas) = 'array'
    and ip2.personas::text ~ '\('
  group by ip2.id
) sub
where ip.id = sub.id;

commit;


-- ╔════════════════════════════════════════════════════════╗
-- ║ PASO 3 · VERIFICAR (debe quedar todo en 0)             ║
-- ╚════════════════════════════════════════════════════════╝
select 'ÓRDENES sucias que quedan' as chequeo, count(*) as n from public.pedidos where nombre_cliente ~ '\('
union all
select 'TICKETS sucios que quedan', count(*) from public.items_pedido where personas::text ~ '\('
union all
select 'ÓRDENES con vino_por guardado', count(*) from public.pedidos where coalesce(btrim(vino_por),'') <> '';

-- BONUS · Qué cumpleaños trajo más gente (dato nuevo de CRM)
select vino_por as cumpleaniero, count(*) as personas_que_trajo
from public.pedidos where coalesce(btrim(vino_por),'') <> ''
group by 1 order by 2 desc limit 25;
