-- === Lo que FLYER pidio: la plantilla real de entradas de la WEB ===
-- FLYER precarga sus propios defaults porque no tiene de donde leer los
-- nuestros. Esta vista expone la plantilla de verdad: la que Pablo edita en
-- Configuracion, guardada como JSON en config_valores.ticket_presets.
--
-- Se expone `clase` ademas de los dos booleanos que ellos pidieron. Sus dos
-- booleanos son 4 combinaciones pero solo distinguen 2 cosas; nuestra clase
-- distingue venta / cortesia / puerta / prueba sin que nadie deduzca nada.
--
-- OJO para quien lea esto: precio 0 NO significa cortesia. LISTA VIP AIRE
-- vale $0 en el catalogo y se vendio en $295.000. Por eso `es_cortesia`
-- sale de la clase declarada, nunca del precio.
-- Idempotente.

drop view if exists public.flyer_plantillas_entradas;
create view public.flyer_plantillas_entradas as
with base as (
  select (select nullif(valor,'') from public.config_valores where clave='ticket_presets') as j
),
filas as (
  select k.plantilla, r.fila, r.i
  from base
  cross join lateral (values ('semana'), ('finde')) k(plantilla)
  cross join lateral jsonb_array_elements(
    coalesce((base.j::jsonb) -> k.plantilla, '[]'::jsonb)
  ) with ordinality r(fila, i)
  where base.j is not null
)
select
  -- `dia` expandido para que FLYER agrupe como pidio; `plantilla` es el
  -- nombre real nuestro, para no perderlo en la traduccion.
  d.dia,
  f.plantilla,
  f.fila->>'nombre'                                     as nombre,
  coalesce((f.fila->>'precio')::int, 0)                 as precio,
  coalesce(nullif(f.fila->>'genero',''), c.genero, '')  as genero,
  coalesce((f.fila->>'disponible')::int, 0)             as cupo,
  coalesce(c.clase, 'venta')                            as clase,
  coalesce(c.clase, 'venta') <> 'cortesia'
    and coalesce(c.activo, true)                        as publicado,
  coalesce(c.clase, 'venta') = 'cortesia'               as es_cortesia,
  f.i::int                                              as orden,
  c.id                                                  as catalogo_id
from filas f
left join public.catalogo_tickets c
  on upper(btrim(c.nombre)) = upper(btrim(f.fila->>'nombre'))
cross join lateral (
  select unnest(case when f.plantilla = 'semana'
                     then array['Jueves']
                     else array['Viernes','Sabado'] end) as dia
) d;

grant select on public.flyer_plantillas_entradas to anon, authenticated;

select dia, plantilla, nombre, precio, genero, cupo, clase, publicado, es_cortesia, orden
from public.flyer_plantillas_entradas order by dia, orden;
