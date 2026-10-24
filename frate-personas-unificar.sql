-- ============================================================
-- FRATE — Fase A: IDENTIDAD ÚNICA DE PERSONA (fundación)
-- ------------------------------------------------------------
-- Aditivo y seguro (no borra datos). Hace 3 cosas:
--   1) Vincula personas ↔ clientes (columna cliente_id) + backfill.
--   2) Completa las ISLAS que no llegaban a personas:
--      formularios, cumpleanos, invitaciones_rrpp, y los INVITADOS
--      dentro de items_pedido.personas y reservas.invitados (jsonb).
--   3) Todo por triggers best-effort (si fallan, NO bloquean la venta).
-- Correr una vez en el Supabase de la WEB. Idempotente.
-- ============================================================

-- 1) Vínculo con la cuenta ------------------------------------------------------
alter table public.personas add column if not exists cliente_id uuid;
create index if not exists idx_personas_cliente_id on public.personas (cliente_id) where cliente_id is not null;

-- 2) personas_upsert: se recrea con un parámetro extra p_cliente_id --------------
--    (se dropea la firma de 11 params para no dejar overloads ambiguos)
drop function if exists public.personas_upsert(text, text, text, text, text, text, boolean, date, text, text, jsonb);

create or replace function public.personas_upsert(
  p_nombre text, p_rut text default null, p_email text default null,
  p_telefono text default null, p_instagram text default null,
  p_origen text default null, p_visita boolean default false,
  p_fecha_nacimiento date default null, p_universidad text default null,
  p_genero text default null, p_datos_extra jsonb default null,
  p_cliente_id uuid default null
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
                                fecha_nacimiento,universidad,genero,datos_extra,cliente_id)
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
            p_datos_extra,
            p_cliente_id);
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
      cliente_id = coalesce(cliente_id, p_cliente_id),
      ultima_vez= now(), updated_at = now()
    where id = v_id;
  end if;
end; $$;

-- 3) El trigger de clientes ahora pasa el cliente_id (vincula la cuenta) ---------
create or replace function public.tg_persona_cliente() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(btrim(coalesce(NEW.nombres,'')||' '||coalesce(NEW.apellidos,'')),
    NEW.rut, NEW.email, NEW.telefono, null, 'cliente', false, p_cliente_id => NEW.id);
  exception when others then null; end;
  return NEW;
end; $$;

-- 4) ISLAS nuevas → personas ----------------------------------------------------
-- 4a) Formularios (inbox público: cumple / reserva / frecuente)
create or replace function public.tg_persona_formulario() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre, NEW.datos->>'rut', NEW.email, NEW.telefono, NEW.instagram, 'formulario', false);
  exception when others then null; end;
  return NEW;
end; $$;
drop trigger if exists trg_persona_formulario on public.formularios;
create trigger trg_persona_formulario after insert on public.formularios for each row execute function public.tg_persona_formulario();

-- 4b) Cumpleaños (memoria)
create or replace function public.tg_persona_cumple() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre, null, NEW.email, NEW.telefono, null, 'cumpleaños', false, NEW.fecha_nacimiento, null, NEW.genero, null);
  exception when others then null; end;
  return NEW;
end; $$;
drop trigger if exists trg_persona_cumple on public.cumpleanos;
create trigger trg_persona_cumple after insert on public.cumpleanos for each row execute function public.tg_persona_cumple();

-- 4c) Invitaciones RRPP
create or replace function public.tg_persona_invitacion() returns trigger language plpgsql security definer set search_path=public as $$
begin
  begin perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, NEW.instagram, 'invitacion_rrpp', false);
  exception when others then null; end;
  return NEW;
end; $$;
drop trigger if exists trg_persona_invitacion on public.invitaciones_rrpp;
create trigger trg_persona_invitacion after insert on public.invitaciones_rrpp for each row execute function public.tg_persona_invitacion();

-- 4d) INVITADOS dentro de una compra (items_pedido.personas jsonb: [{nombre,rut,email}])
create or replace function public.tg_persona_invitados_pedido() returns trigger language plpgsql security definer set search_path=public as $$
declare e jsonb;
begin
  begin
    if NEW.personas is not null and jsonb_typeof(NEW.personas::jsonb) = 'array' then
      for e in select * from jsonb_array_elements(NEW.personas::jsonb) loop
        perform public.personas_upsert(e->>'nombre', e->>'rut', e->>'email', e->>'telefono', null, 'invitado', false);
      end loop;
    end if;
  exception when others then null; end;
  return NEW;
end; $$;
drop trigger if exists trg_persona_invitados_pedido on public.items_pedido;
create trigger trg_persona_invitados_pedido after insert or update of personas on public.items_pedido
  for each row execute function public.tg_persona_invitados_pedido();

-- 4e) INVITADOS dentro de una reserva (reservas.invitados jsonb)
create or replace function public.tg_persona_invitados_reserva() returns trigger language plpgsql security definer set search_path=public as $$
declare e jsonb;
begin
  begin
    if NEW.invitados is not null and jsonb_typeof(NEW.invitados::jsonb) = 'array' then
      for e in select * from jsonb_array_elements(NEW.invitados::jsonb) loop
        perform public.personas_upsert(e->>'nombre', e->>'rut', e->>'email', e->>'telefono', null, 'invitado', false);
      end loop;
    end if;
  exception when others then null; end;
  return NEW;
end; $$;
drop trigger if exists trg_persona_invitados_reserva on public.reservas;
create trigger trg_persona_invitados_reserva after insert or update of invitados on public.reservas
  for each row execute function public.tg_persona_invitados_reserva();

-- 5) BACKFILL -------------------------------------------------------------------
-- 5a) Vincular personas ya existentes con su cuenta (por rut o correo)
update public.personas p
set cliente_id = c.id
from public.clientes c
where p.cliente_id is null
  and ( (p.rut is not null and lower(p.rut)=lower(c.rut))
     or (p.email is not null and lower(p.email)=lower(c.email)) );

-- 5b) Traer los INVITADOS de compras que hoy no están en personas
do $$
declare r record; e jsonb;
begin
  for r in select personas from public.items_pedido where personas is not null loop
    begin
      if jsonb_typeof(r.personas::jsonb)='array' then
        for e in select * from jsonb_array_elements(r.personas::jsonb) loop
          perform public.personas_upsert(e->>'nombre', e->>'rut', e->>'email', e->>'telefono', null, 'invitado', false);
        end loop;
      end if;
    exception when others then null; end;
  end loop;
end $$;

-- Verificar:  select count(*) filter (where cliente_id is not null) as con_cuenta,
--                    count(*) as total from public.personas;
