-- ============================================================
-- FRATE · CHECK-INS POR ORIGEN — lo que pidió el ERP
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- POR QUÉ: el ERP comparó nuestros 459 check-ins contra 280 pulseras de
-- preventa y creyó que faltaban 21. No faltaban: los 459 son preventa (279)
-- + cumpleaños (127) + listas VIP (28) + cortesías (25). Al partirlos, la
-- preventa calza en UNA persona contra las pulseras moradas.
--
-- ⚠️ ADEMÁS ARREGLA UN CONTEO MALO NUESTRO. `sync-erp` calculaba
--    `totales.check_ins` solo con los QR que aparecían en la MISMA ventana de
--    sincronización. Un check-in cuya entrada se emitió el día anterior no se
--    contaba nunca. Esta función cuenta el evento COMPLETO, siempre.
--
-- Se hace en la base y no en el código porque corre en cada check-in: una
-- consulta agregada e indexada es barata; traerse el evento entero a memoria
-- 459 veces en una noche, no.
--
-- Idempotente.
-- ============================================================

create or replace function public.evento_checkins_por_origen(p_evento_id int)
returns jsonb language sql stable security definer set search_path = public as $$
  with qr as (
    -- Cada QR emitido del evento, con lo que se sabe de su origen.
    select q.v                                        as qr_id,
           coalesce(p.total_pagado, p.total, 0)       as pagado,
           upper(coalesce(ip.nombre_ticket, ''))      as ticket,
           li.lista_id                                as lista_id
      from public.items_pedido ip
      join public.pedidos p on p.id = ip.pedido_id
      cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids, '[]'::jsonb)) q(v)
      left join public.lista_inscritos li on li.pedido_cortesia_id = ip.pedido_id
     where ip.evento_id = p_evento_id
       and p.estado = 'pagado'
  ),
  entro as (
    -- Solo los que de verdad pasaron por la puerta. `qr_usados` tiene índice
    -- único en qr_id: un ticket NO puede contarse dos veces.
    select qr.* from qr join public.qr_usados u on u.qr_id = qr.qr_id
  ),
  clasificado as (
    select case
             when pagado > 0            then 'preventa'
             when ticket like '%CUMPLE%' then 'cumpleanos'
             when lista_id is not null  then 'listas'
             else 'cortesia'
           end as origen
      from entro
  )
  select jsonb_build_object(
    'preventa',   count(*) filter (where origen = 'preventa'),
    'cumpleanos', count(*) filter (where origen = 'cumpleanos'),
    'listas',     count(*) filter (where origen = 'listas'),
    'cortesia',   count(*) filter (where origen = 'cortesia'),
    'total',      count(*)
  ) from clasificado;
$$;
grant execute on function public.evento_checkins_por_origen(int) to authenticated, service_role;


-- ── Verificación con CELOSA (evento 19) ──
-- Debería dar: preventa 279 · cumpleanos 127 · listas 28 · cortesia 25 · total 459
select public.evento_checkins_por_origen(19) as celosa;

-- Y los últimos 5 eventos con gente, para ver que se comporta:
select e.id, e.nombre, e.fecha, public.evento_checkins_por_origen(e.id) as por_origen
from public.eventos e
where exists (select 1 from public.items_pedido ip where ip.evento_id = e.id)
order by e.fecha desc limit 5;

-- ============================================================
-- QUÉ SE MANDA AL ERP
-- En `totales`, como pidieron (no como tipo nuevo):
--   { tipo:'totales', evento_web_id, entradas, recaudado, check_ins,
--     check_ins_por_origen: { preventa, cumpleanos, listas, cortesia, total } }
--
-- `check_ins` pasa a ser el `total` de acá: el conteo completo del evento,
-- no solo lo que cayó en la ventana de sincronización.
-- ============================================================
