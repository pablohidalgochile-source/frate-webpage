-- ============================================================
-- FRATE — Grupos de chat administrables (color + emoji + orden)
-- La "etiqueta" de cada conversación (conversaciones.grupo) ahora
-- puede tener color/emoji y se administra desde Comunidad → Chats.
-- Esta tabla es el CATÁLOGO de grupos; conversaciones.grupo guarda
-- el NOMBRE (texto libre, para no romper lo ya existente).
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- Idempotente. El código degrada suave si esta tabla no existe.
-- ============================================================

create table if not exists public.chat_grupos (
  id         bigserial primary key,
  nombre     text not null unique,
  color      text default '#71717a',   -- hex
  emoji      text default '🏷️',
  orden      int  default 0,
  created_at timestamptz default now()
);
create index if not exists chat_grupos_orden_idx on public.chat_grupos (orden, nombre);

-- Semilla con los grupos típicos de FRATE (no pisa los que ya existan)
insert into public.chat_grupos (nombre, color, emoji, orden) values
  ('Cumpleaños', '#D4A832', '🎂', 10),
  ('Despedida',  '#b23bd0', '🍾', 20),
  ('Reserva VIP','#3b82f6', '⭐', 30),
  ('Convenio',   '#22c55e', '🤝', 40),
  ('Cobro',      '#E8363D', '💳', 50),
  ('Frecuentes', '#2dd4bf', '✨', 60)
on conflict (nombre) do nothing;

-- RLS: staff (admin/rrpp) lee; admin administra
alter table public.chat_grupos enable row level security;

drop policy if exists "cg_staff_read" on public.chat_grupos;
create policy "cg_staff_read" on public.chat_grupos for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

drop policy if exists "cg_admin_ins" on public.chat_grupos;
create policy "cg_admin_ins" on public.chat_grupos for insert
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

drop policy if exists "cg_admin_upd" on public.chat_grupos;
create policy "cg_admin_upd" on public.chat_grupos for update
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

drop policy if exists "cg_admin_del" on public.chat_grupos;
create policy "cg_admin_del" on public.chat_grupos for delete
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Realtime (opcional; ignora si ya está)
do $$ begin
  begin execute 'alter publication supabase_realtime add table public.chat_grupos';
  exception when duplicate_object then null; when others then null; end;
end $$;

select 'chat_grupos' as check,
       case when exists(select 1 from pg_tables where tablename='chat_grupos') then 'OK' else 'FALTA' end,
       (select count(*) from public.chat_grupos) as grupos;
