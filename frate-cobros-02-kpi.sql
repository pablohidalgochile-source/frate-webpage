-- FRATE · COBROS 02 · el KPI «Ingresos» deja de mezclar entradas con cobros de cumpleaños/reservas
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-01a-crm-pagos.sql
-- Reemplaza admin_kpi_ventas con la MISMA firma (p_desde timestamptz default null) y los mismos campos
-- (tickets, ingresos) + uno nuevo:
--   · ingresos  = lo de siempre, pero SIN los pedidos origen 'crm' (un cobro de servicio no es venta de entradas)
--   · servicios = cobros de servicio pagados (pedidos origen 'crm'), contados por fecha de pago
-- Como cambia lo que devuelve, Postgres obliga a borrarla y crearla de nuevo: va todo en UNA transacción,
-- así que si algo falla queda la función de antes. Idempotente.
-- Reversa: drop function public.admin_kpi_ventas(timestamptz); y vuelve a correr frate-totales-servidor.sql
set lock_timeout = '5s';

begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'pedidos' and column_name = 'origen') then
    raise exception 'Falta correr primero frate-cobros-01a-crm-pagos.sql';
  end if;
end $$;

drop function if exists public.admin_kpi_ventas(timestamptz);

-- p_desde null = desde siempre.
create function public.admin_kpi_ventas(p_desde timestamptz default null)
returns table (tickets bigint, ingresos bigint, servicios bigint)
language sql stable security definer set search_path = public as $$
  -- ⚠️ Las sumas van SEPARADAS a propósito. Si se unen pedidos con items en una
  --    sola consulta, un pedido de 3 entradas repite su fila 3 veces y su total se
  --    suma 3 veces. Los ingresos salían inflados.
  select
    (select coalesce(sum(ip.cantidad), 0)
       from public.items_pedido ip
       join public.pedidos p on p.id = ip.pedido_id
      where p.estado = 'pagado' and coalesce(p.total, 0) > 0
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
$$;

revoke execute on function public.admin_kpi_ventas(timestamptz) from anon, public;
grant  execute on function public.admin_kpi_ventas(timestamptz) to authenticated;
commit;

notify pgrst, 'reload schema';

-- Verificación. Desde el SQL Editor la función no devuelve filas (no hay sesión de admin),
-- así que se muestra lo que devuelve y el mismo cálculo de los últimos 30 días hecho a mano.
select 'admin_kpi_ventas devuelve' as chequeo,
       (select pg_get_function_result(to_regprocedure('public.admin_kpi_ventas(timestamptz)'))) as valor
union all
select 'ingresos entradas · 30 días', (select coalesce(sum(coalesce(total_pagado, total, 0)), 0)::text from public.pedidos
         where estado = 'pagado' and coalesce(total, 0) > 0 and origen <> 'crm' and created_at >= now() - interval '30 days')
union all
select 'servicios (cumples/reservas) · 30 días', (select coalesce(sum(coalesce(total_pagado, total, 0)), 0)::text from public.pedidos
         where estado = 'pagado' and coalesce(total, 0) > 0 and origen = 'crm'
           and coalesce(fecha_pago, created_at) >= now() - interval '30 days')
union all
select 'anon NO puede ejecutarla', case when has_function_privilege('anon', 'public.admin_kpi_ventas(timestamptz)', 'execute')
         then '❌ SÍ puede' else 'OK' end;
