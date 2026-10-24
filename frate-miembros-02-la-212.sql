-- FRATE · PASO 2 · quién reservó las cortesías del evento 42 (SOLO LECTURA)
-- Proyecto WEB · SQL Editor · copiar el resultado
with tt as (
  select id, nombre, genero, precio, estado, disponible, solo_miembros, uno_por_persona, max_por_compra, catalogo_id
    from public.tipos_ticket where evento_id = 42
), r as (
  select ip.tipo_ticket_id, p.id as pedido_id, p.estado, p.created_at, p.cliente_id,
         c.username, c.email, c.nombres, c.apellidos,
         public.rut_limpio(c.rut) as rut_cuenta,
         public.rut_limpio(coalesce(to_jsonb(ip) -> 'personas' -> 0 ->> 'rut', to_jsonb(ip) ->> 'rut_asistente')) as rut_ticket,
         to_jsonb(ip) -> 'personas' -> 0 ->> 'nombre' as nombre_ticket,
         to_jsonb(p) ->> 'nombre_cliente' as nombre_comprador,
         to_jsonb(p) ->> 'email_cliente' as email_comprador
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id
    left join public.clientes c on c.id = p.cliente_id
   where ip.tipo_ticket_id in (select id from tt)
)
select 'tickets del evento 42' seccion, (select jsonb_agg(to_jsonb(tt) order by id) from tt) v
union all
select 'pedidos de esos tickets (todos los estados)', (select jsonb_agg(to_jsonb(r) order by created_at) from r);
