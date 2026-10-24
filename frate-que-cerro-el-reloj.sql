-- 🔎 ¿QUÉ CERRÓ EL RELOJ? — la revisión, pero al revés
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. Es UNA SOLA consulta.
--
-- QUÉ PASÓ:
--   La idea era que revisaras los vencidos ANTES de cerrarlos. Pero al
--   correr la parte 2 quedó el reloj andando, y alcanzó a pasar por
--   arriba de los que ya estaban vencidos. Por eso la revisión te salió
--   vacía: no es que no hubiera, es que ya están cerrados.
--
--   Los candados igual funcionaron: NO cierra un evento con devoluciones
--   pendientes, y NO toca listas sin evento asociado. Así que esto es
--   para confirmarlo con números, no para asustarse.
--
-- CÓMO LEER `veredicto`:
--   ✅ bien cerrado  → nadie quedó colgado
--   ⚠️ míralo        → se vendieron entradas que nadie usó
--   🚨 reabrir       → hay devoluciones sin responder (no debió cerrarse)

select
  e.id,
  e.nombre,
  e.fecha,
  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.evento_id = e.id)                                as qr_emitidos,

  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
    join public.qr_usados u on u.qr_id = q.qr and u.incidencia is null
   where ip.evento_id = e.id)                                as entraron,

  (select count(*) from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.evento_id = e.id
     and not exists (select 1 from public.qr_usados u where u.qr_id = q.qr))
                                                             as sin_quemar,

  (select count(*) from public.pedidos p
    join public.items_pedido ip on ip.pedido_id = p.id
   where ip.evento_id = e.id and p.dev_estado = 'pendiente')  as dev_pendientes,

  (select count(*) from public.listas l
    where l.evento_id = e.id and l.valido_hasta is not null)  as listas_cerradas,

  case
    when exists (select 1 from public.pedidos p
                  join public.items_pedido ip on ip.pedido_id = p.id
                 where ip.evento_id = e.id and p.dev_estado = 'pendiente')
      then '🚨 reabrir — quedaron devoluciones sin responder'
    when (select count(*) from public.items_pedido ip
           cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
          where ip.evento_id = e.id
            and not exists (select 1 from public.qr_usados u where u.qr_id = q.qr)) > 0
      then '⚠️ míralo — hay entradas que nadie usó'
    else '✅ bien cerrado'
  end                                                        as veredicto

from public.eventos e
where e.estado = 'cerrado'
  and e.fecha is not null
  and e.fecha > (current_date - interval '120 days')
order by e.fecha desc;


-- ── SI ALGUNO HAY QUE REABRIR ─────────────────────────────────────
-- Descomenta, pon el id y córrelo aparte. Devuelve el evento a
-- publicado y reabre sus listas. El reloj no lo va a volver a cerrar
-- mientras tenga una devolución pendiente.
--
--   update public.eventos set estado = 'publicado' where id = 999;
--   update public.listas set valido_hasta = null where evento_id = 999;
