-- ============================================================
-- FRATE — Add-ons / Extras del checkout (configurables)
-- Extras opcionales que el cliente suma a su compra (Decoración,
-- Fotógrafo, Transporte, Botella extra…). Los edita el admin y se
-- cobran JUNTO con las entradas en el mismo pago de MercadoPago.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

create table if not exists public.addons (
  id          bigserial primary key,
  nombre      text not null,
  descripcion text,
  precio      int  default 0,
  foto_url    text,
  emoji       text default '✨',
  activo      boolean default true,
  orden       int default 0,
  created_at  timestamptz default now()
);
create index if not exists addons_orden_idx on public.addons (orden, id) where activo;

alter table public.addons enable row level security;
-- Lectura pública (el checkout anónimo necesita ver los activos)
drop policy if exists "addons_public_read" on public.addons;
create policy "addons_public_read" on public.addons for select using (true);
-- Solo admin administra
drop policy if exists "addons_admin_all" on public.addons;
create policy "addons_admin_all" on public.addons for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Semilla de ejemplo (edítalos/bórralos desde el panel)
insert into public.addons (nombre, descripcion, precio, emoji, orden) values
  ('Decoración de mesa', 'Globos + cartel personalizado en tu mesa', 15000, '🎈', 10),
  ('Fotógrafo · 1 hora', 'Un fotógrafo cubre tu grupo por 1 hora', 25000, '📸', 20),
  ('Transporte ida',     'Traslado hasta el local', 8000, '🚐', 30)
on conflict do nothing;

select 'addons' as check,
       case when exists(select 1 from pg_tables where tablename='addons') then 'OK' else 'FALTA' end,
       (select count(*) from public.addons) as extras;
