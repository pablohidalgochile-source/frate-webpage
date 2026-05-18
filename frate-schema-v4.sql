-- ============================================================
-- FRATE — Schema v4 (extiende v3)
-- Permite items de carta/tiendita + múltiples personas por ticket
-- Ejecutar en: SQL Editor → New query → Run
-- ============================================================

-- ── ITEMS_PEDIDO: agregar columnas flexibles ──────────────────
alter table items_pedido add column if not exists producto_tipo text;        -- 'ticket' | 'carta' | 'merch'
alter table items_pedido add column if not exists producto_id   text;        -- id del item (carta/merch)
alter table items_pedido add column if not exists detalle       text;        -- talla, color, etc
alter table items_pedido add column if not exists personas      jsonb default '[]'::jsonb;
                                                                              -- array de {nombre, rut, email}
alter table items_pedido add column if not exists qr_ids        jsonb default '[]'::jsonb;
                                                                              -- array de QR ids generados

-- Hacer evento_id/tipo_ticket_id nullable (para carta/merch no aplica)
alter table items_pedido alter column evento_id      drop not null;
alter table items_pedido alter column tipo_ticket_id drop not null;
alter table items_pedido alter column nombre_evento  drop not null;
alter table items_pedido alter column nombre_ticket  drop not null;

-- ── PEDIDOS: agregar columnas para tracking de pago ────────────
alter table pedidos add column if not exists fee_servicio integer default 0;
alter table pedidos add column if not exists total_pagado integer;
alter table pedidos add column if not exists fecha_pago   timestamptz;

-- ── TRIGGER: descontar stock automático al pagar ──────────────
create or replace function fn_descontar_stock()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Solo descontar cuando pedido pasa a 'pagado'
  if new.estado = 'pagado' and (old.estado is null or old.estado <> 'pagado') then
    update tipos_ticket tt
      set disponible = greatest(0, tt.disponible - ip.cantidad)
      from items_pedido ip
      where ip.pedido_id = new.id
        and ip.tipo_ticket_id = tt.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_descontar_stock on pedidos;
create trigger trg_descontar_stock
  after update on pedidos
  for each row execute function fn_descontar_stock();

-- ── QR_USADOS: tracking de QRs ya escaneados ──────────────────
create table if not exists qr_usados (
  id          serial primary key,
  qr_id       text unique not null,
  pedido_id   integer references pedidos(id) on delete cascade,
  escaneado_por uuid references clientes(id),
  notas       text,
  created_at  timestamptz default now()
);
create index if not exists qr_usados_pedido_idx on qr_usados (pedido_id);

alter table qr_usados enable row level security;

-- Solo admin lee/inserta
drop policy if exists "admin_qr_all" on qr_usados;
create policy "admin_qr_all" on qr_usados for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- ── POLÍTICA: permitir insertar items_pedido a cualquiera
-- (RLS ya estaba abierto para insert, lo dejamos)
-- ============================================================
-- LISTO. Ejecutar.
-- ============================================================
