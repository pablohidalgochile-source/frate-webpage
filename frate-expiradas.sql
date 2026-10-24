-- 💸 LAS 490 EXPIRADAS · cuánta plata quedó en el camino
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · solo lecturas
--
-- «Expirado» = la persona armó su compra, recibió el link de pago y NO pagó
-- dentro de 30 minutos. El sistema le suelta el cupo y marca la orden.
-- No es un error del sistema: es un carro abandonado.

-- ── 1) El tamaño del problema ─────────────────────────────────────
select count(*)                                              as ordenes,
       count(distinct lower(btrim(email_cliente)))            as personas,
       to_char(sum(coalesce(total,0)), 'FM$999G999G999')      as plata_que_no_entro,
       to_char(avg(coalesce(total,0))::int, 'FM$999G999G999') as ticket_promedio,
       min(created_at)::date                                  as desde,
       max(created_at)::date                                  as hasta
from public.pedidos
where estado = 'expirado';


-- ── 2) ¿Cuántos de esos abandonaron pero DESPUÉS sí compraron? ────
-- Los que no aparecen acá son los que se perdieron de verdad.
select count(*) filter (where compro_despues)     as se_recuperaron_solos,
       count(*) filter (where not compro_despues) as se_perdieron,
       to_char(sum(total) filter (where not compro_despues), 'FM$999G999G999') as plata_perdida
from (
  select e.id, e.total,
         exists (select 1 from public.pedidos p2
                  where p2.estado = 'pagado'
                    and lower(btrim(p2.email_cliente)) = lower(btrim(e.email_cliente))
                    and p2.created_at > e.created_at) as compro_despues
  from public.pedidos e
  where e.estado = 'expirado' and coalesce(e.email_cliente,'') <> ''
) x;


-- ── 3) Por evento · dónde se cae más gente ────────────────────────
select coalesce(ev.nombre, '(sin evento)')                as evento,
       ev.fecha,
       count(*)                                           as abandonos,
       to_char(sum(p.total), 'FM$999G999G999')            as plata
from public.pedidos p
left join lateral (
  select i.evento_id from public.items_pedido i where i.pedido_id = p.id limit 1
) it on true
left join public.eventos ev on ev.id = it.evento_id
where p.estado = 'expirado'
group by 1, 2
order by count(*) desc
limit 15;


-- ── 4) A quién le vale la pena escribirle ─────────────────────────
-- Abandonaron, nunca compraron, y el evento TODAVÍA no pasa.
select 'FCC-'||lpad(p.id::text,6,'0') as orden,
       p.nombre_cliente, p.email_cliente, p.total, p.created_at::date as abandono,
       ev.nombre as evento, ev.fecha
from public.pedidos p
left join lateral (
  select i.evento_id from public.items_pedido i where i.pedido_id = p.id limit 1
) it on true
left join public.eventos ev on ev.id = it.evento_id
where p.estado = 'expirado'
  and coalesce(p.email_cliente,'') <> ''
  and ev.fecha >= current_date
  and not exists (select 1 from public.pedidos p2
                   where p2.estado='pagado'
                     and lower(btrim(p2.email_cliente)) = lower(btrim(p.email_cliente)))
order by p.total desc
limit 50;
