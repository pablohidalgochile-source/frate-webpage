-- ============================================================
-- FRATE — Fase 5: pago por-orden del CRM (MercadoPago)
-- Enlaza un pedido MercadoPago con un ítem del CRM (reserva/lista).
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

create table if not exists public.crm_pagos (
  id          serial primary key,
  pedido_id   integer references public.pedidos(id) on delete set null,
  tipo        text not null default 'generico',   -- reserva | lista | generico
  ref_id      integer,                             -- reservas.id o listas.id
  monto       integer not null,
  concepto    text,
  estado      text default 'pendiente',            -- pendiente | pagado
  created_at  timestamptz default now(),
  paid_at     timestamptz
);
create index if not exists crm_pagos_pedido_idx on public.crm_pagos(pedido_id);

alter table public.crm_pagos enable row level security;
drop policy if exists "crm_pagos_staff_read" on public.crm_pagos;
create policy "crm_pagos_staff_read" on public.crm_pagos for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

select 'tabla crm_pagos' as check, case when exists(select 1 from pg_tables where tablename='crm_pagos') then 'OK' else 'FALTA' end;
