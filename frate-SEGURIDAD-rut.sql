-- ============================================================
-- FRATE · Candado de RUT real en las cuentas (proyecto WEB)
-- Corre TODO este archivo en Supabase → SQL Editor.
-- Rechaza que se GUARDE un RUT falso en `clientes`, aunque lo
-- intenten por la API directa (no solo desde el formulario).
-- Los extranjeros (columna `extranjero`) quedan exentos.
-- NO toca las cuentas ya existentes (solo valida cambios nuevos).
-- ============================================================

-- Columna para marcar extranjer@s (usan pasaporte, sin RUT chileno)
alter table public.clientes add column if not exists extranjero boolean default false;

-- ── Funciones de validación (idempotentes) ──
create or replace function public.rut_limpio(r text) returns text
language sql immutable as $$
  select regexp_replace(upper(coalesce(r,'')), '[^0-9K]', '', 'g')
$$;

create or replace function public.rut_dv_ok(r text) returns boolean
language plpgsql immutable as $$
declare c text := public.rut_limpio(r); body text; dv text; s int := 0; m int := 2; i int; calc text;
begin
  if c !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(c, length(c)-1); dv := right(c,1);
  for i in reverse length(body)..1 loop
    s := s + substr(body,i,1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  calc := case (11 - (s % 11)) when 11 then '0' when 10 then 'K' else (11 - (s % 11))::text end;
  return calc = dv;
end $$;

create or replace function public.rut_sospechoso(r text) returns boolean
language plpgsql immutable as $$
declare c text := public.rut_limpio(r); body text;
begin
  if c = '' or length(c) < 8 then return true; end if;
  if not public.rut_dv_ok(r) then return true; end if;
  body := left(c, length(c)-1);
  if body ~ '^(.)\1+$' then return true; end if;                       -- todos iguales (111..., 888...)
  if body in ('12345678','23456789','1234567','7654321','87654321','98765432') then return true; end if;
  return false;
end $$;

-- ── Trigger: al INSERTAR o cambiar el RUT, si NO es extranjer@ y el
--    RUT viene con algo, debe ser válido y no falso. Vacío se permite
--    (el formulario obliga a llenarlo; OAuth/Google lo completa luego). ──
create or replace function public.tg_validar_rut_cliente() returns trigger
language plpgsql security definer as $$
begin
  -- El service_role (edge functions) y los admin pasan sin restricción
  if auth.role() = 'service_role' then return NEW; end if;
  if exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin') then return NEW; end if;
  -- Extranjer@: usa pasaporte, no validamos RUT chileno
  if coalesce(NEW.extranjero, false) then return NEW; end if;
  -- Si hay RUT y es sospechoso/falso → rechazar
  if coalesce(NEW.rut, '') <> '' and public.rut_sospechoso(NEW.rut) then
    raise exception 'RUT inválido o falso (%). Ingresa tu RUT real.', NEW.rut
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_validar_rut_cliente on public.clientes;
create trigger trg_validar_rut_cliente
  before insert or update of rut, extranjero on public.clientes
  for each row execute function public.tg_validar_rut_cliente();

-- Nota: las cuentas ya existentes con RUT falso NO se tocan; solo se
-- validará cuando alguien intente crear o cambiar un RUT de ahora en adelante.
