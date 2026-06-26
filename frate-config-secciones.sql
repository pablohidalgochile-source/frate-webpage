-- ============================================================
-- FRATE — Control de secciones visibles en el sitio
-- Permite prender/apagar secciones desde el admin sin hacer deploy.
-- ============================================================

create table if not exists public.config_sitio (
  clave   text primary key,
  visible boolean not null default true,
  label   text
);

insert into public.config_sitio (clave, visible, label) values
  ('hero',        true, 'Hero (portada)'),
  ('eventos',     true, 'Próximos eventos'),
  ('ambientes',   true, 'Ambientes'),
  ('reservas',    true, 'Reservas'),
  ('galeria',     true, 'Galería'),
  ('webeum',      true, 'WEBEUM'),
  ('tiendita',    true, 'Tiendita'),
  ('carta',       true, 'Carta de tragos'),
  ('como-llegar', true, 'Cómo llegar'),
  ('sobre',       true, 'Historia / Quiénes somos')
on conflict (clave) do nothing;

-- RLS: lectura pública (el frontend anónimo necesita leer esto para renderizar)
alter table public.config_sitio enable row level security;

drop policy if exists "config_sitio_select_public" on public.config_sitio;
create policy "config_sitio_select_public" on public.config_sitio
  for select using (true);

-- Solo admins pueden modificar (vía service_role en el admin panel, o policy de rol)
drop policy if exists "config_sitio_update_admin" on public.config_sitio;
create policy "config_sitio_update_admin" on public.config_sitio
  for update using (
    exists (select 1 from clientes where id = auth.uid() and rol = 'admin')
  );

-- ============================================================
-- LISTO. Ejecutar en Supabase SQL Editor.
-- ============================================================
