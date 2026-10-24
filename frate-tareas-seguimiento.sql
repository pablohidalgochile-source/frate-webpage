-- ============================================================
-- FRATE — Tareas / recordatorios de seguimiento del cliente
-- "Escríbele a X mañana". Se ven en ⏰ Pendientes (inbox WhatsApp).
-- Corre una vez en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create table if not exists public.tareas_seguimiento (
  id              bigint generated always as identity primary key,
  texto           text not null,
  telefono        text,
  nombre          text,
  conversacion_id text,                     -- id de wsp_conversaciones (opcional)
  recordar_fecha  date,                     -- null = sin fecha (aparece siempre)
  hecho           boolean not null default false,
  creado_por      text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_tareas_seg_pend on public.tareas_seguimiento (hecho, recordar_fecha);

alter table public.tareas_seguimiento enable row level security;

drop policy if exists tareas_seg_all on public.tareas_seguimiento;
create policy tareas_seg_all on public.tareas_seguimiento for all
  using      (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp','portero')))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp','portero')));

-- Verificar:
select 'tareas_seguimiento' as check,
       case when exists(select 1 from information_schema.tables where table_name='tareas_seguimiento') then 'OK' else 'FALTA' end;
