-- FRATE · COBROS 01a · columnas para que cada link de pago tenga folio, rastro y dueño
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · toca crm_pagos y pedidos (una columna)
-- Idempotente. Cada tabla va en su propia transacción. ⚠️ Córrelo fuera de venta: la primera vez
-- toma un lock exclusivo sobre pedidos; si sale «lock timeout», vuelve a correrlo (es seguro). Si la columna
-- ya existe, no lo pide. Después corre frate-cobros-01b-backfill.sql.
-- Las escrituras de cobros siguen yendo SOLO por la edge crm-pago (service role): RLS no cambia.
-- Reversa (en este orden, nunca al revés):
--   1) vuelve las edges crm-pago, mp-webhook, mp-pagos, crear-pago, recordar-pendientes, reanudar-pago,
--      devolver-pago y api-crm a su versión anterior (todas leen pedidos.origen o crm_pagos nuevo);
--   2) reversa del 02: drop function public.admin_kpi_ventas(timestamptz); y corre frate-totales-servidor.sql;
--   3) recién ahí: alter table public.pedidos drop column if exists origen;  (y las columnas nuevas de crm_pagos)
set lock_timeout = '2s';  -- corto a propósito: la cola detrás del lock no pasa los 3 s de anon

-- ① crm_pagos: columnas nuevas (tabla chica) ──────────────────────────────
begin;
alter table public.crm_pagos
  add column if not exists folio text,               -- CUM-004567 · RES-… · SRV-… · CUM-M000123 (manual)
  add column if not exists servicio text,            -- cumpleanos | reserva | otro
  add column if not exists tabla text,               -- formularios | reservas | listas | null (de dónde es ref_id)
  add column if not exists link text,                -- init_point de MercadoPago
  add column if not exists preferencia_id text,
  add column if not exists creado_por uuid,
  add column if not exists creado_por_nombre text,
  add column if not exists enviado_at timestamptz,
  add column if not exists envios integer not null default 0,
  add column if not exists enviado_canal text,       -- whatsapp | correo | whatsapp_frate
  add column if not exists mp_payment_id text,
  add column if not exists monto_pagado integer,
  add column if not exists pagado_via text,          -- webhook | sincronizar | manual | erp
  add column if not exists medio text default 'mercadopago',  -- mercadopago | efectivo | transferencia | tarjeta
  add column if not exists cotejo text,              -- cuadra | monto_distinto | pagado_doble | link_reemplazado
  add column if not exists cotejo_detalle text,
  add column if not exists pagos_extra jsonb not null default '[]'::jsonb,  -- [{payment_id, monto, at}]
  add column if not exists reemplazado_por integer,
  add column if not exists anulado_at timestamptz,
  add column if not exists anulado_motivo text,
  add column if not exists devuelto_at timestamptz,
  add column if not exists devuelto_monto integer;
-- estado ahora puede ser: pendiente | pagado | reemplazado | anulado | devuelto
create unique index if not exists crm_pagos_folio_uq on public.crm_pagos (folio) where folio is not null;
create index if not exists crm_pagos_tipo_ref_idx on public.crm_pagos (tipo, ref_id);
commit;

-- ② pedidos.origen: 'web' (entradas) | 'crm' (cobro de servicio).
--    Default constante → Postgres no reescribe la tabla (solo un lock cortito).
--    Va con guardia: «add column if not exists» pide el lock exclusivo ANTES de mirar si la columna
--    existe, así que volver a correrlo dejaría en cola las ventas. Con el if, la segunda vez no lo pide.
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'pedidos' and column_name = 'origen') then
    execute 'alter table public.pedidos add column origen text not null default ''web''';
  end if;
end $$;
commit;

-- ③ Tiempo real: crm_pagos a la publicación (solo si la publicación existe y la tabla no está)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_pagos') then
    execute 'alter publication supabase_realtime add table public.crm_pagos';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ④ Verificación
select 'columnas nuevas en crm_pagos (deben ser 22)' as chequeo, count(*)::text as valor
  from information_schema.columns
 where table_schema = 'public' and table_name = 'crm_pagos'
   and column_name in ('folio','servicio','tabla','link','preferencia_id','creado_por','creado_por_nombre',
     'enviado_at','envios','enviado_canal','mp_payment_id','monto_pagado','pagado_via','medio','cotejo',
     'cotejo_detalle','pagos_extra','reemplazado_por','anulado_at','anulado_motivo','devuelto_at','devuelto_monto')
union all
select 'pedidos.origen', case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'pedidos' and column_name = 'origen') then 'OK' else 'FALTA' end
union all
select 'índice folio único', case when to_regclass('public.crm_pagos_folio_uq') is not null then 'OK' else 'FALTA' end
union all
select 'índice (tipo, ref_id)', case when to_regclass('public.crm_pagos_tipo_ref_idx') is not null then 'OK' else 'FALTA' end
union all
select 'realtime crm_pagos', case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'crm_pagos') then 'OK' else 'NO (¿existe la publicación supabase_realtime?)' end;
