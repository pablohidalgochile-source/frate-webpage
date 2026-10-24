-- ⚡ QUE LA BASE SUME, NO EL NAVEGADOR
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- EL PROBLEMA DE FONDO (lo que reventó el viernes en vivo):
--   El admin traía TODAS las filas de items_pedido y pedidos al navegador
--   —de a mil, en viajes seguidos— para sumarlas ahí. Funcionaba perfecto
--   con mil pedidos y se cayó con seis mil. Crece con cada venta.
--
--   Estas dos funciones devuelven el total YA SUMADO: en vez de 8.400
--   filas viajando, viajan 29. El navegador no suma nada.
--
-- LAS REGLAS DEL NEGOCIO QUEDAN ADENTRO, no repartidas por la app:
--   · Solo cuenta lo PAGADO. Los QR nacen al armar el carrito, así que un
--     checkout abandonado deja filas que no son ventas.
--   · Las CORTESÍAS van aparte SIEMPRE. Son gratis y no se suman a la
--     venta: se distinguen por precio 0 o método 'cortesia'.


-- ── Totales por evento — reemplaza el bucle de Eventos y del panel ──
create or replace function public.admin_totales_eventos(p_ids int[] default null)
returns table (evento_id int, vendidos bigint, ingresos bigint, cortesias bigint)
language sql stable security definer set search_path = public as $$
  select ip.evento_id,
         coalesce(sum(ip.cantidad) filter (where es_venta), 0)::bigint,
         coalesce(sum(ip.cantidad * coalesce(ip.precio_unitario,0))
                  filter (where es_venta), 0)::bigint,
         coalesce(sum(ip.cantidad) filter (where not es_venta), 0)::bigint
  from public.items_pedido ip
  join lateral (
    select (coalesce(p.total,0) > 0 and coalesce(p.metodo_pago,'') <> 'cortesia') as es_venta
    from public.pedidos p
    where p.id = ip.pedido_id and p.estado = 'pagado'
  ) v on true
  where ip.evento_id is not null
    and (p_ids is null or ip.evento_id = any(p_ids))
    and exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol in ('admin','rrpp'))
  group by ip.evento_id
$$;

revoke execute on function public.admin_totales_eventos(int[]) from anon, public;
grant  execute on function public.admin_totales_eventos(int[]) to authenticated;


-- ── Entradas e ingresos del periodo — reemplaza el KPI del panel ────
-- p_desde null = desde siempre.
create or replace function public.admin_kpi_ventas(p_desde timestamptz default null)
returns table (tickets bigint, ingresos bigint)
language sql stable security definer set search_path = public as $$
  -- ⚠️ Las dos sumas van SEPARADAS a propósito. Si se unen pedidos con
  --    items en una sola consulta, un pedido de 3 entradas repite su fila
  --    3 veces y su total se suma 3 veces. Los ingresos salían inflados.
  select
    (select coalesce(sum(ip.cantidad), 0)
       from public.items_pedido ip
       join public.pedidos p on p.id = ip.pedido_id
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
        and (p_desde is null or p.created_at >= p_desde))::bigint,
    (select coalesce(sum(coalesce(p.total_pagado, p.total, 0)), 0)
       from public.pedidos p
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
        and (p_desde is null or p.created_at >= p_desde))::bigint
  where exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol = 'admin')
$$;

revoke execute on function public.admin_kpi_ventas(timestamptz) from anon, public;
grant  execute on function public.admin_kpi_ventas(timestamptz) to authenticated;


-- ── Chequeo · los totales por evento, ya sumados ──────────────────
select e.fecha, e.nombre, t.vendidos, t.ingresos, t.cortesias
from public.admin_totales_eventos() t
join public.eventos e on e.id = t.evento_id
order by e.fecha desc
limit 15;
