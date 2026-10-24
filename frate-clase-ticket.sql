-- ═══════════════════════════════════════════════════════════════════
-- 🏷️ QUE LA APP NUNCA MÁS ADIVINE SI UNA ENTRADA ES CORTESÍA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- EL PROBLEMA: hoy hay SEIS reglas distintas decidiendo lo mismo, y ya
-- se contradicen entre ellas:
--
--   1. admin.html:3322  regex sobre el NOMBRE — si no dice «pre-venta»
--                       ni «puerta», asume cortesía
--   2. admin.html:3453  metodo_pago='cortesia' OR total <= 0
--   3. admin.html:4049  metodo_pago='cortesia' OR precio_unitario <= 0
--   4. pedidos.es_venta total_pagado > 0
--   5. sync-erp         metodo_pago = 'cortesia'
--   6. evento_vivo      precio_unitario > 0 → preventa
--
--   · PRUEBA ($500):        la 1 dice cortesía, la 3 dice venta
--   · LISTA VIP AIRE ($0):  todas dicen cortesía, y se vendieron 15
--                           en $295.000 el 1 de agosto
--
-- LA SOLUCIÓN: el tipo de ticket declara QUÉ ES. No se deduce del precio,
-- porque VIP AIRE vale $0 y se vende, y PRUEBA vale $500 y no es venta.
--
-- DOS VERDADES QUE NO SE PISAN:
--   · clase     = qué ES la entrada   → puerta, aforo, desglose, listas
--   · es_venta  = si ENTRÓ plata      → ingresos, reportes, contabilidad
--   Usar una para responder la pregunta de la otra es lo que está roto.
--
-- ⚠️ NO toca ni una fila de pedidos ni de items_pedido. Solo agrega
--    columnas al catálogo y a los tipos por evento.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) La clase, en el catálogo ────────────────────────────────────
alter table public.catalogo_tickets
  add column if not exists clase text,
  add column if not exists clase_confirmada boolean not null default false;

do $$ begin
  alter table public.catalogo_tickets
    add constraint catalogo_tickets_clase_ck
    check (clase is null or clase in ('venta','cortesia','puerta','prueba'));
exception when duplicate_object then null; end $$;

comment on column public.catalogo_tickets.clase is
  'venta = entra plata · cortesia = regalada, se cuenta aparte · puerta = se cobra al entrar · prueba = no cuenta en ninguna parte';
comment on column public.catalogo_tickets.clase_confirmada is
  'false = la puso el sistema deduciendo. true = la confirmó un humano.';


-- ── 2) La clase, en el tipo de cada evento ─────────────────────────
-- Se copia del catálogo al agregarlo, igual que el precio y el stock, y
-- se puede cambiar para esa noche sin tocar el catálogo.
alter table public.tipos_ticket
  add column if not exists clase text;

do $$ begin
  alter table public.tipos_ticket
    add constraint tipos_ticket_clase_ck
    check (clase is null or clase in ('venta','cortesia','puerta','prueba'));
exception when duplicate_object then null; end $$;


-- ── 3) Propuesta inicial ───────────────────────────────────────────
-- Deduce por el NOMBRE, no por el precio: el precio es justo lo que
-- miente. Queda con clase_confirmada = false hasta que un humano la
-- revise en el admin, y ahí la pantalla la marca en amarillo.
update public.catalogo_tickets set clase =
  case
    when nombre ~* '(prueba|test)'            then 'prueba'
    when nombre ~* '(^|\s)ingreso(\s|$)|puerta' then 'puerta'
    when nombre ~* 'pre-?\s*venta'            then 'venta'
    when nombre ~* '\mventa\M'                then 'venta'
    else 'cortesia'
  end
where clase is null;

-- Los tipos ya creados en eventos heredan del catálogo.
update public.tipos_ticket t
   set clase = c.clase
  from public.catalogo_tickets c
 where t.catalogo_id = c.id and t.clase is null and c.clase is not null;

-- Los que no vienen del catálogo (creados a mano en un evento): misma regla.
update public.tipos_ticket set clase =
  case
    when nombre ~* '(prueba|test)'            then 'prueba'
    when nombre ~* '(^|\s)ingreso(\s|$)|puerta' then 'puerta'
    when nombre ~* 'pre-?\s*venta'            then 'venta'
    when nombre ~* '\mventa\M'                then 'venta'
    else 'cortesia'
  end
where clase is null;


-- ── 4) VIP AIRE VENTA ──────────────────────────────────────────────
-- Pablo, 2026-08-03: «LISTA VIP AIRE... cortesía... las que se venden
-- deben ser VIP AIRE VENTA. Deben existir opciones distintas: algunas se
-- venden, otras no.»
-- Precio 0 a propósito: el monto de un VIP es variable y lo pone un
-- humano al emitirlo. Poner una cifra acá sería inventarla.
insert into public.catalogo_tickets
  (nombre, descripcion, precio, max_por_compra, zona, zona_id, genero,
   hora_max_ingreso, instrucciones, transferible, activo, orden, clase, clase_confirmada)
select
  'LISTA VIP AIRE VENTA (VÁLIDA HASTA LAS 02:30 HRS)',
  'VIP AIRE pagado. El monto lo define quien lo vende — el precio de acá es solo referencia.',
  0, 1, c.zona, c.zona_id, c.genero, c.hora_max_ingreso, c.instrucciones,
  c.transferible, true, coalesce(c.orden,0), 'venta', true
from public.catalogo_tickets c
where c.nombre ilike 'LISTA VIP AIRE%'
  and c.nombre not ilike '%VENTA%'
  and not exists (select 1 from public.catalogo_tickets x where x.nombre ilike 'LISTA VIP AIRE VENTA%')
limit 1;


-- ── 5) El tablero de puerta deja de adivinar ───────────────────────
-- `evento_vivo` decidía la categoría con `precio_unitario > 0` y un regex
-- de 'ingreso'. Ahora manda la clase del tipo, y la vieja regla queda
-- solo de respaldo para lo que todavía no tenga clase.
-- Las de clase 'prueba' NO se cuentan en ninguna parte: ni emitidas, ni
-- entradas, ni aforo, ni desglose. Para eso existe esa clase.
create or replace function public.item_clase(p_tipo_ticket_id int, p_nombre text, p_precio numeric)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select t.clase from public.tipos_ticket t where t.id = p_tipo_ticket_id and t.clase is not null),
    case when coalesce(p_precio,0) > 0 then 'venta'
         when coalesce(p_nombre,'') ~* '(^|\s)ingreso(\s|$)|puerta' then 'puerta'
         else 'cortesia' end)
$$;
grant execute on function public.item_clase(int, text, numeric) to authenticated, service_role;

comment on function public.item_clase is
  'La clase de una entrada YA emitida, sin tocar items_pedido: la lee del tipo. Si el tipo no la tiene, cae a la regla vieja.';


-- ── 6) Chequeo ─────────────────────────────────────────────────────
select clase,
       count(*)                                        as tipos,
       count(*) filter (where not clase_confirmada)     as por_confirmar,
       string_agg(nombre, ' · ' order by nombre)        as cuales
from public.catalogo_tickets
group by clase
order by clase;
