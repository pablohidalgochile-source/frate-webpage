-- ============================================================
-- FRATE — Centro de Notas de Crédito (para el contador)
-- ------------------------------------------------------------
-- Guarda los NÚMEROS de cada devolución en la tabla pedidos, para
-- poder emitir las notas de crédito en el SII y recuperar el IVA.
-- Correr una sola vez en el proyecto WEB. Es idempotente.
-- ============================================================

-- 1) Campos de la devolución / nota de crédito ---------------------------------
alter table public.pedidos
  add column if not exists dev_monto          integer,       -- monto devuelto (bruto, IVA incluido)
  add column if not exists dev_neto           integer,       -- neto sin IVA (monto / 1,19)
  add column if not exists dev_iva            integer,       -- IVA a recuperar (monto − neto)
  add column if not exists dev_comision_reint integer,       -- comisión MP que te reintegran (estimada)
  add column if not exists dev_fecha          timestamptz,   -- cuándo se hizo la devolución
  add column if not exists dev_tipo           text,          -- 'mercadopago' | 'manual' | 'credito'
  add column if not exists nc_emitida         boolean default false,  -- ¿ya emitiste la NC en el SII?
  add column if not exists nc_folio           text,          -- folio de la nota de crédito
  add column if not exists nc_fecha           timestamptz;   -- cuándo la emitiste

comment on column public.pedidos.dev_iva is 'IVA a recuperar con la nota de crédito (monto devuelto − neto).';

-- Índice para listar rápido las que tienen devolución
create index if not exists idx_pedidos_dev_fecha
  on public.pedidos (dev_fecha)
  where dev_fecha is not null;

-- 2) Rellenar hacia atrás: parsear el monto del texto dev_respuesta ------------
--    (ej: "MP parcial $853", "Manual $10.800", "Manual 2 entrada(s) $8.000")
update public.pedidos p
set dev_monto = m.monto,
    dev_neto  = round(m.monto / 1.19),
    dev_iva   = m.monto - round(m.monto / 1.19),
    dev_comision_reint = case when p.dev_respuesta ilike 'MP%' then round(m.monto * 0.035) else 0 end,
    dev_tipo  = case
                  when p.dev_respuesta ilike 'MP%'      then 'mercadopago'
                  when p.dev_respuesta ilike 'Manual%'  then 'manual'
                  else 'manual'
                end,
    dev_fecha = coalesce(p.dev_fecha, p.fecha_pago, p.created_at)
from (
  select id,
         -- toma el número que va DESPUÉS del "$" (evita agarrar el "1" de "1 entrada(s)")
         (regexp_replace(substring(dev_respuesta from '\$\s*([0-9][0-9\.]*)'), '\.', '', 'g'))::integer as monto
  from public.pedidos
  where (estado = 'reembolsado'
         or referencia_pago ilike '%-REFUND%'      -- devolución MP por ticket (la orden sigue 'pagado')
         or referencia_pago ilike '%-MANUAL%')      -- devolución manual por ticket
    and dev_monto is null
    and dev_respuesta like '%$%'
) m
where p.id = m.id and m.monto is not null and m.monto > 0;

-- 3) Devoluciones sin monto en el texto (ej: "Convertida en crédito FRATE") ----
--    → usar el total del pedido como monto de la nota de crédito.
update public.pedidos p
set dev_monto = coalesce(p.total_pagado, p.total, 0),
    dev_neto  = round(coalesce(p.total_pagado, p.total, 0) / 1.19),
    dev_iva   = coalesce(p.total_pagado, p.total, 0) - round(coalesce(p.total_pagado, p.total, 0) / 1.19),
    dev_comision_reint = 0,
    dev_tipo  = 'credito',
    dev_fecha = coalesce(p.dev_fecha, p.fecha_pago, p.created_at)
where p.estado = 'reembolsado'
  and p.dev_monto is null
  and coalesce(p.total_pagado, p.total, 0) > 0;

-- Verificar:  select id, dev_monto, dev_iva, dev_tipo, nc_emitida from pedidos where dev_monto is not null order by dev_fecha desc;
