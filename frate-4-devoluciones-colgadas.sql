-- 🚨 LAS 4 DEVOLUCIONES QUE QUEDARON SIN RESPONDER
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- LO PRIMERO, PARA QUE ESTÉS TRANQUILO:
--   Cerrar el evento NO escondió estas solicitudes. La bandeja de
--   devoluciones filtra solo por `dev_estado = 'pendiente'` y no mira el
--   estado del evento, así que las 4 siguen apareciéndote en el módulo y
--   las puedes responder sin reabrir nada.
--
-- LO QUE ESTO VIENE A RESPONDER:
--   La función tiene un candado para NO cerrar un evento con devoluciones
--   pendientes. Que igual quedaran cerrados puede ser por dos razones muy
--   distintas, y hay que saber cuál:
--
--   a) La persona pidió la devolución DESPUÉS de que el evento se cerró.
--      Entonces el candado nunca falló: no había nada que proteger en ese
--      momento. Es lo esperable, porque /mi-entrada deja pedir después
--      del evento con el PIN.
--
--   b) Ya estaba pedida ANTES y se cerró igual. Eso sería un error mío y
--      hay que arreglar la función.
--
--   La columna `veredicto` compara la hora del pedido con la primera
--   corrida del reloj y te dice cuál de las dos fue.

select
  'FCC-' || lpad(p.id::text, 6, '0')                     as orden,
  p.nombre_cliente,
  p.email_cliente,
  e.nombre                                               as evento,
  e.fecha                                                as noche,
  p.total_pagado,
  p.dev_opcion                                           as que_pidio,
  p.dev_motivo,
  p.dev_solicitada_at                                    as pidio_el,

  (select min(d.start_time) from cron.job_run_details d
     join cron.job j on j.jobid = d.jobid
    where j.jobname = 'frate-cerrar-eventos')            as reloj_desde,

  case
    when (select min(d.start_time) from cron.job_run_details d
            join cron.job j on j.jobid = d.jobid
           where j.jobname = 'frate-cerrar-eventos') is null
      then '❓ el reloj no ha corrido nunca — el evento se cerró a mano'
    when p.dev_solicitada_at >= (select min(d.start_time) from cron.job_run_details d
                                   join cron.job j on j.jobid = d.jobid
                                  where j.jobname = 'frate-cerrar-eventos')
      then '✅ la pidió DESPUÉS — el candado no falló'
    else '⚠️ ya estaba pedida ANTES — revisar la función'
  end                                                    as veredicto

from public.pedidos p
join public.eventos e
  on e.id = (select ip.evento_id from public.items_pedido ip
              where ip.pedido_id = p.id and ip.evento_id is not null limit 1)
where p.dev_estado = 'pendiente'
order by p.dev_solicitada_at desc nulls last;
