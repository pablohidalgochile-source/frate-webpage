-- 🚨 CERRAR frate_staff_audit · lo que marcó Supabase como CRITICAL
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- VERIFICADO EN VIVO (2026-08-06): con la llave pública del navegador
-- devuelve HTTP 200 y entrega las filas. Adentro va el correo del staff,
-- el user_id, el RUT y los roles de ERP / POS / WEB / FLYER.
-- Son 2 filas hoy — poco volumen, pero es el mapa de quién manda.
--
-- La tabla la crea el lado del ERP/POS (no está en ningún .sql de la WEB).
-- Los triggers que la llenan son `security definer`, así que se saltan la
-- RLS por diseño: encenderla NO deja de registrar nada.

-- ── 1) Encender RLS ────────────────────────────────────────────────
alter table public.frate_staff_audit enable row level security;

-- ── 2) Solo un admin la lee ────────────────────────────────────────
drop policy if exists staff_audit_admin on public.frate_staff_audit;
create policy staff_audit_admin on public.frate_staff_audit for select
  using (exists (select 1 from public.clientes
                  where id = auth.uid() and rol = 'admin'));

-- ── 3) Nadie la escribe desde afuera ───────────────────────────────
-- Sin política de insert/update/delete, con RLS encendida, no se puede.
-- Los triggers entran igual porque son security definer.
revoke insert, update, delete on public.frate_staff_audit from anon, authenticated;

comment on table public.frate_staff_audit is
  'Auditoría de cambios de staff. Solo lectura de admin. La llenan triggers security definer.';


-- ── 4) Lo mismo para la tabla madre, por si acaso ──────────────────
alter table public.frate_staff enable row level security;

drop policy if exists staff_admin on public.frate_staff;
create policy staff_admin on public.frate_staff for select
  using (exists (select 1 from public.clientes
                  where id = auth.uid() and rol = 'admin'));


-- ── 5) Chequeo · las dos deben quedar en true ──────────────────────
select c.relname                                as tabla,
       c.relrowsecurity                         as rls_encendida,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('frate_staff','frate_staff_audit');


-- ── 6) ¿Queda alguna otra tabla sin RLS? ───────────────────────────
-- Esto es lo que revisa Supabase. Si sale vacío, no queda ninguna.
select c.relname as tabla_sin_rls,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;
