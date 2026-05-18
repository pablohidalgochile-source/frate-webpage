-- ============================================================
-- FRATE Schema v3 — Carta, Tiendita, WEBEUM, Ambientes
-- + Links sociales en eventos
-- Ejecutar en: Supabase SQL Editor → New query → Run
-- ============================================================

-- ── 1. EVENTOS — agregar campos de links ─────────────────────
alter table eventos add column if not exists link_externo   text;
alter table eventos add column if not exists link_ig        text;
alter table eventos add column if not exists link_tiktok    text;
alter table eventos add column if not exists link_fb        text;
alter table eventos add column if not exists precio_general integer default 0;

-- ── 2. CARTA DE TRAGOS ───────────────────────────────────────
create table if not exists carta (
  id          serial primary key,
  nombre      text    not null,
  categoria   text    not null,
  descripcion text,
  precio      integer not null,
  disponible  boolean default true,
  orden       integer default 0,
  created_at  timestamptz default now()
);
alter table carta enable row level security;
drop policy if exists "carta_public_read"  on carta;
drop policy if exists "admin_carta_all"    on carta;
create policy "carta_public_read" on carta for select using (true);
create policy "admin_carta_all"   on carta for all
  using (public.current_user_is_admin());

-- ── 3. TIENDITA (merch) ──────────────────────────────────────
create table if not exists tiendita (
  id          serial primary key,
  nombre      text    not null,
  categoria   text    not null default 'Ropa',
  descripcion text,
  precio      integer not null,
  disponible  boolean default true,
  stock       integer default 0,
  tallas      text[]  default '{}',
  colores     text[]  default '{}',
  imagen_url  text,
  imagen_color text   default '#111',
  orden       integer default 0,
  created_at  timestamptz default now()
);
alter table tiendita enable row level security;
drop policy if exists "tiendita_public_read" on tiendita;
drop policy if exists "admin_tiendita_all"   on tiendita;
create policy "tiendita_public_read" on tiendita for select using (true);
create policy "admin_tiendita_all"   on tiendita for all
  using (public.current_user_is_admin());

-- ── 4. WEBEUM (episodios) ────────────────────────────────────
create table if not exists webeum (
  id            serial primary key,
  titulo        text    not null,
  fecha         text,
  duracion      text,
  url           text    not null,
  thumbnail_url text,
  orden         integer default 0,
  created_at    timestamptz default now()
);
alter table webeum enable row level security;
drop policy if exists "webeum_public_read" on webeum;
drop policy if exists "admin_webeum_all"   on webeum;
create policy "webeum_public_read" on webeum for select using (true);
create policy "admin_webeum_all"   on webeum for all
  using (public.current_user_is_admin());

-- ── 5. AMBIENTES ─────────────────────────────────────────────
create table if not exists ambientes (
  id           serial primary key,
  slug         text    not null unique,
  nombre       text    not null,
  descripcion  text,
  musica       text[]  default '{}',
  capacidad    text,
  emoji        text    default '🔥',
  color_acento text    default '#E8363D',
  imagen_url   text,
  video_url    text,
  orden        integer default 0,
  created_at   timestamptz default now()
);
alter table ambientes enable row level security;
drop policy if exists "ambientes_public_read" on ambientes;
drop policy if exists "admin_ambientes_all"   on ambientes;
create policy "ambientes_public_read" on ambientes for select using (true);
create policy "admin_ambientes_all"   on ambientes for all
  using (public.current_user_is_admin());

-- Datos iniciales (solo si la tabla está vacía)
insert into ambientes (slug, nombre, descripcion, musica, capacidad, emoji, color_acento, orden)
select * from (values
  ('fuego', 'FUEGO',  'La pista principal. El corazón del carrete.', array['Reggaeton','Urban','Trap'], '350 personas', '🔥', '#E8363D', 1),
  ('aire',  'AIRE',   'El espacio donde suena lo nuestro.',          array['Nacional Hits','Afrobeats'],  '200 personas', '🌬️', '#D4A832', 2),
  ('tierra','TIERRA', 'La terraza de la casita. Bajo las estrellas.',array['Guaracha','Dembow'],          '150 personas', '🌿', '#8B1A1E', 3)
) as v(slug,nombre,descripcion,musica,capacidad,emoji,color_acento,orden)
where not exists (select 1 from ambientes limit 1);
