-- 📋 LOS 14 RUT, UNO POR UNO · UNA SOLA CONSULTA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · solo lectura
--
-- ⚠️ El editor de Supabase muestra SOLO el resultado de la última consulta
--    del archivo. Por eso acá va una sola.
--
-- LA COLUMNA QUE MANDA ES `veredicto`. Si dice YA ENTRÓ, no se devuelve.

with buscados(rut_original) as (values
  ('22774304-2'),  -- Raphaella Orellana
  ('22465041-8'),  -- Mia Peña
  ('22322774-0'),  -- Gennara Cuevas
  ('21782951-8'),  -- Sebastián Villagra
  ('21464915-2'),  -- Fernanda Cavia Carrasco
  ('20981867-1'),  -- Matías Miqueles
  ('21697881-1'),  -- Juan Quinteros
  ('22303103-K'),  -- Héctor Meza
  ('20382037-2'),  -- Andrés Arce
  ('20836577-0'),  -- Anahí Otárola
  ('20844833-1'),  -- Carol Gutiérrez
  ('21463095-8'),  -- Fernanda Martínez Moscoso
  ('21043543-3'),  -- Jesús Astudillo
  ('23330553-7')   -- Juan Vilca
),
b as (
  select rut_original,
         upper(regexp_replace(rut_original, '[^0-9kK]', '', 'g')) as rut_limpio
  from buscados
),
qrs as (
  select p.id                                        as pedido_id,
         'FCC-'||lpad(p.id::text,6,'0')              as orden,
         p.nombre_cliente                            as comprador,
         p.email_cliente                             as correo,
         p.dev_estado,
         ip.nombre_ticket,
         ip.precio_unitario,
         ip.evento_id,
         q.qr,
         pp.per->>'nombre'                           as persona,
         upper(regexp_replace(coalesce(pp.per->>'rut',''), '[^0-9kK]', '', 'g')) as rut_limpio
  from public.pedidos p
  join public.items_pedido ip on ip.pedido_id = p.id
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb))
             with ordinality q(qr, i)
  cross join lateral (select coalesce(ip.personas -> (q.i-1)::int, '{}'::jsonb) as per) pp
  where p.estado = 'pagado'
)
select b.rut_original                                as rut,
       coalesce(q.persona, '— no aparece —')         as persona,
       q.orden,
       q.comprador,
       q.correo,
       q.nombre_ticket                               as ticket,
       q.precio_unitario                             as pago,
       e.nombre                                      as evento,
       e.fecha,
       case when q.orden is null      then '❓ NO ESTÁ EN LA BASE'
            when u.qr_id is not null  then '🚫 YA ENTRÓ — no se devuelve'
            when q.dev_estado is not null then '⏳ ya tiene solicitud'
            else '✅ SE PUEDE DEVOLVER' end          as veredicto,
       u.created_at                                  as hora_ingreso
from b
left join qrs q            on q.rut_limpio = b.rut_limpio
left join public.eventos e on e.id = q.evento_id
left join public.qr_usados u on u.qr_id = q.qr
order by (u.qr_id is not null) desc nulls last,
         (q.orden is null) desc,
         e.fecha desc nulls last,
         b.rut_original;
