-- === clase de ticket · PARTE 2 de 2 ===
-- En orden. Cada parte queda entera.

-- Los tipos ya creados en eventos heredan del catálogo.
update public.tipos_ticket t
   set clase = c.clase
  from public.catalogo_tickets c
 where t.catalogo_id = c.id and t.clase is null and c.clase is not null;

-- Los que no vienen del catálogo (creados a mano en un evento): misma regla.
update public.tipos_ticket set clase =
  case
    when nombre ~* '(prueba|test)'            then 'prueba'
    when nombre ~* '(^|\s)ingreso(\s|$)|puerta' then 'puerta'
    when nombre ~* 'pre-?\s*venta'            then 'venta'
    when nombre ~* '\mventa\M'                then 'venta'
    else 'cortesia'
  end
where clase is null;


-- ── 4) VIP AIRE VENTA ──────────────────────────────────────────────
-- Pablo, 2026-08-03: «LISTA VIP AIRE... cortesía... las que se venden
-- deben ser VIP AIRE VENTA. Deben existir opciones distintas: algunas se
-- venden, otras no.»
-- Precio 0 a propósito: el monto de un VIP es variable y lo pone un
-- humano al emitirlo. Poner una cifra acá sería inventarla.
insert into public.catalogo_tickets
  (nombre, descripcion, precio, max_por_compra, zona, zona_id, genero,
   hora_max_ingreso, instrucciones, transferible, activo, orden, clase, clase_confirmada)
select
  'LISTA VIP AIRE VENTA (VÁLIDA HASTA LAS 02:30 HRS)',
  'VIP AIRE pagado. El monto lo define quien lo vende — el precio de acá es solo referencia.',
  0, 1, c.zona, c.zona_id, c.genero, c.hora_max_ingreso, c.instrucciones,
  c.transferible, true, coalesce(c.orden,0), 'venta', true
from public.catalogo_tickets c
where c.nombre ilike 'LISTA VIP AIRE%'
  and c.nombre not ilike '%VENTA%'
  and not exists (select 1 from public.catalogo_tickets x where x.nombre ilike 'LISTA VIP AIRE VENTA%')
limit 1;


-- ── 5) El tablero de puerta deja de adivinar ───────────────────────
-- `evento_vivo` decidía la categoría con `precio_unitario > 0` y un regex
-- de 'ingreso'. Ahora manda la clase del tipo, y la vieja regla queda
-- solo de respaldo para lo que todavía no tenga clase.
-- Las de clase 'prueba' NO se cuentan en ninguna parte: ni emitidas, ni
-- entradas, ni aforo, ni desglose. Para eso existe esa clase.
create or replace function public.item_clase(p_tipo_ticket_id int, p_nombre text, p_precio numeric)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select t.clase from public.tipos_ticket t where t.id = p_tipo_ticket_id and t.clase is not null),
    case when coalesce(p_precio,0) > 0 then 'venta'
         when coalesce(p_nombre,'') ~* '(^|\s)ingreso(\s|$)|puerta' then 'puerta'
         else 'cortesia' end)
$$;
grant execute on function public.item_clase(int, text, numeric) to authenticated, service_role;

comment on function public.item_clase is
  'La clase de una entrada YA emitida, sin tocar items_pedido: la lee del tipo. Si el tipo no la tiene, cae a la regla vieja.';


-- ── 6) Chequeo ─────────────────────────────────────────────────────
select clase,
       count(*)                                        as tipos,
       count(*) filter (where not clase_confirmada)     as por_confirmar,
       string_agg(nombre, ' · ' order by nombre)        as cuales
from public.catalogo_tickets
group by clase
order by clase;
