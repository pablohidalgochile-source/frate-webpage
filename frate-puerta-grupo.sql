-- ============================================================
-- FRATE — Puerta: grupo de una RESERVA / CUMPLEAÑOS desde un QR.
-- Al escanear a alguien de una lista tipo reservation/birthday, la
-- puerta abre un modal con TODO el grupo (quién entró/falta) + la ficha.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create or replace function public.puerta_grupo(p_qr text)
returns json language plpgsql security definer set search_path = public as $$
declare v json; v_ped bigint; v_lista_id bigint; v_nombre text; v_tipo text;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select ip.pedido_id into v_ped from public.items_pedido ip where ip.qr_ids ? p_qr limit 1;
  if v_ped is null then return json_build_object('grupo', false); end if;
  select li.lista_id into v_lista_id from public.lista_inscritos li where li.pedido_cortesia_id = v_ped limit 1;
  if v_lista_id is null then return json_build_object('grupo', false); end if;
  select nombre, coalesce(tipo,'guest_list') into v_nombre, v_tipo from public.listas where id = v_lista_id;
  if v_tipo not in ('birthday','reservation') then return json_build_object('grupo', false, 'tipo', v_tipo); end if;

  select json_build_object(
    'grupo', true, 'lista_id', v_lista_id, 'nombre', v_nombre, 'tipo', v_tipo,
    'ficha', case when v_tipo='birthday'
                  then (select row_to_json(b) from public.birthday_requests b where b.lista_id = v_lista_id order by b.id desc limit 1)
                  else (select row_to_json(r) from public.reservation_requests r where r.lista_id = v_lista_id order by r.id desc limit 1) end,
    'inscritos', (
      select coalesce(json_agg(row_to_json(t) order by t.entered, t.nombre), '[]'::json) from (
        select li.nombre, li.rut, li.estado,
               exists(
                 select 1 from public.qr_usados qu
                 where qu.qr_id in (select jsonb_array_elements_text(coalesce(li.qr_ids, '[]'::jsonb)))
               ) as entered
        from public.lista_inscritos li where li.lista_id = v_lista_id
      ) t)
  ) into v;
  return v;
end; $$;
grant execute on function public.puerta_grupo(text) to authenticated;

select 'puerta_grupo' as check, case when exists(select 1 from pg_proc where proname='puerta_grupo') then 'OK' else 'FALTA' end;
