-- ============================================================
-- FRATE · WhatsApp Business (Opción B, nativo en la web)
-- Proyecto WEB · SQL Editor. Tablas del inbox de WhatsApp.
-- ============================================================

create table if not exists public.wsp_conversaciones (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,            -- 569XXXXXXXX del cliente
  nombre text,
  canal text default 'general',            -- reservas | cumples | general
  etapa text default 'bot_intake',         -- bot_intake | esperando_anfitrion | anfitrion | cerrada
  asignado_a text,                         -- quién del equipo la tomó
  ultimo_mensaje text,
  ultimo_mensaje_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.wsp_mensajes (
  id bigserial primary key,
  conversacion_id uuid references public.wsp_conversaciones(id) on delete cascade,
  telefono text,
  rol text not null default 'cliente',     -- cliente | humano | bot
  texto text,
  wa_message_id text,
  tipo text default 'text',
  ts timestamptz default now()
);
create index if not exists wsp_msg_conv_idx on public.wsp_mensajes (conversacion_id, ts);
create index if not exists wsp_conv_ult_idx on public.wsp_conversaciones (ultimo_mensaje_at desc);

-- RLS: solo admin/portero/rrpp ven el inbox (el webhook escribe con service_role, que bypasea RLS)
alter table public.wsp_conversaciones enable row level security;
alter table public.wsp_mensajes enable row level security;
drop policy if exists wsp_conv_staff on public.wsp_conversaciones;
create policy wsp_conv_staff on public.wsp_conversaciones for all
  using (exists(select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero','rrpp')))
  with check (exists(select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero','rrpp')));
drop policy if exists wsp_msg_staff on public.wsp_mensajes;
create policy wsp_msg_staff on public.wsp_mensajes for all
  using (exists(select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero','rrpp')))
  with check (exists(select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero','rrpp')));
