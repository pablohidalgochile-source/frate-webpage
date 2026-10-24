-- FRATE · COBROS 03c · activar_socio deja de pegarle los cobros de servicio a la cuenta
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-01a. Idempotente.
-- Es la función que está VIVA hoy (frate-lealtad-interruptor-2.sql, 5-ago 06:53) con DOS
-- condiciones nuevas en el enganche (marcadas ⭐). Nada más cambia.
-- ⚠️ NO partir de frate-activar-socio-2.sql (media hora más vieja): esa no mira lealtad_activa()
--    y correrla volvería a repartir el bono de bienvenida, que está CONGELADO. Acá se conservan
--    v_on, el `if v_on and ...` y 'lealtad_on'. Confirma cuál está viva antes de pegar esto:
--      select pg_get_functiondef('public.activar_socio()'::regprocedure);
--    Tiene que aparecer `v_on boolean := public.lealtad_activa()`. Si no aparece, NO lo corras.
-- QUÉ CAMBIA: se le siguen pegando TODAS sus compras de entradas (por correo y por RUT). Ya no se
-- pega la orden de un cobro: no tiene QR, y pegada sumaba al «gastado» del Wrapped y al conteo del
-- bono. El cumpleaños igual lo ve en «Mis reservas». Los que YA quedaron pegados no se tocan acá:
-- eso va en frate-cobros-03d (escrito, sin ejecutar). Reversa: correr frate-lealtad-interruptor-2.sql.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'pedidos' and column_name = 'origen')
  then raise exception 'Falta correr primero frate-cobros-01a-crm-pagos.sql'; end if;
  if not exists (select 1 from pg_proc where proname = 'lealtad_activa')
  then raise exception 'Falta el interruptor: corre frate-lealtad-interruptor-1.sql'; end if;
end $$;

create or replace function public.activar_socio()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v_ya timestamptz;
  v_enlazadas int := 0; v_gastado int := 0; v_credito int := 0;
  v_on boolean := public.lealtad_activa();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  select lower(btrim(email)), nullif(btrim(rut),''), socio_activado_at
    into v_email, v_rut, v_ya
    from public.clientes where id = v_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Esta cuenta no tiene correo');
  end if;

  -- Sus compras anteriores, por correo Y por RUT. Esto corre siempre.
  -- ⭐ LO ÚNICO NUEVO: los cobros de servicio quedan fuera, por las dos señales que mira
  --    devolver-pago: `origen` y la fila de crm_pagos (un cobro viejo pudo quedar en 'web').
  update public.pedidos p
     set cliente_id = v_id
   where p.cliente_id is null
     and coalesce(p.origen, 'web') <> 'crm'
     and not exists (select 1 from public.crm_pagos c where c.pedido_id = p.id)
     and ( lower(btrim(p.email_cliente)) = v_email
           or (v_rut is not null and nullif(btrim(p.rut_cliente),'') = v_rut) );

  select coalesce(count(*),0), coalesce(sum(coalesce(total_pagado,0)),0)
    into v_enlazadas, v_gastado
    from public.pedidos
   where cliente_id = v_id and estado = 'pagado' and coalesce(total_pagado,0) > 0;

  -- El crédito: UNA sola vez, solo si ya había comprado, y solo con la lealtad encendida.
  if v_on and v_ya is null and v_enlazadas > 0 then
    select coalesce(nullif(valor,'')::int, 0) into v_credito
      from public.config_valores where clave='socio_credito_bienvenida';
    if v_credito > 0 then
      update public.clientes
         set credito = coalesce(credito,0) + v_credito,
             socio_activado_at = now()
       where id = v_id;
      begin
        insert into public.movimientos(cliente_id, tipo, monto, concepto)
        values (v_id, 'credito', v_credito, 'Bienvenida · ya eras cliente');
      exception when others then null; end;
    else
      update public.clientes set socio_activado_at = now() where id = v_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lealtad_on', v_on,
    'compras', v_enlazadas,
    'gastado', v_gastado,
    'credito', case when v_on and v_ya is null then v_credito else 0 end,
    'ya_estaba', v_ya is not null
  );
end; $$;
grant execute on function public.activar_socio() to authenticated;

select case when prosrc like '%lealtad_activa%' then 'OK' else '⛔ REVISAR: pisaste el interruptor' end as lealtad,
       case when prosrc like '%crm_pagos%'      then 'OK' else 'FALTA' end as cobros_fuera
  from pg_proc where proname = 'activar_socio';
