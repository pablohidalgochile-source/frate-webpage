-- ============================================================
-- FRATE · Auditoría de TICKETS vendidos (solo lectura, no cambia nada)
-- Proyecto WEB · SQL Editor. Corre cada bloque y revisa el resultado.
-- ============================================================

-- 1) 🔴 LO MÁS IMPORTANTE: ¿hay órdenes PAGADAS sin QR?
--    (alguien pagó pero no tendría entrada válida). Debe dar CERO filas.
select p.id, p.nombre_cliente, p.email_cliente, p.total, p.created_at
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
where p.estado = 'pagado' and p.total > 0 and ip.producto_tipo = 'ticket'
  and (ip.qr_ids is null or jsonb_array_length(ip.qr_ids) = 0)
order by p.created_at desc;

-- 2) 🔴 ¿Hay tokens de QR DUPLICADOS entre distintas entradas?
--    Cada QR debe ser único. Debe dar CERO filas.
select tok, count(*) as veces
from (
  select jsonb_array_elements_text(qr_ids) as tok
  from public.items_pedido
  where qr_ids is not null and jsonb_typeof(qr_ids) = 'array'
) t
group by tok
having count(*) > 1;

-- 3) ✅ Resumen sano: órdenes pagadas y QRs emitidos (venta real, total>0)
select
  count(distinct p.id) as ordenes_pagadas,
  coalesce(sum(jsonb_array_length(coalesce(ip.qr_ids, '[]'::jsonb))), 0) as qrs_de_entradas
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
where p.estado = 'pagado' and p.total > 0 and ip.producto_tipo = 'ticket';

-- 4) ℹ️ Cuántos QR ya se escanearon (debería ser 0 antes del evento)
select count(*) as qrs_ya_escaneados from public.qr_usados;

-- 5) ℹ️ Últimas 15 ventas pagadas con su nº de QR (mirada rápida de sanidad)
select p.id, p.nombre_cliente, p.total, p.fecha_pago,
       (select coalesce(sum(jsonb_array_length(coalesce(i.qr_ids,'[]'::jsonb))),0)
        from public.items_pedido i where i.pedido_id = p.id and i.producto_tipo='ticket') as qrs
from public.pedidos p
where p.estado = 'pagado' and p.total > 0
order by p.fecha_pago desc nulls last
limit 15;
