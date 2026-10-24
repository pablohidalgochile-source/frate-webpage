-- ============================================================
-- FRATE · Lista de baneados + revisión humana de listas
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ============================================================

-- ── Personas vetadas (no deben entrar) ──
create table if not exists public.baneados (
  id          bigserial primary key,
  rut         text,                 -- RUT o pasaporte (normalizado sin puntos/guion)
  nombre      text,
  nombre_norm text,                 -- nombre en MAYÚS sin tildes, para calzar
  motivo      text,
  activo      boolean default true,
  created_at  timestamptz default now(),
  created_by  text
);
create index if not exists baneados_rut_idx    on public.baneados (rut) where activo;
create index if not exists baneados_nombre_idx on public.baneados (nombre_norm) where activo;

alter table public.baneados enable row level security;
drop policy if exists baneados_admin_all on public.baneados;
create policy baneados_admin_all on public.baneados
  for all using (exists(select 1 from public.clientes where id = auth.uid() and rol = 'admin'))
  with check (exists(select 1 from public.clientes where id = auth.uid() and rol = 'admin'));

-- Lectura para el chequeo en la revisión (portero/admin también revisan)
drop policy if exists baneados_staff_read on public.baneados;
create policy baneados_staff_read on public.baneados
  for select using (exists(select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero','rrpp')));

-- ── Marca de revisión humana en las listas ──
alter table public.listas add column if not exists revisada_at  timestamptz;
alter table public.listas add column if not exists revisada_por text;

comment on column public.listas.revisada_at is 'Cuándo un humano revisó la lista (semáforo IA) antes de enviar';
