-- 🔍 REVISIÓN · LOS EVENTOS VENCIDOS, ANTES DE CERRARLOS
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ ESTO NO CIERRA NADA. NO CAMBIA NADA. Solo mira.
--
-- El cierre automático corre de aquí en adelante. Los que ya están
-- vencidos hoy hay que mirarlos una vez, y esa es esta consulta.
--
-- CÓMO LEER LA COLUMNA `veredicto`:
--   ✅ limpio          → nadie quedó colgado, se puede cerrar tranquilo
--   🚨 debes plata     → hay devoluciones sin responder. NO CERRAR.
--   ⚠️ no entraron     → se vendieron entradas que nadie usó. Míralo:
--                        puede ser gente que no llegó (normal) o gente
--                        esperando que le resuelvas algo.
--
-- OJO con `sin_quemar`: cuenta solo los QR que NUNCA pasaron por la
-- puerta. Los quemados por cambio de día o anulados por una devolución
-- no aparecen acá — esos ya están resueltos.

select
  e.id,
  e.nombre,
  e.fecha,
  coalesce(e.estado,'—')                                       as estado_hoy,

  -- Entradas de esa noche
  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.evento_id = e.id)                                  as qr_emitidos,

  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
    join public.qr_usados u on u.qr_id = q.qr and u.incidencia is null
   where ip.evento_id = e.id)                                  as entraron,

  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.evento_id = e.id
     and not exists (select 1 from public.qr_usados u where u.qr_id = q.qr))
                                                               as sin_quemar,

  -- Gente esperando respuesta
  (select count(*) from public.pedidos p
    join public.items_pedido ip on ip.pedido_id = p.id
   where ip.evento_id = e.id and p.dev_estado = 'pendiente')    as dev_pendientes,

  (select count(*) from public.pedidos p
    join public.items_pedido ip on ip.pedido_id = p.id
   where ip.evento_id = e.id and p.dev_estado = 'pendiente'
     and p.dev_opcion = 'abierto')                              as pidieron_dejarla_abierta,

  -- Listas que siguen recibiendo gente para una noche que ya pasó
  (select count(*) from public.listas l
    where l.evento_id = e.id and l.valido_hasta is null)        as listas_abiertas,

  case
    when exists (select 1 from public.pedidos p
                  join public.items_pedido ip on ip.pedido_id = p.id
                 where ip.evento_id = e.id and p.dev_estado = 'pendiente')
      then '🚨 debes plata — no cerrar'
    when (select count(*) from public.items_pedido ip
           cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
          where ip.evento_id = e.id
            and not exists (select 1 from public.qr_usados u where u.qr_id = q.qr)) > 0
      then '⚠️ no entraron — míralo'
    else '✅ limpio'
  end                                                           as veredicto

from public.eventos e
where e.fecha is not null
  and coalesce(e.estado,'') not in ('cerrado','postedicion')
  and not coalesce(e.archivado, false)
  and (e.fecha + interval '2 days') < now()
order by e.fecha desc;
