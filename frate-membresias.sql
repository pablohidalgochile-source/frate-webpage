-- ============================================================
-- FRATE — Membresías (pases de PAGO ÚNICO)
-- Ej: "$30.000 → 2 meses de entrada gratis". Editables en el admin.
-- La pestaña Membresía se controla con 'cuenta_membresia' (Config).
-- Correr en Supabase SQL Editor.
-- ============================================================

create table if not exists public.membresias (
  id             serial primary key,
  nombre         text not null,
  descripcion    text,
  precio         integer not null,            -- pago único
  duracion_dias  integer not null default 60, -- cuánto dura el beneficio
  beneficio_tipo text default 'entrada_gratis', -- 'entrada_gratis' | 'descuento'
  beneficio_valor integer default 0,          -- si 'descuento': % (ej 30)
  beneficios     text,                        -- bullets descriptivos (uno por línea)
  activo         boolean default true,
  orden          integer default 0,
  created_at     timestamptz default now()
);
alter table public.membresias enable row level security;
drop policy if exists "membresias_public_read" on public.membresias;
create policy "membresias_public_read" on public.membresias for select using (true);
drop policy if exists "membresias_admin_write" on public.membresias;
create policy "membresias_admin_write" on public.membresias for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Membresía activa del cliente
alter table public.clientes add column if not exists membresia_id     integer references public.membresias(id);
alter table public.clientes add column if not exists membresia_nombre text;
alter table public.clientes add column if not exists membresia_hasta  timestamptz;

-- Marca cuándo un pedido es la compra de una membresía
alter table public.pedidos add column if not exists membresia_id integer references public.membresias(id);

-- Pases de ejemplo (edítalos en el admin)
insert into public.membresias (nombre, descripcion, precio, duracion_dias, beneficio_tipo, beneficio_valor, beneficios, orden) values
  ('FRATE PASS 2 MESES', 'Entrada gratis por 2 meses', 30000, 60, 'entrada_gratis', 0,
   E'Entrada gratis a todos los eventos\n2 meses completos\nUn solo pago', 1),
  ('FRATE DESCUENTO',    '20% en todas tus entradas por 1 mes', 9990, 30, 'descuento', 20,
   E'20% de descuento en tickets\n1 mes\nUn solo pago', 2)
on conflict do nothing;

-- ============================================================
-- LISTO. La pestaña Membresía sigue OCULTA hasta encender
-- 'cuenta_membresia' en Admin → Configuración.
-- ============================================================
