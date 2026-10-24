-- ============================================================
-- FRATE — Paquetes de listas ("jueves tipo"): un paquete agrupa
-- varias plantillas (Cortesía Mujeres + Hombres + Cotty). Con un
-- clic se crean TODAS sus listas de una para el evento elegido.
-- Corre una vez en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create table if not exists public.lista_paquetes (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  plantilla_ids jsonb not null default '[]'::jsonb,   -- [id,id,...] de plantillas_comunidad
  activo        boolean not null default true,
  orden         integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.lista_paquetes enable row level security;

drop policy if exists lista_paquetes_read on public.lista_paquetes;
create policy lista_paquetes_read on public.lista_paquetes for select using (true);

drop policy if exists lista_paquetes_admin on public.lista_paquetes;
create policy lista_paquetes_admin on public.lista_paquetes for all
  using      (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')));

-- Verificar:
select 'lista_paquetes' as check,
       case when exists(select 1 from information_schema.tables where table_name='lista_paquetes') then 'OK' else 'FALTA' end;
