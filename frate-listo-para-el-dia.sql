-- ✅ ¿ESTÁ TODO LISTO PARA LA NOCHE? — revisión previa
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- Córrela la mañana del evento. Revisa de una vez las cinco cosas que,
-- si faltan, se notan recién cuando ya es tarde:
--
--   1. El evento está publicado y con hora de término (si no, el cierre
--      automático no sabe cuándo terminó la noche).
--   2. Tiene entradas cargadas, activas y con stock.
--   3. Ninguna entrada de venta quedó en $0 por error.
--   4. Tiene sus listas de cortesía armadas.
--   5. Cada lista tiene dueña, y esa dueña EXISTE como cuenta — si no,
--      no se le puede pagar sus $500 por persona escaneada.
--
-- Mira los próximos 10 días. Lo que salga en ❌ es lo que falta.

select
  e.fecha,
  e.nombre,

  case when coalesce(e.estado,'') <> 'publicado' then '❌ ' || coalesce(e.estado,'sin estado')
       when coalesce(nullif(e.hora_termino::text,''),'') = ''    then '⚠️ sin hora de término'
       else '✅ publicado' end                                    as evento,

  (select count(*) from public.tipos_ticket t
    where t.evento_id = e.id and coalesce(t.estado,'') <> 'Oculto')  as tipos,

  case when (select coalesce(sum(t.disponible),0) from public.tipos_ticket t
              where t.evento_id = e.id and coalesce(t.estado,'') <> 'Oculto') = 0
       then '❌ sin stock'
       else '✅ ' || (select coalesce(sum(t.disponible),0)::text from public.tipos_ticket t
                       where t.evento_id = e.id and coalesce(t.estado,'') <> 'Oculto') || ' cupos'
  end                                                              as stock,

  -- Una entrada de venta en $0 se regala sin querer.
  case when exists (select 1 from public.tipos_ticket t
                     where t.evento_id = e.id
                       and coalesce(t.estado,'') <> 'Oculto'
                       and coalesce(t.precio,0) = 0)
       then '🚨 hay entrada en $0' else '✅ precios ok' end         as precios,

  case when (select count(*) from public.listas l where l.evento_id = e.id) = 0
       then '❌ sin listas armadas'
       else '✅ ' || (select count(*)::text from public.listas l where l.evento_id = e.id) || ' listas'
  end                                                              as listas,

  -- La dueña tiene que existir como cuenta para que el pago salga solo.
  coalesce((select string_agg(l.nombre, ' · ')
            from public.listas l
            where l.evento_id = e.id
              and coalesce(btrim(l.duenio_nombre),'') <> ''
              and public.rrpp_cuenta_de_texto(l.duenio_nombre) is null),
           '✅ todas con cuenta')                                  as duenas_sin_cuenta

from public.eventos e
where e.fecha between current_date and current_date + 10
  and not coalesce(e.archivado, false)
order by e.fecha;
