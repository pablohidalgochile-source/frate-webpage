-- ============================================================
-- FRATE · DATOS REALES para el manual (BESUCONA + comparativo + cliente)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- SOLO LEE. Corre los 4 bloques y pégame CADA resultado.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 1 · Resumen de los dos eventos, lado a lado        ║
-- ╚══════════════════════════════════════════════════════════╝
with ev as (
  select id, nombre, fecha, hora, hora_termino, aforo
  from public.eventos
  where nombre ilike '%BESUCONA%' or nombre ilike '%A MI ME GUSTA%'
),
u as (   -- una fila por ENTRADA emitida (pedido pagado)
  select e.id ev_id, e.nombre ev_nombre, e.fecha,
         ip.id item_id,
         coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as etiqueta,
         coalesce(ip.precio_unitario,0) as precio,
         p.metodo_pago,
         q.qr
  from ev e
  join public.items_pedido ip on ip.evento_id = e.id
  join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
),
c as (   -- categoría por DATO: preventa (pagó) / puerta (VIP directo) / cortesía
  select u.*,
         case when u.precio > 0 and coalesce(u.metodo_pago,'') <> 'cortesia' then 'preventa'
              when u.qr ilike '%PUERTA%' or u.etiqueta ilike 'ingreso%'      then 'puerta'
              else 'cortesia' end as categoria,
         exists(select 1 from public.qr_usados x where x.qr_id = u.qr) as entro
  from u
)
select ev_nombre as evento, fecha, categoria,
       count(*)                                   as emitidas,
       count(*) filter (where entro)              as llegaron,
       round(100.0*count(*) filter (where entro)/nullif(count(*),0)) as pct,
       sum(precio)                                as recaudado
from c
group by 1,2,3
order by fecha, categoria;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 2 · Rendimiento por lista / tipo, en ambos eventos ║
-- ╚══════════════════════════════════════════════════════════╝
with ev as (
  select id, nombre, fecha from public.eventos
  where nombre ilike '%BESUCONA%' or nombre ilike '%A MI ME GUSTA%'
),
u as (
  select e.nombre ev_nombre, e.fecha,
         coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as etiqueta,
         coalesce(ip.precio_unitario,0) as precio, q.qr
  from ev e
  join public.items_pedido ip on ip.evento_id = e.id
  join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
)
select ev_nombre as evento, fecha, etiqueta,
       count(*) as emitidas,
       count(*) filter (where exists(select 1 from public.qr_usados x where x.qr_id = u.qr)) as llegaron,
       round(100.0*count(*) filter (where exists(select 1 from public.qr_usados x where x.qr_id = u.qr))/nullif(count(*),0)) as pct,
       max(precio) as precio
from u
group by 1,2,3
order by fecha, emitidas desc;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 3 · Curva de llegada (a qué hora entró la gente)   ║
-- ╚══════════════════════════════════════════════════════════╝
with ev as (
  select id, nombre, fecha from public.eventos
  where nombre ilike '%BESUCONA%' or nombre ilike '%A MI ME GUSTA%'
)
select e.nombre as evento,
       to_char(qu.created_at at time zone 'America/Santiago','HH24') || ':00' as hora,
       count(*) as entraron
from ev e
join public.items_pedido ip on ip.evento_id = e.id
join public.qr_usados qu on ip.qr_ids ? qu.qr_id
group by 1,2
order by 1,2;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 4 · EL CLIENTE — los 10 con más visitas            ║
-- ║ Elige uno de esta lista y corre el BLOQUE 5 con su RUT.   ║
-- ║ (el RUT sale enmascarado; el nombre queda para que lo     ║
-- ║  reconozcas — yo lo cambio al escribir el manual)         ║
-- ╚══════════════════════════════════════════════════════════╝
select p.nombre,
       left(coalesce(p.rut,''),4) || '···' || right(coalesce(p.rut,'-'),2) as rut_masc,
       p.rut as rut_completo_para_el_bloque_5,
       p.visitas,
       p.primera_vez::date, p.ultima_vez::date,
       coalesce(p.universidad,'—') as universidad,
       array_to_string(p.origen,' · ') as origenes,
       coalesce(p.datos_extra->>'vino_por','—') as vino_por
from public.personas p
where coalesce(p.visitas,0) >= 2
order by p.visitas desc, p.ultima_vez desc
limit 10;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 5 · EL RASTRO COMPLETO de esa persona              ║
-- ║ ⚠️ Reemplaza  '11.111.111-1'  por el RUT que elegiste     ║
-- ╚══════════════════════════════════════════════════════════╝
with yo as (select '11.111.111-1'::text as rut)     -- ← PON ACÁ EL RUT
-- 5a) Sus compras
select 'COMPRA' as tipo,
       p.created_at::date as fecha,
       coalesce(e.nombre,'—') as evento,
       ip.nombre_ticket as detalle,
       ip.cantidad as cant,
       p.total_pagado as monto,
       p.estado
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
left join public.eventos e on e.id = ip.evento_id
where exists (
  select 1 from jsonb_array_elements(coalesce(ip.personas,'[]'::jsonb)) x
  where replace(replace(x->>'rut','.',''),'-','') = replace(replace((select rut from yo),'.',''),'-','')
)
union all
-- 5b) Sus ingresos por la puerta
select 'ENTRÓ',
       (qu.created_at at time zone 'America/Santiago')::date,
       coalesce(e.nombre,'—'),
       to_char(qu.created_at at time zone 'America/Santiago','HH24:MI') || ' h · ' || coalesce(ip.nombre_ticket,''),
       1, null, coalesce(qu.incidencia,'ok')
from public.qr_usados qu
join public.items_pedido ip on ip.qr_ids ? qu.qr_id
left join public.eventos e on e.id = ip.evento_id
where exists (
  select 1 from jsonb_array_elements(coalesce(ip.personas,'[]'::jsonb)) x
  where replace(replace(x->>'rut','.',''),'-','') = replace(replace((select rut from yo),'.',''),'-','')
)
union all
-- 5c) Veces que apareció en una lista de cortesía
select 'EN LISTA',
       li.created_at::date,
       coalesce(e.nombre,'—'),
       coalesce(l.nombre,'lista'),
       1, null, coalesce(li.estado,'')
from public.lista_inscritos li
left join public.listas l on l.id = li.lista_id
left join public.eventos e on e.id = l.evento_id
where replace(replace(coalesce(li.rut,''),'.',''),'-','') = replace(replace((select rut from yo),'.',''),'-','')
union all
-- 5d) Solicitudes que hizo (cumpleaños, reservas)
select 'SOLICITÓ',
       f.created_at::date, coalesce(f.tipo,''),
       coalesce(f.nombre,''), 1,
       nullif(regexp_replace(coalesce(f.gestion->>'monto',''),'\D','','g'),'')::int,
       coalesce(f.estado,'')
from public.formularios f
where replace(replace(coalesce(f.datos->>'rut',''),'.',''),'-','') = replace(replace((select rut from yo),'.',''),'-','')
   or lower(coalesce(f.email,'')) in (select lower(email) from public.personas where rut = (select rut from yo))
order by 2 desc;
