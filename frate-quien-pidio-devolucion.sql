-- 📋 QUIÉN PIDIÓ DEVOLUCIÓN · la lista completa, de las DOS vías
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · solo lecturas
--
-- ⚠️ HAY DOS CAMINOS y caen en lugares DISTINTOS:
--   1. Desde su cuenta (index.html → `solicitar-devolucion`)
--      → marca `pedidos.dev_estado = 'pendiente'`
--   2. Desde frate.cl/devolucion (correo + N° de orden → `devolucion-solicitar`)
--      → crea una fila en `solicitudes_devolucion`
--
-- El admin muestra las dos, pero en secciones separadas. Esta consulta las
-- junta para que no se te pase ninguna.


-- ── 1) TODAS, las dos vías juntas, más nueva primero ──────────────
select * from (

  -- Vía cuenta
  select 'cuenta'                                   as via,
         p.id                                       as pedido_id,
         'FCC-'||lpad(p.id::text,6,'0')             as orden,
         p.nombre_cliente                           as persona,
         p.email_cliente                            as correo,
         p.total_pagado                             as pago,
         p.dev_estado                               as estado,
         p.dev_motivo                               as motivo,
         p.dev_opcion                               as opcion,
         p.dev_solicitada_at                        as pedida_at
  from public.pedidos p
  where p.dev_estado is not null

  union all

  -- Vía página pública
  select 'pagina'                                   as via,
         s.pedido_id,
         'FCC-'||lpad(s.pedido_id::text,6,'0')      as orden,
         coalesce(s.nombre, pp.nombre_cliente)      as persona,
         coalesce(s.email,  pp.email_cliente)       as correo,
         s.monto_devolver                           as pago,
         s.estado,
         s.motivo,
         null                                       as opcion,
         s.created_at                               as pedida_at
  from public.solicitudes_devolucion s
  left join public.pedidos pp on pp.id = s.pedido_id

) t
order by pedida_at desc nulls last;


-- ── 2) El resumen, para saber de qué tamaño es el problema ────────
select via, estado, count(*) as cuantas,
       to_char(coalesce(sum(pago),0), 'FM$999G999G999') as plata_involucrada
from (
  select 'cuenta' as via, dev_estado as estado, total_pagado as pago
    from public.pedidos where dev_estado is not null
  union all
  select 'pagina', s.estado, s.monto_devolver
    from public.solicitudes_devolucion s
) x
group by via, estado
order by via, estado;


-- ── 3) ⚠️ Las que piden devolución Y tienen cortesía esa misma noche ──
-- Estas son las que NO corresponde devolver: entran con la que pagaron.
select 'FCC-'||lpad(p.id::text,6,'0')  as orden,
       p.nombre_cliente                as persona,
       p.email_cliente                 as correo,
       p.total_pagado                  as pago,
       e.nombre                        as evento,
       e.fecha,
       count(*) filter (where coalesce(o.total_pagado,0) = 0) as cortesias_esa_noche
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
left join public.eventos e  on e.id = ip.evento_id
join public.items_pedido io on io.evento_id = ip.evento_id
join public.pedidos o       on o.id = io.pedido_id and o.id <> p.id
where p.dev_estado is not null
  and lower(btrim(coalesce(o.email_cliente,''))) = lower(btrim(coalesce(p.email_cliente,'')))
  and coalesce(p.email_cliente,'') <> ''
group by 1,2,3,4,5,6
having count(*) filter (where coalesce(o.total_pagado,0) = 0) > 0;
