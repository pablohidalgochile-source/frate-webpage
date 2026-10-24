-- FRATE · PASO 7 · el RUT queda fijo después de reservar una entrada de miembro
-- Proyecto WEB · SQL Editor · toca SOLO clientes
-- Así nadie cambia su RUT para sacar otra cortesía. Un admin sí puede corregirlo.
-- Reversa: drop trigger if exists trg_rut_fijo_miembros on public.clientes;
set lock_timeout = '5s';

create or replace function public.tg_rut_fijo_miembros()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rut is not distinct from old.rut and new.extranjero is not distinct from old.extranjero then
    return new;                                            -- no cambió (Mi cuenta manda el mismo RUT)
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'anon' then
    return new;                                            -- servidor o SQL Editor
  end if;
  if exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin') then
    return new;                                            -- admin
  end if;
  if exists (select 1 from public.reservas_miembros where cliente_id = old.id) then
    raise exception 'RUT_FIJO: tu RUT quedó fijo porque ya reservaste una entrada de miembro. Escríbenos para cambiarlo.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger trg_rut_fijo_miembros
  before update of rut, extranjero on public.clientes
  for each row execute function public.tg_rut_fijo_miembros();

select exists (select 1 from pg_trigger where tgrelid = 'public.clientes'::regclass
                and tgname = 'trg_rut_fijo_miembros') as rut_fijo;
