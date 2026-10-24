-- 👻 SOLICITUDES QUE YA NO CORRESPONDEN · solo lectura
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- CASO QUE LO DESTAPÓ: Gabriela Ocando compró dos veces por accidente
-- (FCC-003682 y FCC-003684). Se le devolvió la 003684 — correcto — pero la
-- SOLICITUD estaba puesta sobre la 003682, y esa orden nunca se tocó.
-- Resultado: la bandeja sigue pidiendo devolver una entrada con la que ella
-- YA ENTRÓ (11:28 p.m.).
--
-- Nada de esto se cierra solo. Esta consulta las encuentra todas.

with pend as (
  select p.id, p.nombre_cliente, p.email_cliente, p.total_pagado,
         p.dev_motivo, p.dev_solicitada_at
  from public.pedidos p
  where p.dev_estado = 'pendiente'
),
qrs as (
  select pe.id as pedido_id,
         count(*)                                              as qr_total,
         count(*) filter (where u.qr_id is not null
                           and u.incidencia is null)           as entraron,
         count(*) filter (where u.incidencia = 'reembolsado')  as ya_devueltos
  from pend pe
  join public.items_pedido ip on ip.pedido_id = pe.id
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
  left join public.qr_usados u on u.qr_id = q.qr
  group by pe.id
),
ev as (
  select distinct on (ip.pedido_id) ip.pedido_id, e.nombre, e.fecha
  from public.items_pedido ip
  join public.eventos e on e.id = ip.evento_id
  order by ip.pedido_id, e.fecha
)
select 'FCC-'||lpad(pe.id::text,6,'0')          as orden,
       pe.nombre_cliente                        as persona,
       pe.email_cliente                         as correo,
       pe.total_pagado                          as monto,
       ev.nombre                                as evento,
       ev.fecha                                 as fecha_evento,
       coalesce(q.qr_total,0)                   as entradas,
       coalesce(q.entraron,0)                   as entraron,
       coalesce(q.ya_devueltos,0)               as ya_devueltos,
       -- ¿tiene OTRA orden del mismo correo que ya se devolvió?
       (select string_agg('FCC-'||lpad(o.id::text,6,'0'), ', ')
          from public.pedidos o
         where o.id <> pe.id
           and lower(btrim(coalesce(o.email_cliente,''))) = lower(btrim(coalesce(pe.email_cliente,'')))
           and o.estado = 'reembolsado')        as otra_ya_devuelta,
       case
         when coalesce(q.ya_devueltos,0) > 0
           then '✅ YA SE DEVOLVIÓ — cerrar la solicitud'
         when coalesce(q.entraron,0) = coalesce(q.qr_total,0) and coalesce(q.qr_total,0) > 0
           then '🚪 ENTRÓ CON ESTA — no corresponde, rechazar'
         when exists (select 1 from public.pedidos o
                       where o.id <> pe.id
                         and lower(btrim(coalesce(o.email_cliente,''))) = lower(btrim(coalesce(pe.email_cliente,'')))
                         and o.estado = 'reembolsado')
           then '⚠️ SE DEVOLVIÓ OTRA ORDEN SUYA — revisar cuál correspondía'
         when ev.fecha < current_date
           then '🕐 el evento ya pasó'
         else '⏳ sigue vigente'
       end                                      as veredicto,
       pe.dev_motivo                            as motivo,
       pe.dev_solicitada_at::date               as pedida
from pend pe
left join qrs q  on q.pedido_id = pe.id
left join ev     on ev.pedido_id = pe.id
order by (coalesce(q.ya_devueltos,0) > 0) desc,
         (coalesce(q.entraron,0) = coalesce(q.qr_total,0)) desc,
         pe.dev_solicitada_at desc nulls last;
