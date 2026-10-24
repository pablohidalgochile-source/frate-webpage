-- ============================================================
-- FRATE — Fase 5b: LOYALTY de clientes frecuentes
-- Cuenta las VISITAS reales (check-ins en puerta) por RUT y deriva
-- el nivel. La web lo muestra en Mi Cuenta; el ERP lo consulta.
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

-- Umbrales configurables (Configuración → Valores)
insert into public.config_valores (clave, valor) values
  ('loyalty_frecuente', '5'),
  ('loyalty_vip',       '10')
on conflict (clave) do nothing;

-- Cuenta noches asistidas (distinct evento) donde un QR de esta persona
-- (por RUT en personas[]) fue quemado en puerta. SECURITY DEFINER.
create or replace function public.loyalty_de_rut(p_rut text) returns json
language plpgsql security definer set search_path = public as $$
declare
  limpio  text := regexp_replace(lower(coalesce(p_rut,'')), '[^0-9k]', '', 'g');
  v_vis   int := 0;
  v_ult   timestamptz;
  c_frec  int := 5;
  c_vip   int := 10;
  v_niv   text;
begin
  if length(limpio) < 7 then return json_build_object('visitas', 0, 'nivel', 'nuevo'); end if;

  select count(distinct ip.evento_id), max(qu.created_at)
    into v_vis, v_ult
  from qr_usados qu
  join items_pedido ip on ip.qr_ids ? qu.qr_id
  where exists (
    select 1 from jsonb_array_elements(coalesce(ip.personas, '[]'::jsonb)) per
    where regexp_replace(lower(coalesce(per->>'rut','')), '[^0-9k]', '', 'g') = limpio
  );

  select coalesce((select valor from config_valores where clave='loyalty_frecuente'), '5')::int into c_frec;
  select coalesce((select valor from config_valores where clave='loyalty_vip'), '10')::int into c_vip;
  v_vis := coalesce(v_vis, 0);
  v_niv := case when v_vis >= c_vip then 'vip' when v_vis >= c_frec then 'frecuente' else 'nuevo' end;

  return json_build_object(
    'visitas', v_vis,
    'ultima',  v_ult,
    'nivel',   v_niv,
    'faltan_frecuente', greatest(0, c_frec - v_vis),
    'faltan_vip',       greatest(0, c_vip - v_vis)
  );
end; $$;

-- Para el cliente logueado (usa su propio RUT)
create or replace function public.mi_loyalty() returns json
language plpgsql security definer set search_path = public as $$
declare v_rut text;
begin
  if auth.uid() is null then return json_build_object('error', 'no_auth'); end if;
  select rut into v_rut from clientes where id = auth.uid();
  if v_rut is null or length(regexp_replace(lower(v_rut),'[^0-9k]','','g')) < 7
    then return json_build_object('visitas', 0, 'nivel', 'nuevo', 'sin_rut', true); end if;
  return loyalty_de_rut(v_rut);
end; $$;

grant execute on function public.loyalty_de_rut(text) to authenticated, anon;
grant execute on function public.mi_loyalty() to authenticated;

-- Verificación
select 'rpc mi_loyalty' as check, case when exists(select 1 from pg_proc where proname='mi_loyalty') then 'OK' else 'FALTA' end
union all select 'rpc loyalty_de_rut', case when exists(select 1 from pg_proc where proname='loyalty_de_rut') then 'OK' else 'FALTA' end;
