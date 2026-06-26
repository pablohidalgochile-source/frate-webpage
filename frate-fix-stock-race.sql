-- ============================================================
-- FRATE — Fix sobreventa por condición de carrera
-- El trigger anterior usaba greatest(0, disponible - cantidad),
-- lo cual permite que 2 compras simultáneas "ganen" ambas cuando
-- solo quedaba 1 cupo (el stock queda en 0 en vez de rechazar).
-- Esta versión descuenta de forma atómica y revierte TODO el
-- pedido (incluido marcarlo pagado) si no hay stock suficiente.
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
  if new.estado = 'pagado' and (old.estado is null or old.estado <> 'pagado') then
    for ip in
      select tipo_ticket_id, cantidad
      from items_pedido
      where pedido_id = new.id and tipo_ticket_id is not null
    loop
      -- Descuento atómico: solo resta si hay stock suficiente en este instante.
      -- El WHERE disponible >= cantidad evita que dos transacciones concurrentes
      -- ambas pasen cuando solo queda 1 cupo (Postgres serializa el UPDATE por fila).
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
  return new;
end;
$$;

-- El trigger ya existe (trg_descontar_stock), solo se reemplaza la función.
-- No es necesario recrear el trigger.

-- ============================================================
-- LISTO. Ejecutar en Supabase SQL Editor.
--
-- Comportamiento esperado tras esto:
-- Si dos personas compran el último cupo casi simultáneamente,
-- una de las dos compras lanzará un error al marcar el pedido
-- como pagado. El frontend (frate-cart.js confirmPurchase) ya
-- captura ese error y muestra un toast al usuario — no se le
-- cobra ni se le entrega un ticket inválido.
-- ============================================================
