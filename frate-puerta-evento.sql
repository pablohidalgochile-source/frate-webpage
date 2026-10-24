-- ============================================================
-- FRATE — Candado por evento en la puerta (con override)
-- El QR queda amarrado a SU evento: puerta_quemar_qr rechaza quemar
-- un QR de otro evento... salvo que el portero FUERCE el ingreso
-- (p_forzar=true) para casos legítimos (compró para otro día).
-- El forzado queda registrado en qr_usados.gate_id = 'FORZADO-otro-evento'.
--
-- Overload de 3 argumentos (convive con el de 1 arg → retrocompatible).
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

create or replace function public.puerta_quemar_qr(p_qr text, p_evento int, p_forzar boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item   items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_otro   boolean := false;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;

  v_otro := (p_evento is not null and v_item.evento_id is not null and v_item.evento_id <> p_evento);
  -- Candado por evento: si es de otro evento y NO se fuerza → no se quema.
  if v_otro and not p_forzar then
    return json_build_object('ok', false, 'otro_evento', true, 'evento_id', v_item.evento_id,
                             'nombre_evento', v_item.nombre_evento, 'motivo', 'Esta entrada es de OTRO evento');
  end if;

  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then return json_build_object('ok', false, 'motivo', 'Pedido no pagado'); end if;
  if exists (select 1 from qr_usados where qr_id = p_qr) then
    return json_build_object('ok', false, 'motivo', 'Ya fue escaneado');
  end if;

  -- Registrar (si se forzó un ingreso de otro evento, queda marcado en gate_id).
  begin
    insert into qr_usados (qr_id, pedido_id, escaneado_por, gate_id)
    values (p_qr, v_pedido.id, auth.uid(), case when v_otro then 'FORZADO-otro-evento' else null end);
  exception when undefined_column then       -- si aún no existe qr_usados.gate_id
    insert into qr_usados (qr_id, pedido_id, escaneado_por) values (p_qr, v_pedido.id, auth.uid());
  end;
  return json_build_object('ok', true, 'forzado', v_otro and p_forzar);
end; $$;
grant execute on function public.puerta_quemar_qr(text, int, boolean) to authenticated;

select 'puerta_quemar_qr(text,int,boolean)' as check,
       case when exists(select 1 from pg_proc where proname='puerta_quemar_qr' and pronargs=3) then 'OK' else 'FALTA' end;
