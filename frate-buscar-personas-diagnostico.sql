-- ============================================================
-- FRATE — ¿Dónde están estas personas? (diagnóstico, solo lectura)
-- Busca por correo y por RUT en: compras (como comprador o invitado) y listas.
-- ============================================================
with correos as (
  select unnest(array['%lucianaflorencia2004%','%bastiasthiare4%','%francesca.bastias%']) as c
), ruts as (
  select unnest(array['%578522%','%211883%','%584881%','%346700%','%387165%']) as r
)
-- 1) Como INVITADO dentro de una compra (personas de items_pedido)
select 'orden · invitado'                     as donde,
       'FCC-'||lpad(p.id::text,6,'0')         as ref,
       p.estado                               as estado,
       e->>'nombre'                           as persona,
       e->>'rut'                              as rut,
       e->>'email'                            as email,
       p.nombre_cliente                       as comprador
from pedidos p
join items_pedido ip on ip.pedido_id = p.id
cross join lateral jsonb_array_elements(coalesce(ip.personas::jsonb,'[]'::jsonb)) e
where exists (select 1 from correos where lower(coalesce(e->>'email','')) ilike lower(c))
   or exists (select 1 from ruts    where replace(coalesce(e->>'rut',''),'.','') ilike r)

union all
-- 2) Como COMPRADOR de una orden
select 'orden · comprador', 'FCC-'||lpad(p.id::text,6,'0'), p.estado,
       p.nombre_cliente, null::text, p.email_cliente, p.nombre_cliente
from pedidos p
where exists (select 1 from correos where lower(coalesce(p.email_cliente,'')) ilike lower(c))

union all
-- 3) En una LISTA de invitados
select 'lista', 'lista #'||li.lista_id::text, li.estado,
       li.nombre, li.rut, li.email, null::text
from lista_inscritos li
where exists (select 1 from correos where lower(coalesce(li.email,'')) ilike lower(c))
   or exists (select 1 from ruts    where replace(coalesce(li.rut,''),'.','') ilike r)

order by 1, 2;
