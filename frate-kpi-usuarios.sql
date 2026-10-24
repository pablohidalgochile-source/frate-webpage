-- 👥 LOS NÚMEROS DE USUARIOS, CALCULADOS EN LA BASE
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- POR QUÉ:
--   El panel pedía los pedidos SIN límite y PostgREST corta en 1.000 filas.
--   Con 8.671 órdenes pagadas, el navegador sumaba sobre una octava parte:
--   decía «35 con compras» cuando son 133, y «0 compradores reales» cuando
--   son 1.984. Los dos salían de la misma consulta leída de dos formas.
--
--   Acá se calcula todo de una vez y viaja UNA fila.
--
-- LAS DOS REGLAS DEL NEGOCIO, adentro y no repartidas por la app:
--   · Una PERSONA es su cuenta si la tiene, y su correo si no. El 97% de las
--     órdenes no tiene cuenta: contar solo por cuenta esconde a casi todos.
--   · Las CORTESÍAS van aparte SIEMPRE. Son gratis y no son venta; los
--     promedios de plata se calculan solo sobre lo que sí se pagó.

create or replace function public.admin_kpi_usuarios()
returns jsonb
language sql stable security definer set search_path = public as $$
  with pag as (
    select coalesce(p.cliente_id::text, lower(btrim(p.email_cliente))) as persona,
           p.cliente_id,
           coalesce(p.total_pagado, p.total, 0) as plata,
           p.id
    from public.pedidos p
    where p.estado = 'pagado'
      and (p.cliente_id is not null or coalesce(p.email_cliente,'') <> '')
  ),
  conplata as (select * from pag where plata > 0),
  porpersona as (
    select persona, count(*) as ordenes, sum(plata) as gastado
    from conplata group by persona
  ),
  ent as (
    select coalesce(sum(ip.cantidad), 0) as entradas
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id
    where p.estado = 'pagado' and coalesce(p.total_pagado, p.total, 0) > 0
  )
  select jsonb_build_object(
    'personas_pagaron',   (select count(*) from porpersona),
    'con_cuenta',         (select count(distinct cliente_id) from conplata where cliente_id is not null),
    'cuentas_creadas',    (select count(*) from public.clientes),
    'admins',             (select count(*) from public.clientes where rol = 'admin'),
    'nuevos_hoy',         (select count(*) from public.clientes
                            where created_at >= date_trunc('day', now() at time zone 'America/Santiago')),
    'ordenes_pagadas',    (select count(*) from public.pedidos where estado = 'pagado'),
    'ordenes_con_plata',  (select count(*) from conplata),
    'cortesias',          (select count(*) from public.pedidos
                            where estado = 'pagado' and coalesce(total_pagado, total, 0) <= 0),
    'entradas_por_orden', (select case when (select count(*) from conplata) > 0
                            then round((select entradas from ent)::numeric
                                     / (select count(*) from conplata), 1) end),
    'orden_promedio',     (select round(avg(plata)) from conplata),
    'gasto_por_persona',  (select round(avg(gastado)) from porpersona),
    'compras_por_persona',(select round(avg(ordenes), 1) from porpersona),
    'recompra_pct',       (select case when count(*) > 0
                            then round(count(*) filter (where ordenes > 1) * 100.0 / count(*))
                            end from porpersona)
  )
  where exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol = 'admin')
$$;

revoke execute on function public.admin_kpi_usuarios() from anon, public;
grant  execute on function public.admin_kpi_usuarios() to authenticated;


-- ── Chequeo · los números de verdad ───────────────────────────────
select jsonb_pretty(public.admin_kpi_usuarios()) as numeros;
