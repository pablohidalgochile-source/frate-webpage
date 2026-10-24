-- ============================================================
-- FRATE · LOS INGRESOS DE PUERTA DE BESUCONA (los "20")
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · SOLO LEE
-- ============================================================

-- ── 1) La lista, con quién lo dejó pasar ──
select im.created_at::timestamp(0)              as hora,
       im.nombre,
       coalesce(nullif(im.rut,''), '—')        as rut,
       coalesce(nullif(im.motivo,''), '—')     as motivo,
       coalesce(nullif(im.telefono,''), '—')   as telefono,
       coalesce(nullif(im.instagram,''), '—')  as instagram,
       coalesce(c.username, c.nombres, '—')    as lo_registro
from public.ingresos_manuales im
left join public.clientes c on c.id = im.portero_id
where im.evento_id = (select id from public.eventos
                      where nombre ilike '%BESUCONA%' order by fecha desc limit 1)
order by im.created_at;


-- ── 2) ¿Cuadra con los 20 del tablero? ──
-- El tablero cuenta unidades de QR; esto cuenta filas del log. Deben ser iguales.
with ev as (select id from public.eventos where nombre ilike '%BESUCONA%' order by fecha desc limit 1)
select 'filas en ingresos_manuales' as dato, count(*)::text as valor
  from public.ingresos_manuales where evento_id = (select id from ev)
union all
select 'pedidos marcados PUERTA-VIP',
       count(distinct p.id)::text
  from public.pedidos p
  join public.items_pedido ip on ip.pedido_id = p.id
 where ip.evento_id = (select id from ev) and p.referencia_pago = 'PUERTA-VIP'
union all
select 'QR que contienen PUERTA (lo que ve el tablero)',
       count(*)::text
  from public.items_pedido ip, lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q
 where ip.evento_id = (select id from ev) and q ilike '%PUERTA%'
union all
-- ⚠️ Este es el que importa: si sale MAYOR que los anteriores, hay entradas
--    de VENTA cayendo en "Puerta" solo porque su nombre empieza con "Ingreso".
select 'tickets cuyo NOMBRE empieza con "Ingreso" (heurístico frágil)',
       count(*)::text
  from public.items_pedido ip
 where ip.evento_id = (select id from ev) and ip.nombre_ticket ~* '^\s*ingreso\b';


-- ── 3) Los motivos, agrupados: para qué se está usando la puerta ──
select coalesce(nullif(motivo,''), '(sin motivo)') as motivo, count(*) as veces
from public.ingresos_manuales
where evento_id = (select id from public.eventos
                   where nombre ilike '%BESUCONA%' order by fecha desc limit 1)
group by 1 order by 2 desc;
