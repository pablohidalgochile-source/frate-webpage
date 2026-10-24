-- 🎫 TICKET DE DIFERENCIA · PARTE 3 de 3 — cobrar
-- Corre después de la parte 2.

-- ── Cobrar · hoy lo marca el anfitrión, mañana lo llama el POS ─────
-- Idempotente por ref_venta: si llega dos veces la misma, no cobra de nuevo.
create or replace function public.diferencia_pagar(
  p_codigo text, p_ref_venta text default null, p_monto int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nom text; d public.tickets_diferencia%rowtype;
begin
  if not public.puerta_rol_ok() then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso de puerta');
  end if;
  select coalesce(nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_nom from public.clientes where id = auth.uid();

  select * into d from public.tickets_diferencia where codigo = btrim(p_codigo);
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;
  if d.estado = 'anulado' then return jsonb_build_object('ok', false, 'error', 'anulado'); end if;
  if d.estado = 'pagado' then
    -- misma venta = misma respuesta, no cobra dos veces
    if p_ref_venta is not null and d.ref_venta is not distinct from p_ref_venta then
      return jsonb_build_object('ok', true, 'estado', 'pagado', 'codigo', d.codigo,
                                'monto', d.monto, 'qr_habilitado', d.qr_id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'ya_pagado',
                              'pagado_at', d.pagado_at, 'ref_venta', d.ref_venta);
  end if;
  -- el monto verifica, no fija
  if p_monto is not null and p_monto <> d.monto then
    return jsonb_build_object('ok', false, 'error', 'monto_no_calza', 'monto', d.monto);
  end if;

  update public.tickets_diferencia
     set estado='pagado', ref_venta=p_ref_venta, pagado_por=coalesce(v_nom,'staff'), pagado_at=now()
   where id = d.id;

  return jsonb_build_object('ok', true, 'estado', 'pagado', 'codigo', d.codigo,
                            'monto', d.monto, 'qr_habilitado', d.qr_id);
end; $$;

revoke execute on function public.diferencia_pagar(text,text,int) from anon, public;
grant  execute on function public.diferencia_pagar(text,text,int) to authenticated;
