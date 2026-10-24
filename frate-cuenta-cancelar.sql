-- ============================================================
-- FRATE — El usuario puede BORRAR sus pedidos pendientes.
-- (compras abandonadas / no pagadas que quedan en "Mis Tickets")
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh). Idempotente.
-- ============================================================

-- Solo el dueño del pedido puede borrarlo, y solo si está pendiente/expirado.
-- NUNCA se puede borrar un pedido pagado (queda protegido).
create or replace function public.cancelar_pedido_pendiente(p_pedido_id integer) returns json
language plpgsql security definer set search_path = public as $$
declare v_estado text; v_owner uuid;
begin
  if auth.uid() is null then return json_build_object('error','Debes iniciar sesión'); end if;
  select estado, cliente_id into v_estado, v_owner from pedidos where id = p_pedido_id;
  if v_estado is null then return json_build_object('error','El pedido no existe'); end if;
  if v_owner is distinct from auth.uid() then return json_build_object('error','Ese pedido no es tuyo'); end if;
  if v_estado not in ('pendiente','expirado') then
    return json_build_object('error','Solo puedes borrar pedidos pendientes');
  end if;
  -- items_pedido tiene ON DELETE CASCADE → se borran solos
  delete from pedidos where id = p_pedido_id and cliente_id = auth.uid()
     and estado in ('pendiente','expirado');
  return json_build_object('ok', true);
end; $$;
grant execute on function public.cancelar_pedido_pendiente(integer) to authenticated;

select 'cancelar_pedido_pendiente' as check,
       case when exists(select 1 from pg_proc where proname='cancelar_pedido_pendiente') then 'OK' else 'FALTA' end;
