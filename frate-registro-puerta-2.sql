-- 🪪 REGISTRO POR CARNET · PARTE 2 de 2 — la función
-- Corre después de la parte 1.

-- ── 4) Registrar a quien entra por entrada general ────────────────
create or replace function public.puerta_registrar_ingreso(
  p_nombre     text,
  p_rut        text default null,
  p_nacimiento date default null,
  p_evento_id  int  default null,
  p_origen     text default 'general'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rol text; v_nom text;
  v_edad int; v_min int; v_guarda boolean; v_visitas int := 0; v_ultima date;
begin
  select rol, coalesce(nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = v_uid;
  if v_rol is null or v_rol not in ('admin','portero') then
    return jsonb_build_object('ok', false, 'error', 'Solo admin/portero');
  end if;
  if coalesce(btrim(p_nombre),'') = '' and coalesce(btrim(coalesce(p_rut,'')),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre o el RUT');
  end if;

  select coalesce(nullif(valor,'')::int, 18) into v_min
    from public.config_valores where clave = 'edad_minima';
  v_edad := public.edad_de(p_nacimiento);

  -- MENOR DE EDAD: no se registra ni entra. Solo queda el intento.
  if v_edad is not null and v_edad < coalesce(v_min, 18) then
    begin
      insert into public.ingresos_manuales(nombre, rut, fecha_nacimiento, origen,
             rechazado, motivo, evento_id, portero_id)
      values (p_nombre, nullif(btrim(coalesce(p_rut,'')),''), p_nacimiento, p_origen,
              true, 'Menor de edad ('||v_edad||')', p_evento_id, v_uid);
    exception when others then null; end;
    return jsonb_build_object('ok', false, 'error', 'menor_de_edad',
                              'edad', v_edad, 'minima', coalesce(v_min,18));
  end if;

  -- ¿Ya vino antes? Se responde SIEMPRE: es útil en la puerta y no guarda nada.
  begin
    select coalesce(visitas,0), ultima_vez::date into v_visitas, v_ultima
      from public.personas
     where nullif(btrim(coalesce(rut,'')),'') = nullif(btrim(coalesce(p_rut,'')),'')
     limit 1;
  exception when others then null; end;

  select coalesce((select lower(btrim(valor)) in ('true','1','si','sí','on')
                   from public.config_valores where clave='registro_puerta_on'), false)
    into v_guarda;

  -- El guardado en el CRM solo ocurre con el interruptor encendido.
  if v_guarda then
    begin
      perform public.personas_upsert(p_nombre, p_rut, null, null, null,
                                     'puerta_carnet', true, p_nacimiento);
    exception when others then null; end;
    begin
      insert into public.ingresos_manuales(nombre, rut, fecha_nacimiento, origen,
             rechazado, motivo, evento_id, portero_id)
      values (p_nombre, nullif(btrim(coalesce(p_rut,'')),''), p_nacimiento, p_origen,
              false, 'Entrada general · carnet', p_evento_id, v_uid);
    exception when others then null; end;
  end if;

  return jsonb_build_object('ok', true, 'edad', v_edad, 'guardado', v_guarda,
                            'visitas', v_visitas, 'ultima', v_ultima,
                            'nombre', p_nombre, 'registrado_por', v_nom);
end; $$;

revoke execute on function public.puerta_registrar_ingreso(text,text,date,int,text) from anon, public;
grant  execute on function public.puerta_registrar_ingreso(text,text,date,int,text) to authenticated;
