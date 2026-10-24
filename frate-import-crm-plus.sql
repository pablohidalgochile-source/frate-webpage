-- ============================================================
-- FRATE — Importador enriquecido para el CRM
-- El importador ya captura instagram/universidad/nacimiento/género/
-- dirección, pero (a) faltaba la columna instagram + un cajón
-- datos_extra en lista_inscritos, y (b) el CRM personas no recibía
-- esos datos. Esto lo cierra. Correr en el Supabase de la WEB.
-- Idempotente.
-- ============================================================

-- 1) lista_inscritos: instagram + cajón JSON para TODO lo demás
alter table public.lista_inscritos add column if not exists instagram   text;
alter table public.lista_inscritos add column if not exists datos_extra jsonb;

-- 2) personas (CRM): campos ricos + cajón JSON
alter table public.personas add column if not exists fecha_nacimiento date;
alter table public.personas add column if not exists universidad      text;
alter table public.personas add column if not exists genero           text;
alter table public.personas add column if not exists datos_extra      jsonb;

-- 3) personas_upsert ampliado (nuevos parámetros al final, con defaults → no rompe llamadas viejas)
create or replace function public.personas_upsert(
  p_nombre text, p_rut text default null, p_email text default null,
  p_telefono text default null, p_instagram text default null,
  p_origen text default null, p_visita boolean default false,
  p_fecha_nacimiento date default null, p_universidad text default null,
  p_genero text default null, p_datos_extra jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rut text; v_email text;
begin
  v_rut   := nullif(btrim(coalesce(p_rut,'')),'');
  v_email := lower(nullif(btrim(coalesce(p_email,'')),''));
  if coalesce(btrim(p_nombre),'')='' and v_rut is null and v_email is null then return; end if;

  if v_rut is not null then
    select id into v_id from public.personas where lower(rut)=lower(v_rut) limit 1;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from public.personas where lower(email)=v_email limit 1;
  end if;

  if v_id is null then
    insert into public.personas(rut,nombre,email,telefono,instagram,origen,visitas,ultima_vez,
                                fecha_nacimiento,universidad,genero,datos_extra)
    values (v_rut,
            nullif(btrim(coalesce(p_nombre,'')),''),
            v_email,
            nullif(btrim(coalesce(p_telefono,'')),''),
            nullif(btrim(coalesce(p_instagram,'')),''),
            case when p_origen is null then '{}'::text[] else array[p_origen] end,
            case when p_visita then 1 else 0 end,
            now(),
            p_fecha_nacimiento,
            nullif(btrim(coalesce(p_universidad,'')),''),
            nullif(btrim(coalesce(p_genero,'')),''),
            p_datos_extra);
  else
    update public.personas set
      nombre    = coalesce(nullif(btrim(coalesce(p_nombre,'')),''), nombre),
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

-- 4) trigger de inscritos: ahora arrastra instagram/nacimiento/universidad/género/datos_extra al CRM
create or replace function public.tg_persona_inscrito() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, NEW.instagram,
    'inscrito', false, NEW.fecha_nacimiento, NEW.universidad, NEW.genero, NEW.datos_extra);
  return NEW;
end; $$;
-- (el trigger trg_persona_inscrito ya existe apuntando a esta función; se actualiza solo)

select 'import-crm-plus' as check,
       (select count(*) from information_schema.columns where table_name='lista_inscritos' and column_name in ('instagram','datos_extra')) as li_cols,
       (select count(*) from information_schema.columns where table_name='personas' and column_name in ('fecha_nacimiento','universidad','genero','datos_extra')) as per_cols;
