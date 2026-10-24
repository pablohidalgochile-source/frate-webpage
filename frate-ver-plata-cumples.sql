-- 💰 ¿Cuadra la plata de reservas y cumpleaños? Solo LEE.
--
-- Hay DOS lugares donde vive el monto de una ficha:
--   ① formularios.gestion->>'monto' y 'monto_total'  ← TEXTO, se escribe a mano (o lo suma el pago)
--      reservas.pagado_monto                          ← número
--   ② crm_pagos                                       ← filas formales con estado
-- Si no coinciden, el número que miras y el que va al ERP pueden ser distintos.
--
-- Cada cobro se cruza con SU tabla: tipo 'formulario' → formularios · tipo 'reserva' → reservas.
-- (Antes se cruzaban cobros de la tabla reservas contra fichas de formularios que solo compartían el número.)
-- Plata registrada = lo pagado (monto_pagado, o monto en cobros viejos) + pagos extra − lo devuelto.
-- Corre antes y después de frate-cobros-01a/01b: las columnas nuevas se leen con to_jsonb.

with cobros as (
  select c.tipo, c.ref_id, c.estado,
         to_jsonb(c)->>'cotejo' as cotejo,
         (select p.estado from public.pedidos p where p.id = c.pedido_id) as pedido_estado,
         case when c.estado in ('pagado', 'devuelto') then
           coalesce(nullif(to_jsonb(c)->>'monto_pagado', '')::bigint, c.monto)
           + coalesce((select sum(round(nullif(regexp_replace(e->>'monto', '[^0-9.]', '', 'g'), '')::numeric))
                         from jsonb_array_elements(case when jsonb_typeof(to_jsonb(c)->'pagos_extra') = 'array'
                                                        then to_jsonb(c)->'pagos_extra' else '[]'::jsonb end) e), 0)
           - coalesce(nullif(to_jsonb(c)->>'devuelto_monto', '')::bigint, 0)
         else 0 end as neto
  from public.crm_pagos c
  where c.tipo in ('formulario', 'reserva')
),
pagos as (
  select tipo, ref_id,
         count(*)                                                                   as n_pagos,
         count(*) filter (where estado = 'pendiente')                               as n_pendientes,
         count(*) filter (where estado = 'pendiente' and pedido_estado = 'pagado')  as n_sin_reflejar,
         coalesce(sum(neto), 0)                                                     as suma_pagada,
         string_agg(distinct cotejo, ', ') filter (where cotejo is not null and cotejo <> 'cuadra') as alertas
  from cobros
  group by tipo, ref_id
),
fichas as (
  select 'formulario'::text as tipo_cobro, f.id, f.tipo, f.nombre, f.created_at::date as dia,
         f.gestion->>'pago'        as pago_dice,
         nullif(regexp_replace(coalesce(f.gestion->>'monto',''),       '[^0-9]', '', 'g'), '')::bigint as monto_txt,
         nullif(regexp_replace(coalesce(f.gestion->>'monto_total',''), '[^0-9]', '', 'g'), '')::bigint as total_txt
  from public.formularios f
  where f.created_at > now() - interval '60 days'
    and f.tipo in ('cumple','reserva')
  union all
  select 'reserva', r.id, 'reservas·' || coalesce(r.tipo, '?'), r.nombre, r.created_at::date,
         to_jsonb(r)->>'pagado_medio',
         nullif(to_jsonb(r)->>'pagado_monto', '')::bigint,
         null::bigint
  from public.reservas r
  where r.created_at > now() - interval '60 days'
    and (coalesce(nullif(to_jsonb(r)->>'pagado_monto', '')::bigint, 0) > 0
         or exists (select 1 from public.crm_pagos c where c.tipo = 'reserva' and c.ref_id = r.id))
)
select
  fi.dia, fi.tipo, fi.id, left(fi.nombre,26) as quien,
  fi.monto_txt                                    as monto_escrito,
  fi.total_txt                                    as total_escrito,
  fi.pago_dice                                    as dice_pago,
  coalesce(pg.n_pagos,0)                          as filas_en_crm_pagos,
  coalesce(pg.n_pendientes,0)                     as links_pendientes,
  coalesce(pg.suma_pagada,0)                      as plata_registrada,
  pg.alertas                                      as alertas_cotejo,
  case
    when coalesce(pg.n_sin_reflejar,0) > 0
      then '🚨 el pedido está pagado pero el cobro sigue pendiente'
    when coalesce(pg.n_pagos,0) = 0 and coalesce(fi.monto_txt,0) > 0
      then '⚠️ hay monto escrito pero NINGUNA fila de pago'
    when coalesce(pg.suma_pagada,0) <> coalesce(fi.monto_txt,0)
      then '❌ no cuadran'
    when coalesce(fi.monto_txt,0) = 0 and coalesce(pg.suma_pagada,0) = 0
      then '· sin plata todavía'
    else '✅ cuadra'
  end                                             as veredicto
from fichas fi
left join pagos pg on pg.tipo = fi.tipo_cobro and pg.ref_id = fi.id
order by fi.dia desc, fi.id desc
limit 80;
