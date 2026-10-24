-- === clase de ticket · PARTE 1 de 2 ===
-- En orden. Cada parte queda entera.

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
