-- FRATE · COBROS 01b · rellena los cobros que ya existen (folio, servicio, tabla, link, origen, corte de devoluciones)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-01a-crm-pagos.sql
-- Idempotente: solo llena campos vacíos, nunca pisa lo que ya escribió la edge crm-pago. No toca fichas ni entradas.
-- ⚠️ Vuelve a correrlo COMPLETO apenas se despliegue la edge crm-pago nueva: los cobros que el crm-pago
--    viejo cree entre medio quedan con origen 'web' (KPI, carrito vencido, «tus entradas te esperan») y sin folio.
set lock_timeout = '5s';

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pedidos'
                  and column_name = 'origen') then raise exception 'Falta correr primero frate-cobros-01a-crm-pagos.sql'; end if;
end $$;

-- ① crm_pagos ─────────────────────────────────────────────────────────────
begin;
-- De qué tabla es ref_id y qué servicio es (cumple de formularios → cumpleanos; reserva según su tipo).
update public.crm_pagos c set
  tabla = coalesce(c.tabla, case c.tipo when 'formulario' then 'formularios' when 'reserva' then 'reservas'
                                        when 'lista' then 'listas' end),
  servicio = coalesce(c.servicio, case c.tipo
    when 'formulario' then coalesce((select case f.tipo when 'cumple' then 'cumpleanos' when 'reserva' then 'reserva' else 'otro' end
                                       from public.formularios f where f.id = c.ref_id), 'otro')
    when 'reserva' then coalesce((select case when r.tipo in ('cumpleanos','cumpleaños','cumple') then 'cumpleanos' else 'reserva' end
                                    from public.reservas r where r.id = c.ref_id), 'reserva')
    else 'otro' end)
 where c.servicio is null or (c.tabla is null and c.tipo in ('formulario','reserva','lista'));

-- Folio = PREFIJO-pedido a 6 dígitos (si el número es más largo NO se corta). Uno por pedido.
with calc as (
  select c.id, case c.servicio when 'cumpleanos' then 'CUM' when 'reserva' then 'RES' else 'SRV' end
           || '-' || lpad(c.pedido_id::text, greatest(6, length(c.pedido_id::text)), '0') as f
    from public.crm_pagos c
   where c.folio is null and c.pedido_id is not null
     and c.id = (select min(x.id) from public.crm_pagos x where x.pedido_id = c.pedido_id))
update public.crm_pagos c set folio = calc.f
  from calc
 where c.id = calc.id and not exists (select 1 from public.crm_pagos x where x.folio = calc.f);

-- Preferencia y link desde pedidos.referencia_pago 'PREF-…'.
-- El link se rescata SOLO si el cobro sigue pendiente y el pedido no está pagado (no reenviar algo ya pagado).
update public.crm_pagos c set
  preferencia_id = coalesce(c.preferencia_id, substr(p.referencia_pago, 6)),
  link = case when coalesce(c.estado, 'pendiente') = 'pendiente' and p.estado is distinct from 'pagado'
              then coalesce(c.link, 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=' || substr(p.referencia_pago, 6))
              else c.link end
  from public.pedidos p
 where p.id = c.pedido_id and p.referencia_pago like 'PREF-%'
   and (c.preferencia_id is null or (c.link is null and coalesce(c.estado, 'pendiente') = 'pendiente'
                                     and p.estado is distinct from 'pagado'));

-- ⚠️ Plata: los cobros que YA se pagaron con el webhook viejo quedan con su payment id y el monto que se le sumó a la
--    ficha. Sin esto, un aviso repetido de MP (o «sincronizar») los sumaría dos veces. El webhook viejo sumaba crm_pagos.monto.
update public.crm_pagos c set
  monto_pagado  = coalesce(c.monto_pagado, c.monto),
  pagado_via    = coalesce(c.pagado_via, 'webhook'),
  mp_payment_id = coalesce(c.mp_payment_id, (select substring(p.referencia_pago from '^MP-([0-9]+)')
                                               from public.pedidos p where p.id = c.pedido_id))
 where c.estado = 'pagado' and (c.monto_pagado is null or c.pagado_via is null
        or (c.mp_payment_id is null and exists (select 1 from public.pedidos p
                                                 where p.id = c.pedido_id and p.referencia_pago ~ '^MP-[0-9]+')));

-- ⚠️ Plata: lo devuelto ANTES (devolver-pago viejo, panel de MP) nunca se descontó de la ficha y pudo corregirse a mano.
--    Corte por pago: lo que MP devolvió hasta esa fecha la edge lo anota contado SIN tocar la ficha y avisa. Solo cobros viejos
--    sin devoluciones de la edge nueva; mientras la edge no lo use, cada corrida corre el corte a «ahora».
update public.crm_pagos c set cotejo_detalle = case when c.cotejo_detalle like '%[dev-previa-hasta:%'
    then regexp_replace(c.cotejo_detalle, '\[dev-previa-hasta:([0-9]+):[^]]*\]', '[dev-previa-hasta:\1:' || v.corte || ']', 'g')
    else concat_ws(E'\n', nullif(btrim(c.cotejo_detalle), ''), 'Lo que MercadoPago devolvió de este pago antes de los cobros nuevos '
      || 'ya está contado: no se descuenta solo de la ficha. [dev-previa-hasta:' || c.mp_payment_id || ':' || v.corte || ']') end
  from (select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as corte) v
 where c.creado_por is null and c.pedido_id is not null and c.estado in ('pagado', 'devuelto')
   and c.mp_payment_id ~ '^[0-9]+$' and coalesce(c.cotejo_detalle, '') !~ '\[dev(-reg|-previa)?:';
commit;

-- ② pedidos: marca 'crm' SOLO los que tienen fila en crm_pagos. No cambia estado → stock/ERP/candados no se mueven.
begin;
update public.pedidos p set origen = 'crm'
 where p.origen <> 'crm' and exists (select 1 from public.crm_pagos c where c.pedido_id = p.id);
commit;

-- ③ Verificación
select 'cobros con folio / total' as chequeo, (select count(folio) || ' / ' || count(*) from public.crm_pagos) as valor
union all select 'cobros por servicio', (select coalesce(string_agg(coalesce(servicio, '¿?') || ': ' || n, ' · '), '0')
                                           from (select servicio, count(*) n from public.crm_pagos group by servicio) s)
union all select 'pendientes con link rescatado', (select count(*)::text from public.crm_pagos where estado = 'pendiente' and link is not null)
union all select 'pedidos marcados origen crm', (select count(*)::text from public.pedidos where origen = 'crm')
union all select 'cobros viejos con corte de devoluciones', (select count(*)::text from public.crm_pagos where cotejo_detalle like '%[dev-previa-hasta:%')
union all select '⚠️ pagados por MercadoPago sin mp_payment_id (revisar a mano)', (select count(*)::text from public.crm_pagos
          where estado = 'pagado' and mp_payment_id is null and pedido_id is not null)
union all select '⚠️ cobro pendiente con pedido YA pagado (la ficha no se enteró)', (select count(*)::text from public.crm_pagos c
          join public.pedidos p on p.id = c.pedido_id where c.estado = 'pendiente' and p.estado = 'pagado');
