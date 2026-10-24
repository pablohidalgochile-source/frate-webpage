-- FRATE · PASO 5 · el candado se suelta solo al anular, expirar, devolver o borrar
-- Proyecto WEB · SQL Editor · toca SOLO pedidos (agrega 2 triggers AFTER)
-- ⚠️ Correr en un momento tranquilo (toma un lock corto sobre pedidos).
-- Si algo del candado falla, NUNCA frena el cambio de estado del pedido
-- (un pago que llega queda pagado igual): solo deja un aviso en el log.
-- Reversa: drop trigger if exists trg_reservas_miembros_estado on public.pedidos;
--          drop trigger if exists trg_reservas_miembros_borrado on public.pedidos;
set lock_timeout = '5s';

create or replace function public.tg_reservas_miembros_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      update public.reservas_miembros set liberada_at = now(), liberada_por = 'pedido borrado'
       where pedido_id = old.id and liberada_at is null;
      return old;
    end if;
    if new.estado in ('pagado', 'pendiente') then
      -- Revivió (p. ej. pago que llegó tarde): retoma su candado si nadie lo tomó.
      update public.reservas_miembros r set liberada_at = null, liberada_por = null
       where r.pedido_id = new.id and r.liberada_at is not null
         and not exists (select 1 from public.reservas_miembros o
                          where o.liberada_at is null and o.id <> r.id and o.tipo_ticket_id = r.tipo_ticket_id
                            and (o.cliente_id = r.cliente_id or o.rut_norm = r.rut_norm));
      update public.reservas_miembros set conflicto_at = now()
       where pedido_id = new.id and liberada_at is not null and conflicto_at is null;
    else
      update public.reservas_miembros set liberada_at = now(), liberada_por = 'estado:' || coalesce(new.estado, '')
       where pedido_id = new.id and liberada_at is null;
    end if;
  exception when others then
    raise warning '[reservas_miembros] pedido %: %', coalesce(new.id, old.id), sqlerrm;
  end;
  return coalesce(new, old);
end $$;

create or replace trigger trg_reservas_miembros_estado
  after update of estado on public.pedidos
  for each row when (old.estado is distinct from new.estado)
  execute function public.tg_reservas_miembros_pedido();

create or replace trigger trg_reservas_miembros_borrado
  after delete on public.pedidos
  for each row execute function public.tg_reservas_miembros_pedido();

select tgname from pg_trigger where tgrelid = 'public.pedidos'::regclass and tgname like 'trg_reservas_miembros%';
