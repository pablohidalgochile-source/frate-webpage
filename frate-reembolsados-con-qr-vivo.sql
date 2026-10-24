-- 🚨 DEVOLUCIONES VIEJAS QUE DEJARON EL QR VIVO · solo lectura
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- QUÉ PASÓ: hoy `devolver-pago` quema los QR al devolver (los marca
-- `incidencia='reembolsado'` en qr_usados, y la puerta los rechaza).
-- Pero eso se agregó DESPUÉS de que ya se habían hecho devoluciones.
--
-- Las de antes devolvieron la plata y dejaron la entrada funcionando.
-- Esa gente puede entrar gratis y el sistema no lo va a impedir.
--
-- FCC-001704 (16-jul, Maite Castañeda) es una: dice «reembolsado» y sus
-- dos QR salen VÁLIDO en verde.

select 'FCC-'||lpad(p.id::text,6,'0')            as orden,
       p.nombre_cliente                          as comprador,
       p.email_cliente                           as correo,
       p.estado,
       p.total_pagado                            as devuelto,
       p.created_at::date                        as compra,
       e.nombre                                  as evento,
       e.fecha                                   as fecha_evento,
       count(q.qr)                               as qr_totales,
       count(*) filter (where u.qr_id is not null)              as qr_marcados,
       count(*) filter (where u.qr_id is null)                  as qr_vivos,
       case
         when e.fecha < current_date
           then '⏳ el evento ya pasó — sin riesgo'
         when count(*) filter (where u.qr_id is null) > 0
           then '🚨 PUEDE ENTRAR GRATIS — hay que quemarlos'
         else '✅ quemados'
       end                                       as riesgo
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
left join public.qr_usados u on u.qr_id = q.qr
left join public.eventos e   on e.id = ip.evento_id
where p.estado in ('reembolsado','cancelado')
group by p.id, p.nombre_cliente, p.email_cliente, p.estado,
         p.total_pagado, p.created_at, e.nombre, e.fecha
order by (e.fecha >= current_date) desc nulls last,
         count(*) filter (where u.qr_id is null) desc,
         p.id desc;
