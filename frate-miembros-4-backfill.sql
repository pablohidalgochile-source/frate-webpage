-- FRATE · PASO 6 · candado para las reservas de miembros que ya existían
-- Proyecto WEB · SQL Editor · escribe SOLO en reservas_miembros
-- Correr DESPUÉS de anular con ✕ las reservas inválidas de la 212.
-- Se puede correr más de una vez: lo que ya tiene candado no se duplica.
set lock_timeout = '5s';

with base as (
  select ip.tipo_ticket_id, p.cliente_id, p.id as pedido_id, ip.evento_id, p.created_at,
         case when coalesce(c.extranjero, false)
              then 'X' || regexp_replace(upper(coalesce(c.rut, '')), '[^0-9A-Z]', '', 'g')
              else public.rut_limpio(c.rut) end as rut_norm
    from public.items_pedido ip
    join public.pedidos p       on p.id = ip.pedido_id
    join public.tipos_ticket tt on tt.id = ip.tipo_ticket_id
    join public.clientes c      on c.id = p.cliente_id
   where tt.solo_miembros and p.estado in ('pagado', 'pendiente') and p.cliente_id is not null
)
insert into public.reservas_miembros (tipo_ticket_id, cliente_id, rut_norm, pedido_id, evento_id)
select tipo_ticket_id, cliente_id, rut_norm, pedido_id, evento_id
  from base b
 where length(b.rut_norm) >= 6
   and not exists (select 1 from public.reservas_miembros r
                    where r.pedido_id = b.pedido_id and r.tipo_ticket_id = b.tipo_ticket_id)
 order by created_at
on conflict do nothing;

-- Lo que quedó y lo que NO pudo tomar candado (sin RUT en la cuenta o repetido)
select r.tipo_ticket_id, r.pedido_id, r.cliente_id, r.rut_norm, r.liberada_at, r.created_at
  from public.reservas_miembros r order by r.created_at;
