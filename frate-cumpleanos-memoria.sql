-- ============================================================
-- FRATE · Memoria de Cumpleaños + Pulso Operativo
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Crea 2 tablas:
--   1) cumpleanos       → memoria de cada cumpleaños celebrado (para re-ofrecer + reporte)
--   2) operacion_diaria → pulseras e ingreso por día (informe semanal, reemplaza el Numbers)
--
-- Aditivo e idempotente. Solo el admin ve/edita (RLS).
-- Después de correr esto, corre el archivo de importación (frate-cumpleanos-import.sql).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) MEMORIA DE CUMPLEAÑOS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cumpleanos (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  genero            text,                          -- 'F' | 'M' | 'U'
  telefono          text,
  email             text,
  fecha_nacimiento  date,
  fecha_celebracion date,                          -- cuándo celebró con nosotros
  llegaron          int  default 0,                -- cuántos llegaron (Passline)
  evento_id         bigint,                        -- opcional
  local             text,
  reporte           jsonb default '{}'::jsonb,     -- {asistio, calificacion(1-5), gasto, pulseras, notas}
  origen            text  default 'manual',        -- 'numbers_import' | 'formulario' | 'manual'
  formulario_id     bigint,                        -- opcional (viene del pipeline)
  cliente_id        uuid,                          -- opcional (link CRM)
  datos_extra       jsonb default '{}'::jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists cumpleanos_celebracion_idx on public.cumpleanos (fecha_celebracion desc);
create index if not exists cumpleanos_tel_idx         on public.cumpleanos (telefono);
create index if not exists cumpleanos_origen_idx      on public.cumpleanos (origen);

comment on table public.cumpleanos is 'Memoria de cumpleaños celebrados: base para re-ofrecer el próximo año + reporte post-evento.';

alter table public.cumpleanos enable row level security;
drop policy if exists cumpleanos_admin_all on public.cumpleanos;
create policy cumpleanos_admin_all on public.cumpleanos for all
  using      (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'));


-- ─────────────────────────────────────────────────────────────
-- 2) PULSO OPERATIVO DIARIO (pulseras + ingreso)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.operacion_diaria (
  fecha                date primary key,           -- 1 fila por día (upsert por fecha)
  semana               int,
  pulseras_entregadas  int default 0,
  pulseras_devueltas   int default 0,
  pulseras_usadas      int default 0,
  pulseras_color       text,
  ingreso              int default 0,
  notas                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists operacion_fecha_idx on public.operacion_diaria (fecha desc);

comment on table public.operacion_diaria is 'Pulseras (entregadas/devueltas/usadas/color) e ingreso por día. Informe semanal.';

alter table public.operacion_diaria enable row level security;
drop policy if exists operacion_admin_all on public.operacion_diaria;
create policy operacion_admin_all on public.operacion_diaria for all
  using      (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'));


-- ─────────────────────────────────────────────────────────────
-- 3) VERIFICAR
-- ─────────────────────────────────────────────────────────────
-- select count(*) from public.cumpleanos;
-- select count(*) from public.operacion_diaria;
