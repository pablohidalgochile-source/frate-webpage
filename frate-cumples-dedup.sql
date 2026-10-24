-- 🎂 QUE LA PORTADA NO MUESTRE CUATRO VECES A LA MISMA PERSONA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · reemplaza la función, no borra nada
--
-- POR QUÉ:
--   Hay listas de cumpleaños duplicadas —MARTIN aparece 4 veces el 31-jul,
--   ANTONIA 2— porque el botón «Crear lista» guarda el link en la ficha AL
--   FINAL: dos clics seguidos leen la ficha vacía y crean dos listas. Y el
--   aviso «¿Crear otra igual?» crea la copia si aprietas Aceptar.
--
--   Eso ya está en la base. La portada pública no tiene por qué mostrarlo.
--
-- LA REGLA:
--   Una fila por PERSONA (nombre completo de la lista, no el primer nombre:
--   dos Camilas distintas son dos personas). Entre las copias gana LA QUE YA
--   TIENE GENTE ANOTADA — si los invitados de Martín se anotaron en la
--   tercera copia, esa es la viva. Si ninguna tiene gente, la más nueva.

create or replace function public.cumples_del_dia(p_codigo text)
returns table (nombre text, codigo text, cupos int, tomados int, lleno boolean, fecha date)
language sql stable security definer set search_path = public as $$
  with candidatas as (
    select
      l.id,
      l.nombre as completo,
      l.codigo::text as codigo,
      coalesce(l.cupos, 0)::int as cupos,
      c.n::int as tomados,
      h.fecha,
      row_number() over (
        partition by btrim(lower(l.nombre))
        order by c.n desc, l.id desc          -- gana la que tiene gente; luego la más nueva
      ) as pos
    from public.cumple_links h
    join public.listas l
      on (h.evento_id is not null and l.evento_id = h.evento_id)
      or (h.evento_id is null and l.fecha = h.fecha)
    cross join lateral (
      select count(*) as n from public.lista_inscritos li where li.lista_id = l.id
    ) c
    where h.codigo = upper(btrim(p_codigo))
      and l.codigo like 'CUMPLE-%'
      and l.estado = 'aprobada'
  )
  select
    initcap(split_part(
      btrim(regexp_replace(completo, '^\s*Cumplea(ñ|n)os de\s*', '', 'i')), ' ', 1)),
    codigo, cupos, tomados,
    (cupos > 0 and tomados >= cupos),
    fecha
  from candidatas
  where pos = 1
  order by 1
$$;

revoke execute on function public.cumples_del_dia(text) from public;
grant  execute on function public.cumples_del_dia(text) to anon, authenticated;


-- ── Chequeo · qué listas de cumpleaños están duplicadas ───────────
select btrim(lower(l.nombre)) as persona,
       l.fecha,
       count(*)                                    as copias,
       sum((select count(*) from public.lista_inscritos li
             where li.lista_id = l.id))            as anotados_en_total,
       string_agg(l.codigo, ' · ' order by l.id)   as codigos
from public.listas l
where l.codigo like 'CUMPLE-%' and l.estado = 'aprobada'
group by 1, 2
having count(*) > 1
order by 3 desc, 2 desc
limit 20;
