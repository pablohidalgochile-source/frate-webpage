-- 🔎 ¿En qué estado está el ticket FCC-009888, y sirve o no en la puerta?
-- Solo LEE. No cambia nada. Cambia el 9888 si quieres mirar otro.
--
-- Dos correcciones respecto de la primera versión:
--   · qr_ids es JSONB, no un array de Postgres → jsonb_array_elements_text.
--   · una fila en qr_usados NO significa "entró": las devoluciones y los
--     cambios de día también escriben ahí. Solo cuenta incidencia is null.

with p as (
  select * from public.pedidos where id = 9888
),
qrs as (
  select q.qr
    from public.items_pedido i
    cross join lateral jsonb_array_elements_text(coalesce(i.qr_ids,'[]'::jsonb)) q(qr)
   where i.pedido_id = (select id from p)
)
select
  'FCC-'||lpad(p.id::text,6,'0')                        as ticket,
  p.nombre_cliente,
  p.estado,
  coalesce(p.total_pagado, p.total, 0)                  as pago,
  p.metodo_pago,
  -- Lo ÚNICO que decide en la puerta: check_qr y quemar_qr exigen
  -- estado='pagado'. Cualquier otro estado ya está muerto.
  case when p.estado = 'pagado' then '⚠️ SÍ ENTRA · todavía sirve'
       else '✅ NO ENTRA · la puerta lo rechaza' end     as en_la_puerta,
  case when p.estado in ('cancelado','reembolsado','expirado') then 'el cupo volvió'
       when p.stock_reservado then 'el cupo SIGUE ocupado'
       else 'sin reserva de cupo' end                    as cupo,
  p.anulada_por, p.anulada_motivo, p.anulada_at,
  (select count(*) from public.items_pedido i where i.pedido_id = p.id) as lineas,
  (select count(*) from qrs)                            as qr_emitidos,
  (select count(*) from qrs
     where exists (select 1 from public.qr_usados u
                    where u.qr_id = qrs.qr and u.incidencia is null)) as ya_entraron
from p;
