-- ============================================================
-- FRATE · EL STOCK DEJA DE PERDERSE
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL PROBLEMA: `tipos_ticket.disponible` es un contador que SOLO BAJA. Se
-- descuenta al reservar y solo vuelve a subir si la compra falla en el mismo
-- instante. Cuando un carrito EXPIRA a los 30 min, el cupo se pierde para
-- siempre. Con 331 carritos caídos en julio, «Agotado» aparecía antes de tiempo
-- todas las semanas.
--
-- Verificado el 2026-08-01 · Pre-Venta GRAL. MUJER: 24 vendidas de 30 y
-- disponible en 0. Seis entradas que nadie pudo comprar.
--
-- LA SOLUCIÓN: no parchar el contador — DERIVARLO.
--     quedan = tope − vendidas − en_carro
-- Un contador que se descuadra una vez queda descuadrado para siempre.
-- Derivarlo hace el bug imposible, no menos probable.
--
-- ⚠️ LAS CORTESÍAS NO CUENTAN. Regla del dueño: son regaladas y van aparte,
--    siempre. Se muestran, pero fuera de la resta.
--
-- Idempotente.
-- ============================================================

-- ── 1) El tope: lo que nadie guardaba ──────────────────────
-- Sin esto no se puede saber si el número que muestra es real, ni auditarlo.
-- Es variable por noche, y los tipos de ticket ya son por evento, así que
-- guardarlo acá es guardarlo por noche.
alter table public.tipos_ticket add column if not exists tope int;

-- Arranque: para los que nunca se tocaron, el tope es lo que queda más lo
-- vendido. Para los descuadrados hay que ponerlo a mano — no se puede deducir.
update public.tipos_ticket t set tope = coalesce(t.disponible,0) + coalesce((
    select sum(ip.cantidad) from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id
    where ip.tipo_ticket_id = t.id and p.estado = 'pagado'
      and coalesce(p.total_pagado, p.total, 0) > 0
  ), 0)
where t.tope is null;


-- ── 2) El stock real, derivado ─────────────────────────────
create or replace function public.stock_de_ticket(p_tt int)
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select * from public.tipos_ticket where id = p_tt),
  v as (   -- VENDIDAS: pagadas de verdad. La cortesía va aparte.
    select coalesce(sum(ip.cantidad),0) n
      from public.items_pedido ip join public.pedidos p on p.id = ip.pedido_id
     where ip.tipo_ticket_id = p_tt and p.estado = 'pagado'
       and coalesce(p.total_pagado, p.total, 0) > 0
  ),
  c as (   -- CORTESÍAS: se muestran, no restan.
    select coalesce(sum(ip.cantidad),0) n
      from public.items_pedido ip join public.pedidos p on p.id = ip.pedido_id
     where ip.tipo_ticket_id = p_tt and p.estado = 'pagado'
       and coalesce(p.total_pagado, p.total, 0) = 0
  ),
  r as (   -- EN CARRO: reservas VIVAS. Las de más de 30 min dejan de contar
           -- solas — por eso el cupo ya no se pierde cuando alguien abandona.
    select coalesce(sum(ip.cantidad),0) n
      from public.items_pedido ip join public.pedidos p on p.id = ip.pedido_id
     where ip.tipo_ticket_id = p_tt and p.estado = 'pendiente'
       and p.created_at > now() - interval '30 minutes'
  )
  select jsonb_build_object(
    'tope',      t.tope,
    'vendidas',  v.n,
    'en_carro',  r.n,
    'cortesias', c.n,
    'quedan',    case when t.tope is null then null
                      else greatest(0, t.tope - v.n - r.n) end,
    'agotado',   case when t.tope is null then (coalesce(t.disponible,0) <= 0)
                      else (t.tope - v.n - r.n) <= 0 end
  ) from t, v, c, r;
$$;
grant execute on function public.stock_de_ticket(int) to authenticated, service_role;


-- ── 3) Sincronizar `disponible` con la verdad ──────────────
-- `disponible` sigue existiendo porque el checkout lo usa para el descuento
-- ATÓMICO (una sola sentencia, sin rendija entre contar y reservar). Esto lo
-- deja alineado con el cálculo derivado, de una vez y hacia adelante.
create or replace function public.stock_recalcular(p_evento_id int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; n int := 0;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;

  update public.tipos_ticket t
     set disponible = greatest(0, (public.stock_de_ticket(t.id) ->> 'quedan')::int)
   where t.tope is not null
     and (p_evento_id is null or t.evento_id = p_evento_id)
     and (public.stock_de_ticket(t.id) ->> 'quedan') is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'ajustados', n);
end; $$;
grant execute on function public.stock_recalcular(int) to authenticated;


-- ── 4) Qué está descuadrado AHORA ──────────────────────────
select t.id, t.nombre, e.nombre as evento,
       t.tope, t.disponible as dice_ahora,
       (public.stock_de_ticket(t.id) ->> 'vendidas')::int  as vendidas,
       (public.stock_de_ticket(t.id) ->> 'cortesias')::int as cortesias,
       (public.stock_de_ticket(t.id) ->> 'quedan')::int    as deberia_quedar
from public.tipos_ticket t
left join public.eventos e on e.id = t.evento_id
where t.estado = 'Activo'
  and t.tope is not null
  and t.disponible is distinct from (public.stock_de_ticket(t.id) ->> 'quedan')::int
order by ((public.stock_de_ticket(t.id) ->> 'quedan')::int - coalesce(t.disponible,0)) desc;

-- ============================================================
-- DESPUÉS DE CORRER ESTO
--   · Pon el TOPE de cada tipo en el editor. Es variable por noche.
--   · Los cupos perdidos vuelven solos: quedan = tope − vendidas − en_carro.
--   · Las cortesías se muestran aparte y nunca restan.
--   · El carrito que expira deja de contar solo, sin tener que devolver nada.
-- ============================================================
