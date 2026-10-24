-- ============================================================
-- FRATE · sacar el paréntesis de temporada del nombre de las 3 noches
--
-- Queda el nombre limpio y la temporada pasa a vivir en el banner de la
-- portada, que la lee de `brief.produccion.temporada.nombre` ("Halloween 2026").
-- Es el mismo movimiento de siempre: el dato sale del texto y pasa a su campo.
--
--   CARNE FRESCA (SENSUAL Y ESTUPIDO HALLOWEEN - JUEVES)  →  CARNE FRESCA
--
-- SEGURO: toca `eventos.nombre`, NO `tipos_ticket.nombre`. La puerta indexa por
-- el nombre del TIPO, no por el del evento, así que esto no afecta a las 4
-- entradas ya vendidas ni a ninguna futura.
-- ============================================================

begin;

update public.eventos
   set nombre = btrim(regexp_replace(nombre, '\s*\(.*\)\s*$', ''))
 where id in (59, 60, 61)
   and nombre like '%(%';

commit;

-- Control: tienen que quedar los tres limpios, y su temporada intacta en el brief.
select id, nombre, brief->'produccion'->'temporada'->>'nombre' as temporada
  from public.eventos where id in (59,60,61) order by id;
