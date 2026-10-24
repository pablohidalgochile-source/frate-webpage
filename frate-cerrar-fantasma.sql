-- 🧹 CERRAR LA SOLICITUD QUE NO CORRESPONDE
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- De las 6 de la bandeja, SOLO UNA es claramente improcedente:
--
--   FCC-003682 · Gabriela Ocando · $9.720 · «Compré dos veces por accidente»
--   → La bandeja dice TODOS ENTRARON · 0 sin usar · 1 entró.
--     Ella compró dos veces (003682 y 003684). Se le devolvió la 003684,
--     que era la correcta. Con la 003682 ENTRÓ a CELOSA el 31-jul.
--     No hay nada que devolver.
--
-- Las otras 5 quedan como están: cuatro tienen entradas sin usar y una es
-- parcial. Esas las decides tú, no las cierra un SQL.
--
-- ⚠️ Esto NO devuelve ni cobra nada. Solo saca la solicitud de la bandeja.


-- ── 1) Mira lo que vas a cerrar, antes de tocarlo ─────────────────
select 'FCC-'||lpad(p.id::text,6,'0') as orden, p.nombre_cliente, p.email_cliente,
       p.total_pagado, p.estado, p.dev_estado, p.dev_motivo,
       (select count(*) from public.items_pedido ip
        cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
        join public.qr_usados u on u.qr_id = q.qr and u.incidencia is null
        where ip.pedido_id = p.id)                    as entradas_usadas
from public.pedidos p
where p.id = 3682;


-- ── 2) Cerrarla ───────────────────────────────────────────────────
-- Idempotente: si ya no está pendiente, no hace nada.
update public.pedidos
   set dev_estado    = 'rechazada',
       dev_respuesta = 'Cerrada el ' || to_char(now(),'DD-MM-YYYY') ||
                       ': entró con esta entrada el 31-07. La compra duplicada '
                       || '(FCC-003684) ya fue devuelta.'
 where id = 3682
   and dev_estado = 'pendiente';


-- ── 3) Cómo quedó la bandeja ──────────────────────────────────────
select 'FCC-'||lpad(p.id::text,6,'0') as orden, p.nombre_cliente,
       p.total_pagado, p.dev_opcion as pide, p.dev_motivo
from public.pedidos p
where p.dev_estado = 'pendiente'
order by p.dev_solicitada_at desc nulls last;
