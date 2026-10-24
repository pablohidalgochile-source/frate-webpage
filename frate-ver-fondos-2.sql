-- 🖼️ ¿Dónde se pierde el fondo? Solo LEE.
-- Compara TRES lugares para la misma lista:
--   ① la tabla real          ② la vista pública      ③ la función que usa el link
-- Si ① tiene y ② o ③ no, el problema es la vista/función, no el guardado.

select
  l.id,
  l.codigo,
  left(l.nombre, 34)                                  as lista,
  (l.condiciones ? 'portada')                         as en_la_tabla,
  (v.condiciones ? 'portada')                         as en_la_vista,
  (f.condiciones ? 'portada')                         as en_la_funcion,
  l.condiciones->'portada'->>'modo'                   as modo,
  left(coalesce(l.condiciones->'portada'->>'url',
                l.condiciones->'portada'->>'yt',
                l.condiciones->'portada'->>'color'), 60) as fondo,
  'https://www.frate.cl/lista/'||l.codigo||'?debug=1'  as abre_este_link
from public.listas l
left join public.v_lista_publica v on v.codigo = l.codigo
left join lateral public.lista_publica(l.codigo) f on true
where l.eliminada_at is null
  and l.condiciones ? 'portada'
order by l.id desc
limit 10;
