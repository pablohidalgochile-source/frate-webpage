-- ============================================================
-- FRATE — Reseteo de PRUEBAS + borrar evento en cascada
-- Etapa de pruebas: poder vaciar el sistema. Por defecto CONSERVA
-- las ventas reales (MercadoPago pagadas) y sus eventos; borra todo
-- lo demás (cortesías, listas, formularios, chats, reservas...).
--
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- Ambas funciones son SOLO admin.
-- ============================================================

-- 1) Borrar UN evento en cascada (soluciona el error de llave foránea)
create or replace function public.admin_borrar_evento(p_id int) returns json
language plpgsql security definer set search_path = public as $$
declare v_peds int[];
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol = 'admin') then
    return json_build_object('error','Solo admin');
  end if;
  select array_agg(distinct pedido_id) into v_peds from items_pedido where evento_id = p_id;
  delete from qr_usados       where pedido_id = any(coalesce(v_peds,'{}'));
  delete from lista_inscritos where lista_id in (select id from listas where evento_id = p_id);
  delete from invitaciones_rrpp where evento_id = p_id;
  delete from reservas        where evento_id = p_id;
  delete from items_pedido    where evento_id = p_id;
  delete from pedidos p where p.id = any(coalesce(v_peds,'{}')) and not exists (select 1 from items_pedido ip where ip.pedido_id = p.id);
  delete from listas          where evento_id = p_id;
  delete from codigos         where evento_id = p_id;
  delete from tipos_ticket    where evento_id = p_id;
  delete from eventos         where id = p_id;
  return json_build_object('ok', true, 'evento_id', p_id);
end; $$;
grant execute on function public.admin_borrar_evento(int) to authenticated;

-- 2) Reseteo de PRUEBAS. p_conservar_ventas=true → deja las ventas reales
--    (MercadoPago pagadas) y los eventos de esas ventas; borra el resto.
--    p_conservar_ventas=false → limpia TODO lo transaccional (slate limpio).
create or replace function public.admin_reset_pruebas(p_conservar_ventas boolean default true) returns json
language plpgsql security definer set search_path = public as $$
declare v_keep_ped int[]; v_keep_ev int[];
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol = 'admin') then
    return json_build_object('error','Solo admin');
  end if;

  if p_conservar_ventas then
    select array_agg(id) into v_keep_ped from pedidos
      where estado = 'pagado' and coalesce(metodo_pago,'') <> 'cortesia' and coalesce(total,0) > 0;
  else
    v_keep_ped := '{}';
  end if;
  v_keep_ped := coalesce(v_keep_ped, '{}');
  select array_agg(distinct evento_id) into v_keep_ev from items_pedido
    where pedido_id = any(v_keep_ped) and evento_id is not null;
  v_keep_ev := coalesce(v_keep_ev, '{}');

  -- Chats, formularios, listas, invitaciones, reservas: SIEMPRE se limpian (son de prueba)
  delete from mensajes;                delete from conversaciones;
  delete from formularios;
  delete from lista_inscritos;         delete from listas;
  delete from invitaciones_rrpp;       delete from reservas;

  -- QR usados / items / pedidos que NO sean de ventas conservadas
  delete from qr_usados    where pedido_id <> all(v_keep_ped);
  delete from items_pedido where pedido_id <> all(v_keep_ped);
  delete from pedidos      where id        <> all(v_keep_ped);

  -- Códigos / tipos / eventos que NO pertenezcan a ventas conservadas
  delete from codigos      where evento_id is not null and evento_id <> all(v_keep_ev);
  delete from tipos_ticket where evento_id <> all(v_keep_ev);
  delete from eventos      where id        <> all(v_keep_ev);

  return json_build_object('ok', true, 'conservo_ventas', p_conservar_ventas,
                           'pedidos_conservados', coalesce(array_length(v_keep_ped,1),0),
                           'eventos_conservados',  coalesce(array_length(v_keep_ev,1),0));
end; $$;
grant execute on function public.admin_reset_pruebas(boolean) to authenticated;

select 'admin_borrar_evento'  as check, case when exists(select 1 from pg_proc where proname='admin_borrar_evento')  then 'OK' else 'FALTA' end
union all
select 'admin_reset_pruebas',        case when exists(select 1 from pg_proc where proname='admin_reset_pruebas')        then 'OK' else 'FALTA' end;
