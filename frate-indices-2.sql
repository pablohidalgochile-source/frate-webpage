-- ⚡ CUATRO ÍNDICES QUE FALTAN · nada más
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- SOLO CREA ÍNDICES. No toca datos, no cambia comportamiento, no borra
-- nada. Y va solo esto: la vez pasada le agregué una mejora "de paso" a
-- un SQL urgente, esa línea falló y se deshizo el arreglo entero.
--
-- QUÉ SON:
--   Cuatro columnas por las que el admin filtra a diario y que no tienen
--   índice. Postgres no los crea solo. Hoy no se nota porque las tablas
--   todavía aguantan; con cada venta aguantan menos — igual que los dos
--   que faltaban la semana pasada y terminaron colgando el panel.
--
--   items_pedido.tipo_ticket_id → cuántas se vendieron de cada tipo.
--     Corre CADA VEZ que abres un evento. Es el más importante.
--   pedidos.metodo_pago        → separar cortesías de ventas.
--   qr_usados.incidencia       → contar incidencias de la puerta.
--   lista_inscritos.estado     → cuántos aprobados por lista.
--
-- ⚠️ SEGURO EN VIVO: las tablas son de miles de filas, no de millones,
--    así que crear cada índice toma milisegundos. No corta ninguna venta
--    ni ningún escaneo.

create index if not exists items_pedido_tt_idx
  on public.items_pedido (tipo_ticket_id);

create index if not exists pedidos_metodo_idx
  on public.pedidos (metodo_pago);

create index if not exists qr_usados_incidencia_idx
  on public.qr_usados (incidencia);

create index if not exists lista_inscritos_estado_idx
  on public.lista_inscritos (lista_id, estado);


-- ── Chequeo ────────────────────────────────────────────────────────
select t.relname                                as tabla,
       i.relname                                as indice,
       pg_size_pretty(pg_relation_size(i.oid))  as pesa
from pg_class i
join pg_index x on x.indexrelid = i.oid
join pg_class t on t.oid = x.indrelid
where i.relname in ('items_pedido_tt_idx','pedidos_metodo_idx',
                    'qr_usados_incidencia_idx','lista_inscritos_estado_idx')
order by t.relname;
