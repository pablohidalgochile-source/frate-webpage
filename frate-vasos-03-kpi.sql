-- frate-vasos-03-kpi.sql   ·   17-oct-2026   ·   PARTE 3 de 3
--
-- El KPI global «Entradas vendidas» suma items_pedido.cantidad SIN mirar que tipo
-- de producto es. Hoy no se nota porque nunca se vendio otra cosa que entradas,
-- pero con el vaso andando cada vaso sumaria como una entrada mas.
-- Se le agrega el filtro. El resto de la funcion queda igual.

create or replace function public.admin_kpi_ventas(p_desde timestamp with time zone default null)
returns table(tickets bigint, ingresos bigint, servicios bigint)
language sql stable security definer set search_path to 'public'
as $function$
  -- ⚠️ Las sumas van SEPARADAS a propósito. Si se unen pedidos con items en una
  --    sola consulta, un pedido de 3 entradas repite su fila 3 veces y su total se
  --    suma 3 veces. Los ingresos salían inflados.
  select
    (select coalesce(sum(ip.cantidad), 0)
       from public.items_pedido ip
       join public.pedidos p on p.id = ip.pedido_id
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
        -- 🥤 Solo entradas: un vaso no es una entrada vendida.
        and coalesce(ip.producto_tipo, 'ticket') = 'ticket'
        and (p_desde is null or p.created_at >= p_desde))::bigint,
    (select coalesce(sum(coalesce(p.total_pagado, p.total, 0)), 0)
       from public.pedidos p
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
        and p.origen <> 'crm'
        and (p_desde is null or p.created_at >= p_desde))::bigint,
    -- Un link de cumple se crea un día y se paga otro: acá manda cuándo entró la plata.
    (select coalesce(sum(coalesce(p.total_pagado, p.total, 0)), 0)
       from public.pedidos p
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
        and p.origen = 'crm'
        and (p_desde is null or coalesce(p.fecha_pago, p.created_at) >= p_desde))::bigint
  where exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol = 'admin')
$function$;
