-- ============================================================
-- FRATE · QUE UNA CORTESÍA NUNCA MÁS DIGA "PAGADO"
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL PROBLEMA, EN NÚMEROS REALES DE HOY:
--     3.167 órdenes con estado 'pagado'
--       572 son ventas de verdad
--     2.595 son cortesías  ← el 82%
--
-- Las cortesías se guardan como 'pagado' porque ese estado es lo que hace
-- válido el QR. No es un error: es que el sistema usa UNA sola palabra para
-- dos cosas distintas — "esta entrada sirve" y "entró plata".
--
-- ⚠️ NO se cambia el `estado`. Tocarlo rompería los QR, el stock y la puerta.
-- Lo que se agrega es una marca separada que diga, sin ambigüedad, si HUBO PAGO.
--
-- Idempotente. No modifica ni una fila de datos.
-- ============================================================

-- ── 1) La marca. Es calculada: no se puede desincronizar de la plata ──
alter table public.pedidos
  add column if not exists es_venta boolean
  generated always as (coalesce(total_pagado, 0) > 0) stored;

create index if not exists idx_pedidos_es_venta on public.pedidos(es_venta, estado);


-- ── 1b) El RUT del comprador ──
-- El correo se escribe mal, se comparte y cambia. El RUT no. Es el hilo que
-- amarra una compra a una persona real, y hoy la orden no lo guardaba (aunque
-- el checkout YA lo pedía y validaba para cada asistente).
alter table public.pedidos add column if not exists rut_cliente text;
create index if not exists idx_pedidos_rut on public.pedidos(rut_cliente) where rut_cliente is not null;


-- ── 2) Vista con el tipo de orden en una sola palabra ──
-- Para reportes, contabilidad y cualquier cosa que hoy hace `estado='pagado'`
-- creyendo que eso significa "vendido".
create or replace view public.v_ordenes
with (security_invoker = on) as
select p.*,
       case
         when p.referencia_pago = 'PUERTA-VIP'                  then 'puerta'
         when coalesce(p.total_pagado, 0) > 0                   then 'venta'
         when p.metodo_pago = 'cortesia'                        then 'cortesia'
         else                                                        'cortesia'
       end as tipo_orden,
       case
         when p.estado <> 'pagado'                              then p.estado
         when p.referencia_pago = 'PUERTA-VIP'                  then 'ingreso puerta'
         when coalesce(p.total_pagado, 0) > 0                   then 'pagado'
         else                                                        'cortesía'
       end as estado_legible
from public.pedidos p;


-- ── 3) Verificación + el retrato real de tu operación ──
select 'columna es_venta' as chequeo,
       case when exists(select 1 from information_schema.columns
                        where table_name='pedidos' and column_name='es_venta')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'columna rut_cliente',
       case when exists(select 1 from information_schema.columns
                        where table_name='pedidos' and column_name='rut_cliente')
            then '✅ ok' else '❌ falta' end
union all
select 'vista v_ordenes',
       case when exists(select 1 from information_schema.views
                        where table_schema='public' and table_name='v_ordenes')
            then '✅ ok' else '❌ falta' end;

select tipo_orden,
       count(*)                                            as ordenes,
       to_char(coalesce(sum(coalesce(total_pagado,0)),0), 'FM$999G999G999') as plata
from public.v_ordenes
where estado = 'pagado'
group by 1
order by 2 desc;

-- ============================================================
-- DESPUÉS DE ESTO:
--
--   · `pedidos.es_venta` dice si entró plata. Siempre. Sin interpretar.
--   · `v_ordenes.tipo_orden` = venta · cortesia · puerta
--   · `v_ordenes.estado_legible` es lo que hay que mostrarle a una persona:
--     una cortesía dice «cortesía», no «pagado».
--
-- Y lo más útil: cualquier consulta de PLATA debería filtrar por
-- `es_venta = true`, no por `estado = 'pagado'`. Ese cambio de hábito es
-- lo que evita volver a contar 2.595 regalos como si fueran ventas.
-- ============================================================
