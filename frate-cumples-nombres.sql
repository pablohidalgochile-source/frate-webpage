-- 👀 CÓMO SE VA A VER CADA NOMBRE EN LA PORTADA  (SOLO LECTURA)
-- Proyecto WEB · un solo select, no cambia nada.
--
-- La portada pública muestra SOLO EL PRIMER NOMBRE: cualquiera con el link la
-- ve, y no tiene por qué leer el apellido de tus clientes.
-- Esto muestra, lado a lado, el nombre completo de la lista y lo que va a
-- aparecer. Si alguno sale raro, lo arreglo antes de que lo vea nadie.

select
  l.nombre                                   as nombre_de_la_lista,
  initcap(split_part(
    btrim(regexp_replace(l.nombre, '^\s*Cumplea(ñ|n)os de\s*', '', 'i')), ' ', 1))
                                             as se_vera_asi,
  l.fecha,
  coalesce(l.cupos, 0)                       as cupos,
  (select count(*) from public.lista_inscritos li
    where li.lista_id = l.id)                as anotados
from public.listas l
where l.codigo like 'CUMPLE-%'
  and l.estado = 'aprobada'
order by l.fecha desc nulls last, l.nombre
limit 25;
