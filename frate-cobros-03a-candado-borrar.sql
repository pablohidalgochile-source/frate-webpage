-- FRATE · COBROS 03a · candado: un cobro de servicio NO se borra desde «Mis compras»
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-01a/01b.
-- Idempotente. No toca ninguna tabla: solo tres funciones. Las entradas no cambian en nada.
--
-- QUÉ ARREGLA: la orden de un cobro (pedidos.origen='crm', sin ítems) se le pega a la cuenta
-- del cliente y salía en la portada como «Pedido #N» con 🗑️ Borrar. Al borrarla, la fila de
-- pedidos desaparece, crm_pagos.pedido_id queda en null (on delete set null) y el link de
-- MercadoPago sigue vivo: plata que entra sin ficha a la cual pegarla.
--
-- Reversa: correr de nuevo frate-cuenta-cancelar.sql (la versión anterior de la función) y
--   drop function if exists public.mis_cobros_servicio(); drop function if exists public.es_cobro_servicio(integer);

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'pedidos' and column_name = 'origen')
  then raise exception 'Falta correr primero frate-cobros-01a-crm-pagos.sql'; end if;
end $$;

-- ① ¿Esta orden es un cobro de servicio? Por `origen`, y de refuerzo por la fila de crm_pagos
--    (igual que devolver-pago): un cobro viejo cuyo pedido quedó con origen 'web' también cuenta.
create or replace function public.es_cobro_servicio(p_pedido_id integer)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.origen = 'crm' from public.pedidos p where p.id = p_pedido_id), false)
      or exists (select 1 from public.crm_pagos c where c.pedido_id = p_pedido_id);
$$;
--    SIN grant a nadie: es definer, no mira auth.uid() y recibe un id cualquiera, así que con
--    `authenticated` bastaba barrer ids desde la consola para saber qué órdenes son cumpleaños.
--    Sus dos usuarios (cancelar_pedido_pendiente y el trigger del 03b) también son definer.
revoke execute on function public.es_cobro_servicio(integer) from anon, authenticated, public;

-- ② Borrar un pedido pendiente: igual que antes, pero un cobro de servicio queda fuera.
--    El chequeo va DESPUÉS del de dueño, a propósito: así no se delata cuáles órdenes son cobros.
create or replace function public.cancelar_pedido_pendiente(p_pedido_id integer) returns json
language plpgsql security definer set search_path = public as $$
declare v_estado text; v_owner uuid;
begin
  if auth.uid() is null then return json_build_object('error','Debes iniciar sesión'); end if;
  select estado, cliente_id into v_estado, v_owner from pedidos where id = p_pedido_id;
  if v_estado is null then return json_build_object('error','El pedido no existe'); end if;
  if v_owner is distinct from auth.uid() then return json_build_object('error','Ese pedido no es tuyo'); end if;
  if public.es_cobro_servicio(p_pedido_id) then
    return json_build_object('error','Este es un pago de un servicio: escríbenos y lo vemos contigo.',
                             'code','ES_COBRO_SERVICIO');
  end if;
  if v_estado not in ('pendiente','expirado') then
    return json_build_object('error','Solo puedes borrar pedidos pendientes');
  end if;
  -- items_pedido tiene ON DELETE CASCADE → se borran solos
  delete from pedidos where id = p_pedido_id and cliente_id = auth.uid()
     and estado in ('pendiente','expirado');
  return json_build_object('ok', true);
end; $$;
grant execute on function public.cancelar_pedido_pendiente(integer) to authenticated;

-- ③ El nombre real del cobro para la portada («Cumpleaños FRATE», «Reserva FRATE»…).
--    crm_pagos no la puede leer el cliente (RLS solo staff) y no hay que abrirla: esta función
--    devuelve SOLO folio/servicio/concepto de las órdenes que ya están pegadas a su cuenta.
create or replace function public.mis_cobros_servicio()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid(); v jsonb;
begin
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Sin sesión'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_id', p.id, 'folio', c.folio, 'servicio', c.servicio, 'concepto', c.concepto)), '[]'::jsonb)
    into v
    from public.pedidos p
    join lateral (select x.folio, x.servicio, x.concepto from public.crm_pagos x
                   where x.pedido_id = p.id order by x.id desc limit 1) c on true
   where p.cliente_id = v_id;
  return jsonb_build_object('ok', true, 'cobros', v);
end; $$;
revoke execute on function public.mis_cobros_servicio() from anon, public;
grant  execute on function public.mis_cobros_servicio() to authenticated;

notify pgrst, 'reload schema';

-- ④ Verificación
select 'función es_cobro_servicio' as chequeo,
       case when exists(select 1 from pg_proc where proname = 'es_cobro_servicio') then 'OK' else 'FALTA' end as valor
union all
select 'cancelar_pedido_pendiente con candado',
       case when exists(select 1 from pg_proc where proname = 'cancelar_pedido_pendiente'
                          and prosrc like '%es_cobro_servicio%') then 'OK' else 'FALTA' end
union all
select 'función mis_cobros_servicio',
       case when exists(select 1 from pg_proc where proname = 'mis_cobros_servicio') then 'OK' else 'FALTA' end
union all
select 'cobros pegados hoy a una cuenta (los ve el cliente en «Mis compras»)',
       (select count(*)::text from public.pedidos p where p.cliente_id is not null and public.es_cobro_servicio(p.id));
