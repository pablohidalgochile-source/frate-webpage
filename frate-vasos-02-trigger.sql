-- frate-vasos-02-trigger.sql   ·   17-oct-2026   ·   PARTE 2 de 2
--
-- ⚠️ ESTE ARCHIVO TOCA EL TRIGGER QUE CORRE EN CADA PAGO. No correrlo con un
--    evento en vivo: esperar a que cierre la noche.
--
-- Agrega a fn_descontar_stock los dos bloques del extra, calcados de los de
-- entradas: descuenta al pagar (si no se reservo antes) y DEVUELVE el cupo si el
-- pedido se cancela, se reembolsa o expira. Lo de entradas queda intacto.

create or replace function public.fn_descontar_stock()
returns trigger language plpgsql
as $function$
declare
  ip record;
  rows_afectadas int;
  nombre_tt text;
begin
  if new.estado = 'pagado'
     and (old.estado is null or old.estado <> 'pagado')
     and not coalesce(new.stock_reservado, false) then
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
    -- 🥤 Extras con cupo. Los que tienen stock NULL (los de siempre) ni se tocan.
    for ip in
      select (producto_id)::int as addon_id, cantidad
      from items_pedido
      where pedido_id = new.id and producto_tipo = 'addon'
        and producto_id ~ '^[0-9]+$'
    loop
      update addons set stock = stock - ip.cantidad
        where id = ip.addon_id and stock is not null and stock >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0
         and exists (select 1 from addons a where a.id = ip.addon_id and a.stock is not null) then
        select nombre into nombre_tt from addons where id = ip.addon_id;
        raise exception 'SIN_STOCK: ya no quedan % disponibles', coalesce(nombre_tt, 'ese extra');
      end if;
    end loop;
  end if;

  if new.estado <> old.estado
     and old.estado in ('pendiente','pagado','requiere_reembolso')
     and new.estado in ('cancelado','reembolsado','expirado')
     and ( old.estado in ('pagado','requiere_reembolso')
           or coalesce(old.stock_reservado, false) ) then
    for ip in
      select tipo_ticket_id, cantidad
      from items_pedido
      where pedido_id = new.id and tipo_ticket_id is not null
    loop
      update tipos_ticket
        set disponible = disponible + ip.cantidad
        where id = ip.tipo_ticket_id;
    end loop;
    -- 🥤 El vaso tambien vuelve a la bolsa.
    for ip in
      select (producto_id)::int as addon_id, cantidad
      from items_pedido
      where pedido_id = new.id and producto_tipo = 'addon'
        and producto_id ~ '^[0-9]+$'
    loop
      update addons set stock = stock + ip.cantidad
        where id = ip.addon_id and stock is not null;
    end loop;
  end if;

  return new;
end; $function$;
