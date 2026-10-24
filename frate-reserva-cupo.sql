-- ============================================================
-- FRATE · RESERVA DE CUPO AL COMPRAR — para que NADIE vuelva a pagar sin entrada
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- PROBLEMA: hoy el cupo se descuenta recién cuando MercadoPago confirma el pago.
-- Entre "elegí entradas" y "pagué" pasan minutos, así que varias personas pasan
-- la validación con el mismo último cupo: paga la primera y el resto queda
-- cobrado y SIN entrada (estado `requiere_reembolso`).
--
-- SOLUCIÓN: el cupo se toma AL CREAR el pedido y se suelta si no paga en 15 min.
--
-- ⚠️ TRANSICIÓN SEGURA: los pedidos que YA existen no tienen cupo reservado.
-- Por eso se agrega la marca `stock_reservado`: el trigger sigue descontando
-- como siempre en los pedidos viejos (marca false) y NO descuenta dos veces en
-- los nuevos (marca true). Se puede correr en cualquier momento, sin ventana ciega.
--
-- Escrito sobre la versión REAL del trigger que está viva en producción.
-- Idempotente.
-- ============================================================

-- ── 1) Marca: ¿este pedido ya tomó su cupo al crearse? ──
alter table public.pedidos add column if not exists stock_reservado boolean default false;


-- ── 2) Reservar / soltar cupo de forma ATÓMICA ──
-- Devuelve true solo si alcanzó a tomar el cupo. Dos compras simultáneas por el
-- último lugar: una recibe true y la otra false (nunca las dos).
create or replace function public.reservar_cupo(p_tt int, p_cant int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_cant is null or p_cant <= 0 then return true; end if;
  update public.tipos_ticket
     set disponible = disponible - p_cant
   where id = p_tt and disponible >= p_cant;
  get diagnostics n = row_count;
  return n > 0;
end; $$;

create or replace function public.liberar_cupo(p_tt int, p_cant int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cant is null or p_cant <= 0 then return; end if;
  update public.tipos_ticket set disponible = disponible + p_cant where id = p_tt;
end; $$;

-- Solo el backend (service_role) puede moverlas. Nadie desde el navegador.
revoke all on function public.reservar_cupo(int,int) from public, anon, authenticated;
revoke all on function public.liberar_cupo(int,int)  from public, anon, authenticated;


-- ── 3) Trigger de stock, actualizado ──
create or replace function public.fn_descontar_stock()
returns trigger language plpgsql as $$
declare
  ip record;
  rows_afectadas int;
  nombre_tt text;
begin
  -- ── DESCONTAR al pasar a 'pagado' ──
  -- SOLO si el pedido NO reservó su cupo al crearse (pedidos antiguos, o pedidos
  -- revividos después de expirar). Si ya lo reservó, descontar de nuevo sería
  -- cobrarle el cupo dos veces al evento.
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
  end if;

  -- ── DEVOLVER cupo ──
  -- (a) como siempre: un pedido pagado que se cancela o se reembolsa
  -- (b) NUEVO: un pedido con RESERVA que se cae (expira o se cancela sin pagar)
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
  end if;

  return new;
end; $$;


-- ── 4) Verificación ──
select 'columna stock_reservado' as chequeo,
       case when exists(select 1 from information_schema.columns
                        where table_name='pedidos' and column_name='stock_reservado')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'función reservar_cupo',
       case when exists(select 1 from pg_proc where proname='reservar_cupo') then '✅ ok' else '❌ falta' end
union all
select 'función liberar_cupo',
       case when exists(select 1 from pg_proc where proname='liberar_cupo') then '✅ ok' else '❌ falta' end
union all
select 'trigger con la guarda nueva',
       case when (select prosrc from pg_proc where proname='fn_descontar_stock') like '%stock_reservado%'
            then '✅ ok' else '❌ no se actualizó' end;

-- ============================================================
-- CÓMO QUEDA EL FLUJO:
--   1. Elige entradas → se TOMA el cupo al instante (o se le avisa "agotado"
--      ANTES de pagar, nunca después).
--   2. Tiene 15 minutos para pagar. Si paga, su lugar estaba guardado.
--   3. Si no paga en 15 min, el cupo vuelve solo a la venta.
--   4. Si un pago llega tarde (después de soltar el cupo), se comporta como
--      antes: descuenta al pagar y, si ya no hay, queda para "➕ Dar cupo".
-- ============================================================
