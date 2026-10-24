-- ═══════════════════════════════════════════════════════════════════
-- 🔎 EL CASO FERNANDA + cuánta gente más está igual
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- SEIS SELECT. No cambia ni una fila. Mándame los seis resultados.
-- FCC-004761 es simplemente pedidos.id = 4761.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) Su orden · ¿está pegada a una cuenta? ───────────────────────
select p.id,
       'FCC-'||lpad(p.id::text,6,'0')                as codigo,
       p.nombre_cliente, p.email_cliente, p.rut_cliente,
       p.estado, p.metodo_pago, p.total_pagado,
       p.cliente_id,
       case when p.cliente_id is null then '❌ HUÉRFANA (por eso no la ve)'
            else '✅ pegada a una cuenta' end        as diagnostico,
       p.created_at
from public.pedidos p
where p.id = 4761;


-- ── 2) ¿Existe la cuenta con ese correo? ───────────────────────────
-- Si sale fila y el correo calza exacto, activar_socio() la habría
-- pegado — o sea que nunca llegó a correr para ella.
select c.id, c.username, c.email, c.rut, c.socio_activado_at, c.created_at
from public.clientes c
where lower(btrim(c.email)) = lower(btrim(
        (select email_cliente from public.pedidos where id = 4761)));


-- ── 3) ¿Para qué NOCHE es? (lo que el modal no muestra hoy) ────────
select ip.nombre_ticket, ip.cantidad, ip.precio_unitario,
       e.id as evento_id, e.nombre as evento, e.fecha, e.hora, e.estado
from public.items_pedido ip
left join public.eventos e on e.id = ip.evento_id
where ip.pedido_id = 4761;


-- ── 4) ⭐ ¿Pidió devolución porque le llegó CORTESÍA? ──────────────
-- Busca, para la misma persona (correo o RUT) y la misma noche, si
-- además tiene una entrada gratis. Si sale algo, la devolución no
-- corresponde: lo que sobra es la cortesía, no lo pagado.
with yo as (
  select lower(btrim(email_cliente)) as mail,
         nullif(btrim(rut_cliente),'') as rut,
         (select min(evento_id) from public.items_pedido where pedido_id = 4761) as ev
  from public.pedidos where id = 4761
)
select p.id, 'FCC-'||lpad(p.id::text,6,'0') as codigo,
       p.metodo_pago, p.referencia_pago, p.total_pagado, p.created_at,
       case when coalesce(p.total_pagado,0) = 0 or p.metodo_pago = 'cortesia'
            then '🎁 CORTESÍA' else '💵 pagada' end as tipo
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
cross join yo
where p.id <> 4761
  and ip.evento_id = yo.ev
  and ( lower(btrim(p.email_cliente)) = yo.mail
        or (yo.rut is not null and nullif(btrim(p.rut_cliente),'') = yo.rut) )
order by p.created_at;


-- ── 5) ¿A cuánta gente más le pasa lo mismo? ──────────────────────
-- Órdenes sin cuenta cuyo correo SÍ tiene cuenta creada.
select count(*)                                   as ordenes_huerfanas_recuperables,
       count(distinct lower(btrim(p.email_cliente))) as personas
from public.pedidos p
where p.cliente_id is null
  and p.estado = 'pagado'
  and exists (select 1 from public.clientes c
              where lower(btrim(c.email)) = lower(btrim(p.email_cliente)));


-- ── 6) ⭐ La regla de negocio: quién tiene PAGADA y CORTESÍA la misma noche ──
-- Este es el número que decide si vale la pena construir la regla.
select ip.evento_id, e.nombre as evento, e.fecha,
       lower(btrim(p.email_cliente))                                   as persona,
       count(*) filter (where coalesce(p.total_pagado,0) > 0)          as pagadas,
       count(*) filter (where coalesce(p.total_pagado,0) = 0)          as cortesias
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
left join public.eventos e on e.id = ip.evento_id
where p.estado = 'pagado' and coalesce(p.email_cliente,'') <> ''
group by 1,2,3,4
having count(*) filter (where coalesce(p.total_pagado,0) > 0) > 0
   and count(*) filter (where coalesce(p.total_pagado,0) = 0) > 0
order by e.fecha desc nulls last
limit 50;
