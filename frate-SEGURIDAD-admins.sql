-- ============================================================
-- FRATE · SEGURIDAD — Lista blanca de administradores
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Cierra la brecha de raíz: solo los correos que TÚ autorices
-- pueden tener rol elevado (admin/portero/rrpp). Aunque un admin
-- comprometido intente ascender a otro, si el correo no está en la
-- lista blanca, se revierte solo.
--
-- ⚠️ SIGUE LOS 3 PASOS EN ORDEN. No te saltes el PASO 1 o te
--    quedas fuera de tu propio admin.
-- ============================================================

-- Tabla de correos autorizados
create table if not exists public.admins_autorizados (
  email      text primary key,
  rol        text not null default 'admin',   -- admin | portero | rrpp
  nota       text,
  created_at timestamptz default now()
);
alter table public.admins_autorizados enable row level security;
drop policy if exists admins_wl_admin_all on public.admins_autorizados;
create policy admins_wl_admin_all on public.admins_autorizados
  for all using (exists(select 1 from public.clientes where id = auth.uid() and rol = 'admin'))
  with check (exists(select 1 from public.clientes where id = auth.uid() and rol = 'admin'));

-- ════════════════════════════════════════════════════════════
-- PASO 1 · PON AQUÍ TUS CORREOS AUTORIZADOS (¡el tuyo primero!)
--          Agrega/edita las líneas que necesites. SIN esto te bloqueas.
-- ════════════════════════════════════════════════════════════
insert into public.admins_autorizados (email, rol, nota) values
  ('pablohidalgochile@gmail.com', 'admin', 'dueño')
  -- ,('validadorfrate@gmail.com', 'portero', 'validador puerta')
  -- ,('otro@correo.cl', 'admin', 'de confianza')
on conflict (email) do nothing;

-- ════════════════════════════════════════════════════════════
-- PASO 2 · REVISA quién tiene rol elevado hoy y quién NO está en la lista
--          (los que digan "❌ NO AUTORIZADO" son los que hay que bajar)
-- ════════════════════════════════════════════════════════════
select c.username, c.email, c.rol, c.created_at,
  case when w.email is null then '❌ NO AUTORIZADO' else '✅ ok' end as estado
from public.clientes c
left join public.admins_autorizados w on lower(w.email) = lower(c.email)
where coalesce(c.rol,'usuario') <> 'usuario'
order by estado, c.created_at desc;

-- Cuando confirmes arriba que TU correo aparece "✅ ok", DESCOMENTA
-- este UPDATE (quita los dos guiones) y córrelo para bajar a los falsos:
-- update public.clientes set rol = 'usuario'
-- where coalesce(rol,'usuario') <> 'usuario'
--   and lower(email) not in (select lower(email) from public.admins_autorizados);

-- ════════════════════════════════════════════════════════════
-- PASO 3 · Instalar el candado (reemplaza el trigger de rol)
-- ════════════════════════════════════════════════════════════
create or replace function public.tg_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; es_admin boolean; autorizado boolean;
begin
  uid := auth.uid();
  if uid is null then return new; end if;                    -- backend/service_role
  select exists(select 1 from public.clientes where id = uid and rol = 'admin') into es_admin;

  -- ¿el correo de ESTA fila está en la lista blanca para el rol que se pide?
  select exists(
    select 1 from public.admins_autorizados w
    where lower(w.email) = lower(coalesce(new.email,'')) and w.rol = new.rol
  ) into autorizado;

  if tg_op = 'INSERT' then
    if new.rol is null or new.rol = 'usuario' then return new; end if;
    if not autorizado then new.rol := 'usuario'; end if;      -- elevado solo si está en la lista
    return new;
  end if;

  -- UPDATE
  if new.rol is distinct from old.rol then
    -- Solo un admin puede cambiar roles, y solo a un rol autorizado para ese correo.
    if not es_admin then new.rol := old.rol;                  -- un no-admin no toca roles
    elsif new.rol <> 'usuario' and not autorizado then
      new.rol := old.rol;                                     -- ni un admin eleva fuera de la lista
    end if;
  end if;
  if not es_admin then
    new.credito := old.credito; new.membresia_id := old.membresia_id; new.membresia_hasta := old.membresia_hasta;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_rol on public.clientes;
create trigger trg_proteger_rol
  before insert or update on public.clientes
  for each row execute function public.tg_proteger_rol();
