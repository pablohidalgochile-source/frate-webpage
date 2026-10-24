-- ============================================================
-- FRATE · Linktree (frate.cl/links) — setup COMPLETO e idempotente
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
-- Crea la tabla link_items (con portada + subtítulo), RLS, ejemplos
-- y la config del linktree. Se puede correr aunque ya exista algo.
-- ============================================================

-- 1) Tabla (si no existe, la crea ya con cover + subtitulo)
create table if not exists public.link_items (
  id         bigserial primary key,
  titulo     text not null,
  url        text not null,
  emoji      text default '',
  cover      text,
  subtitulo  text,
  orden      int default 0,
  activo     boolean default true,
  created_at timestamptz default now()
);

-- 2) Si la tabla ya existía SIN estas columnas, las agrega
alter table public.link_items add column if not exists cover     text;
alter table public.link_items add column if not exists subtitulo text;

comment on column public.link_items.cover     is 'URL de imagen de portada de la tarjeta (opcional)';
comment on column public.link_items.subtitulo is 'Texto secundario bajo el título del enlace (opcional)';

create index if not exists link_items_orden_idx on public.link_items (orden, id) where activo;

-- 3) Seguridad: lectura pública, escritura solo admin
alter table public.link_items enable row level security;
drop policy if exists "links_public_read" on public.link_items;
create policy "links_public_read" on public.link_items for select using (true);
drop policy if exists "links_admin_all" on public.link_items;
create policy "links_admin_all" on public.link_items for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- 4) Enlaces iniciales (edítalos/bórralos desde admin → Config → Links)
insert into public.link_items (titulo, url, emoji, orden) values
  ('Cumpleaños', '/formcumple',  '🎂', 10),
  ('Reservas',   '/formreserva', '🍾', 20)
on conflict do nothing;

-- 5) Config del linktree (bio + video de fondo opcional + instagram)
insert into public.config_valores (clave, valor) values
  ('links_bio', 'Fraternidad · Campus Central del carrete universitario'),
  ('links_video_url', ''),
  ('links_instagram', 'fraternidadcc')
on conflict (clave) do nothing;

-- 6) Verificación
select 'link_items' as tabla,
       case when exists(select 1 from pg_tables where tablename='link_items') then 'OK' else 'FALTA' end as estado,
       (select count(*) from public.link_items) as enlaces;
