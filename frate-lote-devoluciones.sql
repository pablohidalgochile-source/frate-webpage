-- 📋 LAS 14 PERSONAS DE INSTAGRAM · ¿qué compraron y entraron o no?
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SOLO LECTURAS, no cambia nada
--
-- ⚠️ LA COLUMNA QUE MANDA ES `entro`. Si el QR fue escaneado, la persona
--    entró a la fiesta y NO corresponde devolverle nada. Míralo antes que
--    cualquier otra cosa.

with pedidos_rut as (
  select unnest(array[
    -- Grupo Raphaella
    '22774304-2',   -- Raphaella Orellana
    '22465041-8',   -- Mia Peña
    '22322774-0',   -- Gennara Cuevas
    -- Sueltos
    '21782951-8',   -- Sebastián Villagra   (de la orden FCC-004598)
    -- Grupo Fernanda Cavia  → parece ser la orden FCC-004761 entera
    '21464915-2',   -- Fernanda Cavia Carrasco
    '20981867-1',   -- Matías Miqueles
    '21697881-1',   -- Juan Quinteros
    '22303103-K',   -- Héctor Meza
    '20382037-2',   -- Andrés Arce
    -- Sueltas
    '20836577-0',   -- Anahí Otárola
    '20844833-1',   -- Carol Gutiérrez
    -- De los mensajes de Instagram
    '21463095-8',   -- Fernanda Martínez Moscoso (pide FCC-005822 y FCC-005821)
    '21043543-3',   -- Jesús Astudillo
    '23330553-7'    -- Juan Vilca
  ]) as rut
),
buscados as (
  select upper(regexp_replace(rut, '[^0-9kK]', '', 'g')) as rut_limpio, rut as rut_original
  from pedidos_rut
),
-- Cada QR con la persona que lleva adentro
qrs as (
  select p.id                                             as pedido_id,
         'FCC-'||lpad(p.id::text,6,'0')                   as orden,
         p.nombre_cliente                                 as comprador,
         p.email_cliente                                  as correo_compra,
         p.estado                                         as estado_pedido,
         p.dev_estado,
         ip.nombre_ticket,
         ip.precio_unitario,
         ip.evento_id,
         q.qr,
         per->>'nombre'                                   as persona,
         upper(regexp_replace(coalesce(per->>'rut',''), '[^0-9kK]', '', 'g')) as rut_limpio
  from public.pedidos p
  join public.items_pedido ip on ip.pedido_id = p.id
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb))
             with ordinality q(qr, i)
  left join lateral (select coalesce(ip.personas -> (q.i-1)::int, '{}'::jsonb) as per) pp on true
  where p.estado = 'pagado'
)
select b.rut_original                                     as rut_pedido,
       coalesce(q.persona, '❌ NO ESTÁ EN LA BASE')        as persona,
       q.orden,
       q.comprador,
       q.correo_compra,
       q.nombre_ticket,
       q.precio_unitario                                  as pago,
       e.nombre                                           as evento,
       e.fecha,
       (u.qr_id is not null)                              as entro,
       case when u.qr_id is not null
            then '🚫 YA ENTRÓ — no se devuelve'
            when q.orden is null then '❓ no aparece'
            else '✅ se puede devolver' end               as veredicto,
       q.dev_estado                                       as ya_pidio,
       u.created_at                                       as hora_ingreso
from buscados b
left join qrs q            on q.rut_limpio = b.rut_limpio
left join public.eventos e on e.id = q.evento_id
left join public.qr_usados u on u.qr_id = q.qr
order by (u.qr_id is not null) desc, e.fecha desc nulls last, b.rut_original;


-- ── Las dos órdenes que nombró Fernanda Martínez por Instagram ────
select 'FCC-'||lpad(p.id::text,6,'0') as orden, p.nombre_cliente, p.email_cliente,
       p.estado, p.total_pagado, p.dev_estado,
       (select count(*) from public.items_pedido i2
         join public.qr_usados u2 on u2.qr_id = any(
              select jsonb_array_elements_text(coalesce(i2.qr_ids,'[]'::jsonb)))
        where i2.pedido_id = p.id)                        as qr_ya_usados
from public.pedidos p
where p.id in (5822, 5821, 4761, 4598);
