-- ============================================================
-- FRATE — Fase 4: conversaciones del Anfitrión con handoff a humano
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

create table if not exists public.conversaciones (
  id          uuid primary key default gen_random_uuid(),
  canal       text default 'web',            -- web | whatsapp | instagram
  cliente_id  uuid references public.clientes(id) on delete set null,
  contacto    jsonb,                          -- {nombre, telefono, instagram, email}
  estado      text default 'bot',             -- bot | esperando_humano | humano | cerrado
  asignado_a  uuid,
  ultimo_ts   timestamptz default now(),
  created_at  timestamptz default now()
);
create table if not exists public.mensajes (
  id              bigserial primary key,
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  rol             text not null,              -- cliente | bot | humano
  texto           text,
  media           jsonb,
  ts              timestamptz default now()
);
create index if not exists mensajes_conv_idx on public.mensajes(conversacion_id, ts);
create index if not exists conversaciones_estado_idx on public.conversaciones(estado, ultimo_ts desc);

-- RLS: las edge functions escriben (service role, ignora RLS). El admin/rrpp
-- lee y puede responder (rol 'humano') desde el panel web.
alter table public.conversaciones enable row level security;
alter table public.mensajes enable row level security;

drop policy if exists "conv_staff_read" on public.conversaciones;
create policy "conv_staff_read" on public.conversaciones for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));
drop policy if exists "conv_staff_upd" on public.conversaciones;
create policy "conv_staff_upd" on public.conversaciones for update
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

drop policy if exists "msg_staff_read" on public.mensajes;
create policy "msg_staff_read" on public.mensajes for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));
drop policy if exists "msg_staff_ins" on public.mensajes;
create policy "msg_staff_ins" on public.mensajes for insert
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

-- Verificación
select 'tabla conversaciones' as check, case when exists(select 1 from pg_tables where tablename='conversaciones') then 'OK' else 'FALTA' end
union all select 'tabla mensajes', case when exists(select 1 from pg_tables where tablename='mensajes') then 'OK' else 'FALTA' end;
