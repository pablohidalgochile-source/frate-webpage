-- FRATE · PASO 4 · candado de entradas de miembros (tabla nueva)
-- Proyecto WEB · SQL Editor · toca SOLO reservas_miembros (no toca pedidos)
-- Una activa por ticket+cuenta y una por ticket+documento. crear-pago la llena
-- con la llave de servicio; nadie más la lee (RLS sin políticas).
-- Reversa: drop table if exists public.reservas_miembros;
set lock_timeout = '5s';

create table if not exists public.reservas_miembros (
  id             bigint generated always as identity primary key,
  tipo_ticket_id bigint      not null,
  cliente_id     uuid        not null,
  rut_norm       text        not null check (length(rut_norm) >= 6),  -- rut_limpio(rut) o 'X'+documento
  pedido_id      bigint      not null,
  evento_id      bigint,
  created_at     timestamptz not null default now(),
  liberada_at    timestamptz,          -- null = candado activo
  liberada_por   text,                 -- 'estado:cancelado', 'pedido borrado', ...
  conflicto_at   timestamptz           -- el pedido revivió y el cupo ya lo tenía otro
);

create unique index if not exists reservas_miembros_tt_cliente_uq
  on public.reservas_miembros (tipo_ticket_id, cliente_id) where liberada_at is null;
create unique index if not exists reservas_miembros_tt_rut_uq
  on public.reservas_miembros (tipo_ticket_id, rut_norm) where liberada_at is null;
create index if not exists reservas_miembros_pedido_idx on public.reservas_miembros (pedido_id);
create index if not exists reservas_miembros_cliente_idx on public.reservas_miembros (cliente_id);

alter table public.reservas_miembros enable row level security;
revoke all on public.reservas_miembros from anon, authenticated;

notify pgrst, 'reload schema';

select to_regclass('public.reservas_miembros') is not null as tabla,
       (select count(*) from pg_indexes where tablename = 'reservas_miembros') as indices;
