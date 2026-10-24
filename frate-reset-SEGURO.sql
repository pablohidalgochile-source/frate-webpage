-- ============================================================
-- FRATE · Reset de pruebas SEGURO (reemplaza al que borraba ventas)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- El reset viejo borraba TODA orden que no estuviera 'pagado' en ese
-- instante → si una compra online estaba pendiente/acreditándose, la
-- borraba y el pago quedaba sin orden (posible ticket sin entregar).
--
-- Este reemplazo NUNCA borra:
--   • pedidos 'pagado'
--   • pedidos creados en los últimos 21 días (aunque estén pendiente/expirado)
--   • pedidos con QR ya usado en la puerta
-- Y protege formularios/listas/reservas recientes (últimos 21 días).
-- Idempotente (create or replace).
-- ============================================================

create or replace function public.admin_reset_pruebas(p_conservar_ventas boolean default true)
returns json language plpgsql security definer as $$
declare
  v_keep_ped bigint[];
  v_keep_ev  bigint[];
  v_borrados int;
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol = 'admin') then
    return json_build_object('error','Solo admin');
  end if;

  -- ── Órdenes que SE CONSERVAN (pagadas · recientes · con QR usado) ──
  select array_agg(distinct id) into v_keep_ped
  from pedidos
  where estado = 'pagado'
     or created_at > now() - interval '21 days'
     or id in (select distinct pedido_id from qr_usados where pedido_id is not null);
  v_keep_ped := coalesce(v_keep_ped, '{}');

  -- Eventos de esas órdenes también se conservan
  select array_agg(distinct evento_id) into v_keep_ev
  from items_pedido where pedido_id = any(v_keep_ped) and evento_id is not null;
  v_keep_ev := coalesce(v_keep_ev, '{}');

  -- ── Limpieza de datos NO críticos, protegiendo lo reciente (21 días) ──
  delete from mensajes      where created_at < now() - interval '21 days';
  delete from conversaciones where created_at < now() - interval '21 days'
     and id not in (select distinct conversacion_id from mensajes where conversacion_id is not null);
  delete from formularios   where created_at < now() - interval '21 days';
  delete from reservas      where created_at < now() - interval '21 days';
  delete from lista_inscritos where lista_id in (select id from listas where created_at < now() - interval '21 days');
  delete from listas        where created_at < now() - interval '21 days';
  delete from invitaciones_rrpp where created_at < now() - interval '21 days';

  -- ── Órdenes / items / QR que NO sean de las conservadas ──
  delete from qr_usados    where pedido_id is not null and pedido_id <> all(v_keep_ped);
  delete from items_pedido where pedido_id <> all(v_keep_ped);
  delete from pedidos      where id        <> all(v_keep_ped);
  get diagnostics v_borrados = row_count;

  -- Códigos / tipos / eventos que NO pertenezcan a órdenes conservadas
  delete from codigos      where evento_id is not null and evento_id <> all(v_keep_ev);
  delete from tipos_ticket where evento_id <> all(v_keep_ev);
  delete from eventos      where id        <> all(v_keep_ev);

  return json_build_object('ok', true,
    'pedidos_conservados', array_length(v_keep_ped,1),
    'pedidos_borrados',    v_borrados,
    'nota', 'Reset SEGURO: no se tocan pagadas, recientes (21d) ni con QR usado.');
end;
$$;

grant execute on function public.admin_reset_pruebas(boolean) to authenticated;

select 'admin_reset_pruebas SEGURO instalada' as estado;
