-- 📥 DEJAR LAS DEVOLUCIONES DE INSTAGRAM EN LA BANDEJA
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ ESTO NO DEVUELVE NI UN PESO. Solo marca las órdenes como 'pendiente'
--    para que aparezcan en Órdenes → Devol. & React. La plata sale cuando
--    tú aprietas Devolver en el admin, una por una.
--
-- QUIÉNES QUEDAN FUERA, verificado con `qr_usados.incidencia`:
--   · FCC-004181 y FCC-004468 (Raphaella, Mia, Gennara) → ENTRARON a CELOSA
--     el 1-ago a la 01:13. Sus QR de la primera orden figuran usados, pero
--     por `cambio_dia`, no por la puerta.
--
-- OJO CON DOS, que son PARCIALES:
--   · FCC-004598 → solo el ticket de SEBASTIÁN VILLAGRA. Los otros tres
--     entraron a la 01:00. Y la plata le vuelve a Andrés Bustamante, que pagó.
--   · FCC-005905 → solo el ticket de JUAN VILCA. Los otros tres entraron
--     a las 23:46.
--   En el modal de devolución hay que marcar SOLO ese ticket, no la orden.


-- ── 1) Antes de tocar nada: mira lo que vas a marcar ──────────────
select 'FCC-'||lpad(id::text,6,'0') as orden, nombre_cliente, email_cliente,
       total_pagado, estado, dev_estado as estado_actual
from public.pedidos
where id in (4761, 4598, 5821, 5822, 5261, 5263, 5982, 5905)
order by id;


-- ── 2) Marcarlas ──────────────────────────────────────────────────
-- Idempotente: si ya tiene solicitud, no la pisa.
update public.pedidos
   set dev_estado        = 'pendiente',
       dev_opcion        = 'dinero',
       dev_solicitada_at = coalesce(dev_solicitada_at, now()),
       dev_motivo        = case id
         when 4598 then 'Instagram · SOLO el ticket de Sebastián Villagra — los otros 3 entraron. Paga vuelve a Andrés Bustamante.'
         when 5905 then 'Instagram · SOLO el ticket de Juan Vilca — los otros 3 entraron.'
         when 5982 then 'Instagram (Gio) · no asistió, el portero lo marcó como posible devolución.'
         when 5261 then 'Instagram · tenía además cortesía esa noche (FCC-005622). No usó ninguna.'
         when 5263 then 'Instagram · tenía además cortesía esa noche (FCC-005624). No usó ninguna.'
         when 5821 then 'Instagram · pidió sus DOS compras (5821 y 5822).'
         when 5822 then 'Instagram · pidió sus DOS compras (5821 y 5822).'
         else 'Instagram · solicitud recibida por mensaje directo.'
       end
 where id in (4761, 4598, 5821, 5822, 5261, 5263, 5982, 5905)
   and estado = 'pagado'
   and dev_estado is null;


-- ── 3) Cómo quedó la bandeja ──────────────────────────────────────
select 'FCC-'||lpad(id::text,6,'0') as orden, nombre_cliente,
       total_pagado, dev_estado, dev_motivo
from public.pedidos
where dev_estado = 'pendiente'
order by dev_solicitada_at desc nulls last, id;
