-- ============================================================
-- FRATE — Trigger de stock COMPLETO (entradas + tiendita)
-- Reemplaza a frate-fix-stock-race.sql. Descuenta de forma atómica
-- tanto el stock de tipos_ticket como el de tiendita (merch) cuando
-- un pedido pasa a 'pagado'. La carta (tragos) es ilimitada → no se toca.
--
-- Idempotente: CREATE OR REPLACE. Correr en Supabase SQL Editor.
-- ============================================================

create or replace function fn_descontar_stock()
returns trigger
language plpgsql
security definer
as $$
declare
  ip record;
  rows_afectadas int;
  nombre_x text;
begin
  if new.estado = 'pagado' and (old.estado is null or old.estado <> 'pagado') then

    -- ── ENTRADAS (tipos_ticket) ──────────────────────────────
    for ip in
      select tipo_ticket_id, cantidad from items_pedido
      where pedido_id = new.id and tipo_ticket_id is not null
    loop
      update tipos_ticket
        set disponible = disponible - ip.cantidad
        where id = ip.tipo_ticket_id and disponible >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0 then
        select nombre into nombre_x from tipos_ticket where id = ip.tipo_ticket_id;
        raise exception 'SIN_STOCK: % ya no tiene cupos disponibles', coalesce(nombre_x, 'Este ticket');
      end if;
    end loop;

    -- ── MERCH (tiendita) ─────────────────────────────────────
    for ip in
      select producto_id, cantidad from items_pedido
      where pedido_id = new.id and producto_tipo = 'merch' and producto_id is not null
    loop
      update tiendita
        set stock = stock - ip.cantidad
        where id = ip.producto_id and stock >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0 then
        select nombre into nombre_x from tiendita where id = ip.producto_id;
        raise exception 'SIN_STOCK: % sin stock disponible', coalesce(nombre_x, 'Este producto');
      end if;
    end loop;

  end if;
  return new;
end;
$$;

-- El trigger ya existe (trg_descontar_stock); esto solo reemplaza la función.
-- Si nunca lo creaste, descomenta:
-- drop trigger if exists trg_descontar_stock on pedidos;
-- create trigger trg_descontar_stock after update on pedidos
--   for each row execute function fn_descontar_stock();

-- ============================================================
-- LISTO. Este SQL reemplaza a frate-fix-stock-race.sql.
-- Corre SOLO este (cubre entradas + tiendita, anti-sobreventa).
-- ============================================================
