-- 👀 LOS MISMOS NÚMEROS, SIN LA GUARDA DE ADMIN  (SOLO LECTURA)
--
-- `admin_kpi_usuarios()` devolvió null en el editor y está BIEN: la función
-- exige `auth.uid()` con rol admin, y en el editor SQL no hay usuario
-- autenticado. En el panel sí lo hay, así que ahí va a responder.
--
-- Esto corre el mismo cálculo sin esa guarda, solo para que veas los números.

with pag as (
  select coalesce(p.cliente_id::text, lower(btrim(p.email_cliente))) as persona,
         p.cliente_id,
         coalesce(p.total_pagado, p.total, 0) as plata
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
select
  (select count(*) from porpersona)                                   as te_han_pagado,
  (select count(distinct cliente_id) from conplata
     where cliente_id is not null)                                    as con_cuenta,
  (select count(*) from public.clientes)                              as cuentas_creadas,
  (select count(*) from public.pedidos where estado = 'pagado')        as ordenes_pagadas,
  (select count(*) from conplata)                                     as con_plata,
  (select count(*) from public.pedidos
     where estado = 'pagado'
       and coalesce(total_pagado, total, 0) <= 0)                     as cortesias,
  round((select entradas from ent)::numeric
        / nullif((select count(*) from conplata), 0), 1)              as entradas_por_orden,
  round((select avg(plata) from conplata))                            as orden_promedio,
  round((select avg(gastado) from porpersona))                        as gasto_por_persona,
  round((select avg(ordenes) from porpersona), 1)                     as compras_por_persona,
  round((select count(*) filter (where ordenes > 1) * 100.0
           / nullif(count(*), 0) from porpersona))                    as volvieron_pct;
