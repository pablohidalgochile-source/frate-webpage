-- 🧹 CERRAR LAS COPIAS VACÍAS DE CUMPLEAÑOS  ·  proyecto WEB
--
-- OPCIONAL. La portada ya las ignora; esto solo deja la casa ordenada.
--
-- QUÉ TOCA, y nada más que eso:
--   · listas CUMPLE- únicamente
--   · con CERO inscritos
--   · de fecha PASADA
--   · y solo si existe otra lista de la MISMA persona y MISMA fecha que
--     sobrevive (nunca deja a alguien sin ninguna lista)
--
-- NO BORRA. Las pasa a 'cerrada', que es reversible y deja rastro. Borrar
-- filas de las que cuelgan QR e inscripciones es exactamente lo que no se
-- hace en una base con historia.

with vivas as (
  -- la que se queda por cada persona+fecha: la que tiene gente, o la más nueva
  select distinct on (btrim(lower(l.nombre)), l.fecha) l.id
  from public.listas l
  cross join lateral (
    select count(*) as n from public.lista_inscritos li where li.lista_id = l.id
  ) c
  where l.codigo like 'CUMPLE-%' and l.estado = 'aprobada'
  order by btrim(lower(l.nombre)), l.fecha, c.n desc, l.id desc
),
sobran as (
  select l.id
  from public.listas l
  cross join lateral (
    select count(*) as n from public.lista_inscritos li where li.lista_id = l.id
  ) c
  where l.codigo like 'CUMPLE-%'
    and l.estado = 'aprobada'
    and c.n = 0                                   -- sin nadie anotado
    and l.fecha < current_date                    -- ya pasó
    and l.id not in (select id from vivas)        -- y no es la que se queda
)
update public.listas
   set estado = 'cerrada'
 where id in (select id from sobran);


-- ── Chequeo · cómo quedó ──────────────────────────────────────────
select l.fecha,
       btrim(lower(l.nombre))                     as persona,
       count(*) filter (where l.estado = 'aprobada') as abiertas,
       count(*) filter (where l.estado = 'cerrada')  as cerradas
from public.listas l
where l.codigo like 'CUMPLE-%'
group by 1, 2
having count(*) > 1
order by 1 desc
limit 20;
