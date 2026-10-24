-- ============================================================
-- FRATE · cuadrar el contador de los tramos del sábado
--
-- QUÉ PASA: los dos tramos de PREV 1 que ya vendieron dicen `disponible = 29`
-- y deberían decir 28. Cada uno partió en 30 y tiene 2 entradas PAGADAS
-- (lo confirma `stock_de_ticket`: "vendidas": 2). Falta UN descuento en cada uno,
-- y el error va hacia el lado permisivo: dejaría vender una de más por tramo.
--
-- NO corrige a ciegas: recalcula desde la verdad derivada, así que da el número
-- correcto aunque entren más ventas entre que lees esto y lo corres.
--
--   disponible = cupo_inicial − pagadas − pendientes_que_tienen_cupo_tomado
--
-- El cupo inicial sale del brief y está fijo por tramo; va en la tabla de abajo
-- para no depender de ninguna columna que hoy esté mal.
-- ============================================================

begin;

update public.tipos_ticket t
   set disponible = greatest(0, c.inicial
       - coalesce((select sum(i.cantidad) from public.items_pedido i
                    join public.pedidos p on p.id = i.pedido_id
                   where i.tipo_ticket_id = t.id and p.estado = 'pagado'), 0)
       - coalesce((select sum(i.cantidad) from public.items_pedido i
                    join public.pedidos p on p.id = i.pedido_id
                   where i.tipo_ticket_id = t.id
                     and p.estado = 'pendiente' and p.stock_reservado is true), 0))
  from (values
    ('TK-FCC-2026-10-31-prev-1-mujer',30),          ('TK-FCC-2026-10-31-prev-1-universitario',30),
    ('TK-FCC-2026-10-31-prev-1-hombre',30),         ('TK-FCC-2026-10-31-prev-2-mujer',60),
    ('TK-FCC-2026-10-31-prev-2-universitario',30),  ('TK-FCC-2026-10-31-prev-2-hombre',30),
    ('TK-FCC-2026-10-31-prev-3-mujer',60),          ('TK-FCC-2026-10-31-prev-3-universitario',60),
    ('TK-FCC-2026-10-31-prev-3-hombre',30),         ('TK-FCC-2026-10-31-prev-4-mujer',180),
    ('TK-FCC-2026-10-31-prev-4-universitario',90),  ('TK-FCC-2026-10-31-prev-4-hombre',30)
  ) as c(uid, inicial)
 where t.ticket_uid = c.uid;

commit;

-- Control: los dos que vendieron tienen que quedar en 28, el resto en su cupo.
select t.nombre, t.disponible,
       (public.stock_de_ticket(t.id) ->> 'vendidas')::int as pagadas
  from public.tipos_ticket t
 where t.evento_id = 61 and t.venta_desde is not null
 order by t.venta_desde, t.precio;
