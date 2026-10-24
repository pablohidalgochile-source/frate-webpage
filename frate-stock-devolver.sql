-- ============================================================
-- FRATE · Devolver el cupo (stock) al cancelar o reembolsar
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- El trigger fn_descontar_stock ya RESTA disponible cuando el pedido
-- pasa a 'pagado'. Esto lo extiende para SUMAR el cupo de vuelta cuando
-- un pedido que tenía stock tomado pasa a 'cancelado' o 'reembolsado'.
-- Así el asiento se libera solo y se puede revender. Idempotente/seguro.
-- ============================================================

create or replace function fn_descontar_stock()
returns trigger
language plpgsql
security definer
as $$
declare
  ip record;
  rows_afectadas int;
  nombre_tt text;
begin
  -- ── DESCONTAR cupo cuando el pedido pasa a 'pagado' ──
  if new.estado = 'pagado' and (old.estado is null or old.estado <> 'pagado') then
    for ip in
      select tipo_ticket_id, cantidad
      from items_pedido
      where pedido_id = new.id and tipo_ticket_id is not null
    loop
      update tipos_ticket
        set disponible = disponible - ip.cantidad
        where id = ip.tipo_ticket_id
          and disponible >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0 then
        select nombre into nombre_tt from tipos_ticket where id = ip.tipo_ticket_id;
        raise exception 'SIN_STOCK: % ya no tiene cupos disponibles', coalesce(nombre_tt, 'Este ticket');
      end if;
    end loop;
  end if;

  -- ── DEVOLVER cupo cuando un pedido que tenía stock tomado se cancela o reembolsa ──
  if old.estado in ('pagado','requiere_reembolso')
     and new.estado in ('cancelado','reembolsado')
     and new.estado <> old.estado then
    for ip in
      select tipo_ticket_id, cantidad
      from items_pedido
      where pedido_id = new.id and tipo_ticket_id is not null
    loop
      update tipos_ticket
        set disponible = disponible + ip.cantidad
        where id = ip.tipo_ticket_id;
    end loop;
  end if;

  return new;
end;
$$;

-- El trigger trg_descontar_stock ya existe (after update on pedidos) → solo se
-- reemplaza la función. No hay que recrear el trigger.

-- Verificar: prueba cambiar una orden pagada a 'cancelado' y mira que 'disponible' suba.
