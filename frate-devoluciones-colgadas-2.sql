-- 🚨 LAS DEVOLUCIONES SIN RESPONDER · versión corregida
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- DOS ARREGLOS SOBRE LA CONSULTA ANTERIOR:
--
-- 1) Se perdía una. Tenía `join eventos` (interno), así que un pedido
--    cuyos items no traen evento_id se caía de la lista. Por eso decía
--    4 pendientes y salieron 3. Ahora es `left join`: salen todas.
--
-- 2) El veredicto afirmaba de más. Decía «revisar la función» solo
--    porque la solicitud era anterior a la primera corrida del reloj.
--    Eso NO prueba que el reloj haya cerrado el evento — pudo estar
--    cerrado a mano desde antes. La columna `candado` de acá sí lo
--    prueba, y explico cómo abajo.
--
-- CÓMO SE LEE `candado`:
--   La función excluye del cierre a todo evento que tenga una devolución
--   pendiente. Si HOY el candado ve pendientes en ese evento, y esas
--   solicitudes ya existían cuando el reloj corrió por primera vez
--   (11-08 10:07), entonces en ese momento también las veía — o sea que
--   la función NUNCA metió ese evento en la lista de cerrar.
--   Conclusión: si sale 🔒, ese evento se cerró a mano antes, no por el
--   reloj, y el candado está bien.

select
  'FCC-' || lpad(p.id::text, 6, '0')                  as orden,
  p.nombre_cliente,
  p.email_cliente,
  p.total_pagado,
  p.dev_opcion                                        as que_pidio,
  p.dev_motivo,
  p.dev_solicitada_at                                 as pidio_el,
  coalesce(e.nombre, '— sin evento asociado —')       as evento,
  e.fecha                                             as noche,
  coalesce(e.estado, '—')                             as estado_evento,

  case
    when e.id is null
      then '➕ esta es la que faltaba (sus items no traen evento)'
    when exists (select 1 from public.pedidos p2
                  join public.items_pedido ip2 on ip2.pedido_id = p2.id
                 where ip2.evento_id = e.id and p2.dev_estado = 'pendiente')
      then '🔒 el candado sí ve este evento — el reloj no lo cerró'
    else '🚨 el candado no lo ve — hay que arreglar la función'
  end                                                 as candado

from public.pedidos p
left join public.eventos e
  on e.id = (select ip.evento_id from public.items_pedido ip
              where ip.pedido_id = p.id and ip.evento_id is not null limit 1)
where p.dev_estado = 'pendiente'
order by p.dev_solicitada_at desc nulls last;
