-- ============================================================
-- FRATE — Linktree propio (frate.cl/links)
-- Botones/enlaces configurables (Reservas, FRAT&FRIENDS, redes…).
-- Los EVENTOS publicados se listan solos; esta tabla es para los
-- enlaces fijos que administra el dueño. La bio/video salen de
-- config_valores. Correr en el Supabase de la WEB.
-- ============================================================

create table if not exists public.link_items (
  id         bigserial primary key,
  titulo     text not null,
  url        text not null,
  emoji      text default '',
  orden      int default 0,
  activo     boolean default true,
  created_at timestamptz default now()
);
create index if not exists link_items_orden_idx on public.link_items (orden, id) where activo;

alter table public.link_items enable row level security;
drop policy if exists "links_public_read" on public.link_items;
create policy "links_public_read" on public.link_items for select using (true);
drop policy if exists "links_admin_all" on public.link_items;
create policy "links_admin_all" on public.link_items for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Enlaces fijos de ejemplo (edítalos/bórralos desde el panel)
insert into public.link_items (titulo, url, emoji, orden) values
  ('Reservas cumpleaños', '/formcumple', '🎂', 10),
  ('FRAT&FRIENDS · Convenios', '/frat-friends', '🤝', 20)
on conflict do nothing;

-- Config del Linktree (bio + video de fondo opcional)
insert into public.config_valores (clave, valor) values
  ('links_bio', 'Fraternidad Campus Central · fiestas desde 2013'),
  ('links_video_url', ''),
  ('links_instagram', 'fraternidadcc')
on conflict (clave) do nothing;

select 'link_items' as check,
       case when exists(select 1 from pg_tables where tablename='link_items') then 'OK' else 'FALTA' end,
       (select count(*) from public.link_items) as enlaces;
