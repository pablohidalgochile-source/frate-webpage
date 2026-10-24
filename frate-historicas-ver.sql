-- 👀 LAS LISTAS HISTÓRICAS QUE CAMBIARÍAN DE DUEÑO  (SOLO LECTURA)
-- Proyecto WEB · un solo select. NO cambia nada.
--
-- Hoy la lista de un cumpleaños queda a nombre del CUMPLEAÑERO, y por eso él
-- aparece en el informe de pagos. Debería quedar a nombre del ANFITRIÓN que
-- lo atendió — el «responsable» que ya se elige en la ficha.
--
-- Esto muestra, lado a lado, cómo está cada una y cómo quedaría.
-- `responsable` sale de la ficha del formulario; si está vacío, va Aileen Caro.

select
  l.codigo,
  l.fecha,
  l.nombre                                        as lista,
  l.duenio_nombre                                 as dueno_hoy,
  coalesce(
    nullif(btrim(f.gestion->>'responsable'), ''),
    'Aileen Caro'
  )                                               as dueno_nuevo,
  l.duenio_nombre                                 as invita_quedaria,
  (f.id is not null)                              as tiene_ficha,
  (select count(*) from public.lista_inscritos li
    where li.lista_id = l.id)                     as inscritos,
  l.estado
from public.listas l
left join public.formularios f
  on f.gestion->>'lista_codigo' = l.codigo
where (l.codigo like 'CUMPLE-%' or l.codigo like 'RESERVA-%')
  and l.eliminada_at is null
order by l.fecha desc nulls last, l.codigo;
