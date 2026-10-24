-- FRATE · PASO 3 · clientes.sexo (F mujer / M hombre / X prefiero no decirlo)
-- Proyecto WEB · SQL Editor · toca SOLO la tabla clientes
-- Se escribe una sola vez: después solo lo cambia un admin o el servidor.
-- Reversa: drop trigger if exists trg_sexo_fijo on public.clientes;
--          drop function if exists public.tg_sexo_fijo();   (la columna vacía puede quedar)
set lock_timeout = '5s';

alter table public.clientes add column if not exists sexo text;
alter table public.clientes drop constraint if exists clientes_sexo_chk;
-- NOT VALID: todas las filas viejas están en null, no hace falta recorrer la tabla.
alter table public.clientes add constraint clientes_sexo_chk
  check (sexo is null or sexo in ('F', 'M', 'X')) not valid;
comment on column public.clientes.sexo is 'F mujer, M hombre, X prefiero no decirlo. Fijo una vez escrito.';

create or replace function public.tg_sexo_fijo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.sexo := nullif(upper(btrim(new.sexo)), '');          -- 'f ' → 'F', '' → null
  if tg_op = 'INSERT' then return new; end if;
  if old.sexo is null or new.sexo is not distinct from old.sexo then
    return new;                                            -- primera vez, o no cambió
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'anon' then
    return new;                                            -- servidor (service_role) o SQL Editor
  end if;
  if exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin') then
    return new;                                            -- admin
  end if;
  new.sexo := old.sexo;                                    -- se conserva el que tenía, sin error
  return new;
end $$;

create or replace trigger trg_sexo_fijo
  before insert or update of sexo on public.clientes
  for each row execute function public.tg_sexo_fijo();

notify pgrst, 'reload schema';

select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'clientes' and column_name = 'sexo') as columna_sexo,
  exists (select 1 from pg_trigger
           where tgrelid = 'public.clientes'::regclass and tgname = 'trg_sexo_fijo') as candado_sexo;
