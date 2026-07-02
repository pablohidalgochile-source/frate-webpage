-- ============================================================
-- FRATE — Catálogo de tickets + eventos anidados + archivar
-- Fase A + B. Correr en Supabase SQL Editor.
-- ============================================================

-- ── Catálogo maestro de tipos de ticket (plantillas reutilizables) ──
create table if not exists public.catalogo_tickets (
  id             serial primary key,
  nombre         text not null,
  descripcion    text,
  precio         integer default 0,   -- precio sugerido (editable por evento)
  max_por_compra integer default 6,
  activo         boolean default true,
  orden          integer default 0,
  created_at     timestamptz default now()
);
alter table public.catalogo_tickets enable row level security;
drop policy if exists "catalogo_public_read" on public.catalogo_tickets;
create policy "catalogo_public_read" on public.catalogo_tickets for select using (true);
drop policy if exists "catalogo_admin_write" on public.catalogo_tickets;
create policy "catalogo_admin_write" on public.catalogo_tickets for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Vincular cada ticket de evento con su plantilla del catálogo (opcional)
alter table public.tipos_ticket add column if not exists catalogo_id integer references public.catalogo_tickets(id);

-- ── Eventos: archivar + links de colaborador ─────────────────
alter table public.eventos add column if not exists archivado        boolean default false;
alter table public.eventos add column if not exists motivo_archivo   text;
alter table public.eventos add column if not exists archivado_at      timestamptz;
alter table public.eventos add column if not exists link_colaborador  text;

-- Semillas del catálogo (edítalas/bórralas en el admin)
insert into public.catalogo_tickets (nombre, descripcion, precio, orden) values
  ('Anticipada',      'Preventa a precio reducido',        6000,  1),
  ('General',         'Entrada general',                   8000,  2),
  ('VIP',             'Acceso VIP con beneficios',         15000, 3),
  ('Preventa 1',      'Primera preventa (la más barata)',  5000,  4),
  ('Mesa / Reservado','Mesa reservada por grupo',          50000, 5)
on conflict do nothing;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
