-- ============================================================
-- FRATE — FIX: personas triplicadas al capturar desde "Nuevo" (puerta)
-- Causa: personas_upsert dedupe por RUT o EMAIL; si el VIP no trae ninguno,
-- cada camino (RPC + trigger items_pedido + trigger qr_usados) inserta una
-- ficha NUEVA → 3 filas. Fix: agregar dedupe por NOMBRE cuando no hay rut ni
-- email (cae en la misma ficha, prefiriendo la que ya esté identificada).
-- Incluye limpieza de los duplicados que ya quedaron.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create or replace function public.personas_upsert(
  p_nombre text, p_rut text default null, p_email text default null,
  p_telefono text default null, p_instagram text default null,
  p_origen text default null, p_visita boolean default false,
  p_fecha_nacimiento date default null, p_universidad text default null,
  p_genero text default null, p_datos_extra jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rut text; v_email text; v_nom text;
begin
  v_rut   := nullif(btrim(coalesce(p_rut,'')),'');
  v_email := lower(nullif(btrim(coalesce(p_email,'')),''));
  v_nom   := nullif(btrim(coalesce(p_nombre,'')),'');
  if v_nom is null and v_rut is null and v_email is null then return; end if;

  if v_rut is not null then
    select id into v_id from public.personas where lower(rut)=lower(v_rut) limit 1;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from public.personas where lower(email)=v_email limit 1;
  end if;
  -- 🆕 Sin rut ni email: dedupe por NOMBRE (evita triplicar VIP de puerta).
  --    Prefiere una ficha ya identificada (con rut/email) para no crear otra suelta.
  if v_id is null and v_rut is null and v_email is null and v_nom is not null then
    select id into v_id from public.personas
    where lower(btrim(nombre)) = lower(v_nom)
    order by (coalesce(btrim(rut),'')<>'' or coalesce(btrim(email),'')<>'') desc, id
    limit 1;
  end if;

  if v_id is null then
    insert into public.personas(rut,nombre,email,telefono,instagram,origen,visitas,ultima_vez,
                                fecha_nacimiento,universidad,genero,datos_extra)
    values (v_rut, v_nom, v_email,
            nullif(btrim(coalesce(p_telefono,'')),''),
            nullif(btrim(coalesce(p_instagram,'')),''),
            case when p_origen is null then '{}'::text[] else array[p_origen] end,
            case when p_visita then 1 else 0 end,
            now(), p_fecha_nacimiento,
            nullif(btrim(coalesce(p_universidad,'')),''),
            nullif(btrim(coalesce(p_genero,'')),''),
            p_datos_extra);
  else
    update public.personas set
      nombre    = coalesce(v_nom, nombre),
      rut       = coalesce(rut, v_rut),
      email     = coalesce(email, v_email),
      telefono  = coalesce(telefono, nullif(btrim(coalesce(p_telefono,'')),'')),
      instagram = coalesce(instagram, nullif(btrim(coalesce(p_instagram,'')),'')),
      fecha_nacimiento = coalesce(fecha_nacimiento, p_fecha_nacimiento),
      universidad = coalesce(universidad, nullif(btrim(coalesce(p_universidad,'')),'')),
      genero    = coalesce(genero, nullif(btrim(coalesce(p_genero,'')),'')),
      datos_extra = case when p_datos_extra is null then datos_extra
                         else coalesce(datos_extra,'{}'::jsonb) || p_datos_extra end,
      origen    = case when p_origen is null or p_origen = any(origen) then origen else origen || p_origen end,
      visitas   = visitas + case when p_visita then 1 else 0 end,
      ultima_vez= now(), updated_at = now()
    where id = v_id;
  end if;
end; $$;
grant execute on function public.personas_upsert(text,text,text,text,text,text,boolean,date,text,text,jsonb) to authenticated;

-- ── LIMPIEZA (segura) de los triplicados que YA quedaron ─────
-- Borra SOLO las fichas sin rut ni email cuando existe OTRA del mismo nombre
-- que YA está identificada (tiene rut o email). Así no fusiona por error a
-- dos personas anónimas distintas que casualmente compartan nombre.
delete from public.personas p
where coalesce(btrim(p.rut),'')='' and coalesce(btrim(p.email),'')=''
  and exists (
    select 1 from public.personas q
    where q.id <> p.id
      and lower(btrim(q.nombre)) = lower(btrim(p.nombre))
      and (coalesce(btrim(q.rut),'')<>'' or coalesce(btrim(q.email),'')<>'')
  );

select 'personas_upsert dedupe por nombre' as check, 'OK' as estado,
       (select count(*) from public.personas) as total_fichas;
