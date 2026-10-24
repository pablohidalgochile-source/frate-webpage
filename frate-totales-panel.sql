-- frate-totales-panel.sql
-- El panel de eventos solo sumaba el VALOR de las entradas. Le faltaban dos
-- platas que sí se cobraron:
--   fee        → el 8% de servicio que paga el comprador (pedidos.fee_servicio)
--   servicios  → los cobros de cumpleanos y reservas (folios CUM / RES)
-- Las dos columnas se agregan AL FINAL, así el admin viejo sigue andando igual
-- (lee por nombre y las ignora) y el nuevo ya las encuentra.

drop function if exists public.admin_totales_eventos(integer[]);

create or replace function public.admin_totales_eventos(p_ids integer[] default null)
returns table(evento_id integer, vendidos bigint, ingresos bigint,
              cortesias bigint, fee bigint, servicios bigint)
language sql stable security definer set search_path to 'public'
as $function$
  with guard as (
    select 1 from public.clientes c
     where c.id = auth.uid() and c.rol in ('admin','rrpp')
  ),
  base as (
    select ip.evento_id as ev,
           coalesce(sum(ip.cantidad) filter (where v.es_venta), 0)::bigint as vendidos,
           coalesce(sum(ip.cantidad * coalesce(ip.precio_unitario,0))
                    filter (where v.es_venta), 0)::bigint as ingresos,
           coalesce(sum(ip.cantidad) filter (where not v.es_venta), 0)::bigint as cortesias
      from public.items_pedido ip
      join lateral (
        select (coalesce(p.total,0) > 0
                and coalesce(p.metodo_pago,'') <> 'cortesia') as es_venta
          from public.pedidos p
         where p.id = ip.pedido_id and p.estado = 'pagado'
      ) v on true
     where ip.evento_id is not null
       and (p_ids is null or ip.evento_id = any(p_ids))
     group by ip.evento_id
  ),
  -- El fee vive en el PEDIDO, no en la linea: hay que sumarlo una sola vez por
  -- pedido o se multiplica por la cantidad de lineas. Hoy ningun pedido pagado
  -- mezcla dos eventos (17.740 de 17.740), asi que el evento es unico.
  fees as (
    select q.ev, sum(q.fee_servicio)::bigint as fee
      from (
        select distinct p.id, p.fee_servicio,
               (select min(ip2.evento_id) from public.items_pedido ip2
                 where ip2.pedido_id = p.id and ip2.evento_id is not null) as ev
          from public.pedidos p
         where p.estado = 'pagado' and coalesce(p.fee_servicio,0) > 0
      ) q
     where q.ev is not null and (p_ids is null or q.ev = any(p_ids))
     group by q.ev
  ),
  -- Cumpleanos y reservas: el cobro cuelga del formulario, y el formulario
  -- apunta a su lista por `lista_codigo`. La lista es la unica que sabe el evento.
  servs as (
    select l.evento_id as ev,
           sum(coalesce(cp.monto_pagado, cp.monto))::bigint as servicios
      from public.crm_pagos cp
      join public.formularios f
        on f.id = cp.ref_id and cp.tabla = 'formularios'
      join public.listas l
        on l.codigo = (f.gestion->>'lista_codigo')
     where cp.estado = 'pagado'
       and cp.anulado_at is null
       and l.evento_id is not null
       and (p_ids is null or l.evento_id = any(p_ids))
     group by l.evento_id
  ),
  ids as (
    select ev from base union select ev from fees union select ev from servs
  )
  select i.ev,
         coalesce(b.vendidos, 0)::bigint,
         coalesce(b.ingresos, 0)::bigint,
         coalesce(b.cortesias, 0)::bigint,
         coalesce(fe.fee, 0)::bigint,
         coalesce(s.servicios, 0)::bigint
    from ids i
    left join base  b  on b.ev  = i.ev
    left join fees  fe on fe.ev = i.ev
    left join servs s  on s.ev  = i.ev
   where exists (select 1 from guard)
$function$;
