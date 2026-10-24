-- 📊 RESUMEN DE LAS HISTÓRICAS  (SOLO LECTURA)
-- Para decidir la migración con números, no a ojo.

select
  count(*)                                                            as listas,
  count(*) filter (where f.id is not null)                            as con_ficha,
  count(*) filter (where nullif(btrim(f.gestion->>'responsable'),'') is not null)
                                                                      as con_responsable_real,
  count(*) filter (where f.id is not null
                     and nullif(btrim(f.gestion->>'responsable'),'') is null)
                                                                      as ficha_pero_sin_responsable,
  count(*) filter (where f.id is null)                                as sin_ficha,
  count(distinct nullif(btrim(f.gestion->>'responsable'),''))         as anfitriones_distintos,
  sum((select count(*) from public.lista_inscritos li where li.lista_id = l.id)) as inscritos_totales,
  count(*) filter (where l.estado = 'aprobada')                       as abiertas,
  count(*) filter (where l.estado = 'cerrada')                        as cerradas
from public.listas l
left join public.formularios f on f.gestion->>'lista_codigo' = l.codigo
where (l.codigo like 'CUMPLE-%' or l.codigo like 'RESERVA-%')
  and l.eliminada_at is null;
