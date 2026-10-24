-- === interruptor de lealtad · PARTE 2 de 3 ===
-- En orden. Arranca APAGADO.

-- ── 2) El crédito de bienvenida respeta el interruptor ─────────────
-- Con la lealtad apagada NO se abona plata. El enlace del historial SÍ
-- se hace igual: es higiene de datos, no un regalo, y sirve para que
-- cuando enciendas ya tengas a la gente reconocida y con sus compras
-- pegadas. `socio_activado_at` tampoco se marca, así que al encender el
-- interruptor esa persona recibe su bono como corresponde.
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
  update public.pedidos p
     set cliente_id = v_id
   where p.cliente_id is null
     and ( lower(btrim(p.email_cliente)) = v_email
           or (v_rut is not null and nullif(btrim(p.rut_cliente),'') = v_rut) );

  select coalesce(count(*),0), coalesce(sum(coalesce(total_pagado,0)),0)
    into v_enlazadas, v_gastado
    from public.pedidos
   where cliente_id = v_id and estado = 'pagado' and coalesce(total_pagado,0) > 0;

  -- El crédito: UNA sola vez, solo si ya había comprado, y solo con la
  -- lealtad encendida.
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
