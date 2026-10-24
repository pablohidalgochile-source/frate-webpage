-- === activar socio · PARTE 2 de 3 ===
-- En orden. Cada parte queda entera.

-- ── 2) La activación ──
-- La llama la propia persona justo después de registrarse. Solo puede
-- activarse a SÍ MISMA: el id sale de auth.uid(), no de un parámetro.
create or replace function public.activar_socio()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v_ya timestamptz;
  v_enlazadas int := 0; v_gastado int := 0; v_credito int := 0;
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

  -- 2a) Pegarle sus compras anteriores. Por correo Y por RUT: quien compró
  --     con el correo del trabajo y se registró con el personal igual se
  --     recupera si el RUT calza.
  update public.pedidos p
     set cliente_id = v_id
   where p.cliente_id is null
     and ( lower(btrim(p.email_cliente)) = v_email
           or (v_rut is not null and nullif(btrim(p.rut_cliente),'') = v_rut) );
  get diagnostics v_enlazadas = row_count;

  select coalesce(count(*),0), coalesce(sum(coalesce(total_pagado,0)),0)
    into v_enlazadas, v_gastado
    from public.pedidos
   where cliente_id = v_id and estado = 'pagado' and coalesce(total_pagado,0) > 0;

  -- 2b) El crédito de bienvenida, UNA sola vez y solo si ya había comprado.
  if v_ya is null and v_enlazadas > 0 then
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
    'compras', v_enlazadas,
    'gastado', v_gastado,
    'credito', case when v_ya is null then v_credito else 0 end,
    'ya_estaba', v_ya is not null
  );
end; $$;
grant execute on function public.activar_socio() to authenticated;


-- ── 3) Verificación ──
select 'columna socio_activado_at' as chequeo,
       case when exists(select 1 from information_schema.columns
                        where table_name='clientes' and column_name='socio_activado_at')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'crédito de bienvenida configurado',
       coalesce((select valor from public.config_valores where clave='socio_credito_bienvenida'), '❌ falta')
union all
select 'función activar_socio',
       case when exists(select 1 from pg_proc where proname='activar_socio') then '✅ ok' else '❌ falta' end;
