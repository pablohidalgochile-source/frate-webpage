-- 🔍 ¿ENTRÓ DE VERDAD O SE LE QUEMÓ EL QR? · una sola consulta, solo lectura
--
-- ⚠️ POR QUÉ IMPORTA: un QR queda en `qr_usados` por TRES motivos distintos:
--    1. La persona pasó por la puerta        → incidencia null
--    2. Un cambio de día quemó el original   → incidencia marcada
--    3. Una devolución lo anuló              → incidencia 'reembolsado'
--
--    Mi consulta anterior los trataba a todos como «YA ENTRÓ». Si el QR se
--    quemó por un cambio de día, la persona NO entró y sí puede ir a la fila
--    de devoluciones. Esto lo separa.
--
-- SEÑAL EXTRA: si varios QR de una misma orden quedan marcados con menos de
-- 2 segundos de diferencia, no fue gente caminando por la puerta — fue una
-- operación en lote. Tres personas no cruzan la puerta en 0,8 segundos.

with usados as (
  select u.qr_id, u.pedido_id, u.created_at, u.incidencia, u.gate_id,
         u.escaneado_por, u.ts_dispositivo,
         'FCC-'||lpad(p.id::text,6,'0')  as orden,
         p.nombre_cliente                as comprador,
         ip.nombre_ticket,
         e.nombre                        as evento,
         e.fecha                         as fecha_evento,
         e.hora                          as abre,
         e.hora_termino                  as cierra,
         -- la marca, en hora de Chile
         (u.created_at at time zone 'America/Santiago') as marca_chile,
         -- ¿cuántos QR de la MISMA orden se marcaron en el mismo segundo?
         count(*) over (partition by u.pedido_id,
                        date_trunc('second', u.created_at)) as en_el_mismo_segundo
  from public.qr_usados u
  join public.pedidos p       on p.id = u.pedido_id
  left join public.items_pedido ip on ip.pedido_id = p.id
                                  and ip.qr_ids ? u.qr_id
  left join public.eventos e  on e.id = ip.evento_id
  where p.id in (4181, 4468, 5982, 5905, 4598, 4761, 5821, 5822, 5261, 5263, 5622, 5624)
)
select orden, comprador, nombre_ticket as ticket, evento, fecha_evento,
       marca_chile,
       coalesce(incidencia, '(ninguna)')       as incidencia,
       coalesce(gate_id, '(sin puerta)')       as gate_id,
       en_el_mismo_segundo,
       case
         when incidencia is not null
           then '🔥 QUEMADO · ' || incidencia || ' — NO entró'
         when gate_id is null and escaneado_por is null
           then '⚠️ marcado sin puerta ni portero — revisar'
         when en_el_mismo_segundo > 1
           then '⚠️ ' || en_el_mismo_segundo || ' en el mismo segundo — parece lote, no puerta'
         when fecha_evento is not null
              and (u2.dentro is false)
           then '⚠️ marcado FUERA del horario del evento — revisar'
         else '🚪 ENTRÓ DE VERDAD'
       end                                     as que_paso
from usados
cross join lateral (
  select ( (marca_chile)::date between fecha_evento - 1 and fecha_evento + 1 ) as dentro
) u2
order by orden, marca_chile;
