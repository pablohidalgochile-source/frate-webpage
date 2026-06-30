-- ============================================================
-- FRATE — FASE 0 (cimientos) + PUNTOS & PREMIOS reales
-- Todo nace oculto: la pestaña Puntos se controla con el toggle
-- 'cuenta_puntos' (Admin → Configuración). Correr en Supabase.
-- ============================================================

-- ── Columnas en clientes ─────────────────────────────────────
alter table public.clientes add column if not exists puntos          integer default 0;
alter table public.clientes add column if not exists fecha_nacimiento date;  -- para Cumpleañero (próxima fase)

-- ── FASE 0: Libro de movimientos (ledger de puntos y crédito) ──
create table if not exists public.movimientos (
  id          serial primary key,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  tipo        text,        -- 'puntos' | 'credito'
  monto       integer,     -- + gana, - gasta
  concepto    text,
  pedido_id   integer,
  created_at  timestamptz default now()
);
alter table public.movimientos enable row level security;
drop policy if exists "movimientos_own_read" on public.movimientos;
create policy "movimientos_own_read" on public.movimientos for select using (auth.uid() = cliente_id);

-- ── FASE 0: Valores configurables (settings clave/valor) ─────
create table if not exists public.config_valores (
  clave text primary key,
  valor text,
  label text
);
alter table public.config_valores enable row level security;
drop policy if exists "config_valores_public_read" on public.config_valores;
create policy "config_valores_public_read" on public.config_valores for select using (true);
drop policy if exists "config_valores_admin_write" on public.config_valores;
create policy "config_valores_admin_write" on public.config_valores for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

insert into public.config_valores (clave, valor, label) values
  ('puntos_pesos_por_punto', '100', 'Pesos gastados por cada 1 punto ganado')
on conflict (clave) do nothing;

-- ── Catálogo de premios ──────────────────────────────────────
create table if not exists public.premios (
  id           serial primary key,
  nombre       text not null,
  descripcion  text,
  costo_puntos integer not null,
  tipo         text default 'beneficio',  -- 'credito' | 'beneficio'
  valor        integer default 0,         -- si tipo='credito', cuántos $
  stock        integer,                   -- null = ilimitado
  activo       boolean default true,
  orden        integer default 0,
  created_at   timestamptz default now()
);
alter table public.premios enable row level security;
drop policy if exists "premios_public_read" on public.premios;
create policy "premios_public_read" on public.premios for select using (true);
drop policy if exists "premios_admin_write" on public.premios;
create policy "premios_admin_write" on public.premios for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- ── RPC: canjear un premio (atómico) ─────────────────────────
create or replace function public.canjear_premio(p_cliente_id uuid, p_premio_id int)
returns json language plpgsql security definer set search_path = public as $$
declare v_premio record; v_puntos int;
begin
  select * into v_premio from premios where id = p_premio_id and activo = true;
  if v_premio is null then return json_build_object('ok', false, 'error', 'Premio no disponible'); end if;
  if v_premio.stock is not null and v_premio.stock <= 0 then return json_build_object('ok', false, 'error', 'Sin stock'); end if;
  select puntos into v_puntos from clientes where id = p_cliente_id;
  if coalesce(v_puntos, 0) < v_premio.costo_puntos then return json_build_object('ok', false, 'error', 'Puntos insuficientes'); end if;

  update clientes set puntos = puntos - v_premio.costo_puntos where id = p_cliente_id;
  insert into movimientos (cliente_id, tipo, monto, concepto) values (p_cliente_id, 'puntos', -v_premio.costo_puntos, 'Canje: ' || v_premio.nombre);

  if v_premio.tipo = 'credito' then
    update clientes set credito = coalesce(credito, 0) + v_premio.valor where id = p_cliente_id;
    insert into movimientos (cliente_id, tipo, monto, concepto) values (p_cliente_id, 'credito', v_premio.valor, 'Premio: ' || v_premio.nombre);
  end if;

  if v_premio.stock is not null then update premios set stock = stock - 1 where id = p_premio_id; end if;
  return json_build_object('ok', true, 'premio', v_premio.nombre, 'tipo', v_premio.tipo, 'valor', v_premio.valor);
end; $$;
grant execute on function public.canjear_premio(uuid, int) to anon, authenticated;

-- ── Premios de ejemplo (puedes editarlos/borrarlos en el admin) ──
insert into public.premios (nombre, descripcion, costo_puntos, tipo, valor, orden) values
  ('$1.000 de descuento', 'Crédito para tu próxima compra', 100, 'credito', 1000, 1),
  ('$3.000 de descuento', 'Crédito para tu próxima compra', 280, 'credito', 3000, 2),
  ('Pasar la fila',       'Acceso preferente una noche',    150, 'beneficio', 0, 3),
  ('Trago gratis',        'Un trago de la carta',           200, 'beneficio', 0, 4)
on conflict do nothing;

-- ============================================================
-- LISTO. La pestaña Puntos sigue OCULTA hasta que enciendas
-- 'cuenta_puntos' en Admin → Configuración.
-- ============================================================
