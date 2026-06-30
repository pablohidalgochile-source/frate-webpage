-- ============================================================
-- FRATE — Códigos de descuento + RRPP (promotores)
-- Un mismo sistema: un código puede dar descuento y/o atribuir la
-- venta a un promotor (RRPP) para medir cuánto vendió cada uno.
-- Correr en Supabase SQL Editor.
-- ============================================================

create table if not exists public.codigos (
  id              serial primary key,
  codigo          text unique not null,            -- ej: "VERANO20", "JUAN-RRPP"
  tipo            text not null default 'descuento', -- 'descuento' | 'rrpp'
  descuento_tipo  text,                            -- 'porcentaje' | 'monto' | null
  descuento_valor integer default 0,               -- 20 (=20%) o 5000 (=$5.000)
  rrpp_nombre     text,                            -- nombre del promotor (si aplica)
  evento_id       integer references eventos(id) on delete cascade, -- null = todos
  max_usos        integer,                         -- null = ilimitado
  usos            integer default 0,
  activo          boolean default true,
  created_at      timestamptz default now()
);

-- Vincular el código usado a cada pedido (para reportes y comisiones)
alter table public.pedidos add column if not exists codigo_id    integer references public.codigos(id);
alter table public.pedidos add column if not exists codigo_texto text;
alter table public.pedidos add column if not exists descuento    integer default 0;

-- RLS
alter table public.codigos enable row level security;

-- Lectura pública SOLO de campos necesarios para validar en el checkout
-- (se hace vía RPC abajo; igual permitimos select para simplicidad del admin)
drop policy if exists "codigos_select_public" on public.codigos;
create policy "codigos_select_public" on public.codigos for select using (true);

-- Escritura solo admin
drop policy if exists "codigos_admin_write" on public.codigos;
create policy "codigos_admin_write" on public.codigos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- ── RPC: validar un código (usada por el checkout, sin sesión) ──
-- Devuelve el código si es válido y aplicable al evento; si no, null.
create or replace function public.validar_codigo(p_codigo text, p_evento_id integer)
returns table (id integer, codigo text, tipo text, descuento_tipo text, descuento_valor integer, rrpp_nombre text)
language sql security definer stable set search_path = public as $$
  select c.id, c.codigo, c.tipo, c.descuento_tipo, c.descuento_valor, c.rrpp_nombre
  from codigos c
  where c.codigo = upper(trim(p_codigo))
    and c.activo = true
    and (c.evento_id is null or c.evento_id = p_evento_id)
    and (c.max_usos is null or c.usos < c.max_usos)
  limit 1;
$$;
grant execute on function public.validar_codigo(text, integer) to anon, authenticated;

-- ── RPC: incrementar uso de un código (atómico, al confirmar pago) ──
create or replace function public.incrementar_uso_codigo(p_codigo_id integer)
returns void
language sql security definer set search_path = public as $$
  update codigos set usos = usos + 1 where id = p_codigo_id;
$$;
grant execute on function public.incrementar_uso_codigo(integer) to anon, authenticated, service_role;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
