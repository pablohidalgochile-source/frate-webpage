-- 🎫 TICKET DE DIFERENCIA · PARTE 2 de 3 — emitir
-- Corre después de la parte 1.

-- ── Emitir · lo hace el anfitrión en la puerta ─────────────────────
create or replace function public.diferencia_emitir(
  p_qr       text,
  p_motivo   text,
  p_monto    int,
  p_destino  text default null,
  p_nota     text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nom text; v_item items_pedido%rowtype; v_ped pedidos%rowtype;
  v_idx int; v_per json; v_cod text; v_ev record; v_id bigint;
begin
  if not public.puerta_rol_ok() then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso de puerta');
  end if;
  if coalesce(p_monto,0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'El monto tiene que ser mayor que cero');
  end if;

  select coalesce(nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''),
                  nullif('@'||username,'@'), email)
    into v_nom from public.clientes where id = auth.uid();

  select * into v_item from public.items_pedido where qr_ids ? p_qr limit 1;
  if v_item.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese QR no existe');
  end if;
  select * into v_ped from public.pedidos where id = v_item.pedido_id;

  if exists (select 1 from public.tickets_diferencia
              where qr_id = p_qr and estado = 'pendiente') then
    return jsonb_build_object('ok', false, 'error', 'Ese ticket ya tiene un cobro pendiente');
  end if;

  select i-1 into v_idx from jsonb_array_elements_text(v_item.qr_ids)
    with ordinality t(qr, i) where t.qr = p_qr;
  v_per := coalesce(v_item.personas -> v_idx, 'null'::jsonb)::json;

  select e.id, e.nombre, e.fecha, e.hora_termino into v_ev
    from public.eventos e where e.id = v_item.evento_id;

  v_cod := public.diferencia_codigo();

  insert into public.tickets_diferencia(
    codigo, pedido_id, qr_id, persona, rut, evento_id, motivo,
    ticket_actual, precio_actual, ticket_destino, monto, nota,
    emitido_por, emitido_por_id, vence_at)
  values (
    v_cod, v_ped.id, p_qr,
    coalesce(v_per->>'nombre', v_ped.nombre_cliente),
    v_per->>'rut', v_item.evento_id, p_motivo,
    v_item.nombre_ticket, v_item.precio_unitario, p_destino, p_monto, p_nota,
    coalesce(v_nom,'staff'), auth.uid(),
    (coalesce(v_ev.fecha, current_date) + 1)::timestamptz
      + coalesce(v_ev.hora_termino, '05:00')::time)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_cod,
    'monto', p_monto, 'persona', coalesce(v_per->>'nombre', v_ped.nombre_cliente),
    'evento', v_ev.nombre, 'emitido_por', v_nom);
end; $$;

revoke execute on function public.diferencia_emitir(text,text,int,text,text) from anon, public;
grant  execute on function public.diferencia_emitir(text,text,int,text,text) to authenticated;
