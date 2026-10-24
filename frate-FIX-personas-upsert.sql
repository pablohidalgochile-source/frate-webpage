-- ============================================================
-- 🔥 FRATE — FIX URGENTE: personas_upsert duplicada (ambigua)
-- frate-import-crm-plus.sql agregó parámetros a personas_upsert, así
-- que quedó una 2ª versión (11 params) además de la vieja (7 params).
-- Las llamadas de 7 argumentos (triggers de pedidos/reservas/clientes)
-- quedaron AMBIGUAS → "function personas_upsert(...) is not unique" y
-- la EMISIÓN DE CORTESÍAS fallaba.
-- Esto deja UNA sola función. Correr YA en el Supabase de la WEB.
-- ============================================================

-- 1) Borra AMBAS firmas conocidas (deja el terreno limpio)
drop function if exists public.personas_upsert(text, text, text, text, text, text, boolean);
drop function if exists public.personas_upsert(text, text, text, text, text, text, boolean, date, text, text, jsonb);

-- 2) Recrea UNA sola versión canónica (11 params, con defaults → atiende
--    tanto las llamadas de 7 args como las de 11)
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

-- 3) ENDURECER los triggers: el enriquecimiento del CRM es BEST-EFFORT.
--    Si personas_upsert fallara por lo que sea, NO debe bloquear la venta
--    ni la emisión de cortesías (captura la excepción y sigue).
create or replace function public.tg_persona_inscrito() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, NEW.instagram,
    'inscrito', false, NEW.fecha_nacimiento, NEW.universidad, NEW.genero, NEW.datos_extra);
  exception when others then null; end;
  return NEW;
end; $$;

create or replace function public.tg_persona_reserva() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, null, 'reserva', false);
  exception when others then null; end;
  return NEW;
end; $$;

create or replace function public.tg_persona_pedido() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre_cliente, null, NEW.email_cliente, null, null,
    case when NEW.metodo_pago='cortesia' then 'cortesia' else 'venta' end, false);
  exception when others then null; end;
  return NEW;
end; $$;

create or replace function public.tg_persona_cliente() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(btrim(coalesce(NEW.nombres,'')||' '||coalesce(NEW.apellidos,'')),
    NEW.rut, NEW.email, NEW.telefono, null, 'cliente', false);
  exception when others then null; end;
  return NEW;
end; $$;

create or replace function public.tg_persona_checkin() returns trigger language plpgsql security definer set search_path=public as $$
declare v_nombre text; v_email text;
begin
  begin
    select nombre_cliente, email_cliente into v_nombre, v_email from public.pedidos where id = NEW.pedido_id;
    if v_nombre is not null or v_email is not null then
      perform public.personas_upsert(v_nombre, null, v_email, null, null, 'visita', true);
    end if;
  exception when others then null; end;
  return NEW;
end; $$;

-- 4) Verifica: debe quedar EXACTAMENTE 1
select 'personas_upsert' as check, count(*) as quedan
from pg_proc where proname = 'personas_upsert';
