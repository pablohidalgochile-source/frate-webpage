-- 🚑 LOS DOS ÍNDICES QUE FALTAN — corre esto YA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- QUÉ ARREGLA: el "Error: canceling statement due to statement timeout"
-- de Órdenes, y de paso la lentitud de varias pantallas más.
--
-- POR QUÉ PASABA:
--
--   1) `items_pedido.pedido_id` NO TIENE ÍNDICE. Postgres no los crea solo
--      para las claves foráneas, hay que pedirlos. Cada vez que el admin
--      lista órdenes con sus entradas —y eso lo hacen unas 15 pantallas—
--      la base barre la tabla ENTERA de items por cada consulta.
--
--   2) `pedidos.created_at` tampoco lo tiene por sí solo. Existe uno de
--      (estado, created_at), pero ese no sirve para ordenar por fecha
--      cuando estás en «Todas» y no filtras por estado: Postgres solo
--      puede usar un índice compuesto para ordenar si las columnas de
--      adelante están fijadas. Entonces ordenaba las 8.400 órdenes a mano.
--
--   Juntas: barrido completo + ordenamiento completo, en cada carga. Por
--   eso empeoraba con cada venta y hoy se pasó del límite de tiempo.
--
-- ⚠️ SEGURO EN VIVO. Las tablas son chicas (miles de filas, no millones),
--    así que crear el índice toma milisegundos. No corta ninguna venta ni
--    ningún escaneo de la puerta.
--
-- Idempotente: si ya existen, no hace nada.


create index if not exists items_pedido_pedido_idx
  on public.items_pedido (pedido_id);

create index if not exists pedidos_created_idx
  on public.pedidos (created_at desc);


-- ── Chequeo · que quedaron y cuánto pesan ─────────────────────────
select i.relname                                  as indice,
       t.relname                                  as tabla,
       pg_size_pretty(pg_relation_size(i.oid))    as pesa,
       '✅ listo'                                 as estado
from pg_class i
join pg_index x on x.indexrelid = i.oid
join pg_class t on t.oid = x.indrelid
where i.relname in ('items_pedido_pedido_idx','pedidos_created_idx')
order by t.relname;
