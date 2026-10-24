-- 🎂 UN SOLO LINK PARA TODOS LOS CUMPLEAÑOS DEL DÍA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- QUÉ RESUELVE:
--   La anfitriona creaba una lista por cumpleañero —bien— pero después tenía
--   que repartir OCHO links distintos y acordarse de cuál era de quién.
--   Ahora manda uno solo. Quien lo abre elige su cumpleaños y cae en la lista
--   individual de siempre.
--
-- LO QUE NO CAMBIA: sigue habiendo UNA LISTA POR CUMPLEAÑERO, con su cupo,
--   su zona y su mesa. Los links individuales siguen funcionando igual. Esto
--   es una portada que reparte, no un reemplazo.
--
-- PRIVACIDAD: la función devuelve SOLO EL PRIMER NOMBRE. Cualquiera con el
--   link ve esta portada, y no tiene por qué leer el apellido de tus clientes.

create table if not exists public.cumple_links (
  codigo      text primary key,
  fecha       date not null,
  evento_id   int references public.eventos(id),
  creado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

alter table public.cumple_links enable row level security;

drop policy if exists cumple_links_admin on public.cumple_links;
create policy cumple_links_admin on public.cumple_links for all
  using (exists (select 1 from public.clientes c
                  where c.id = auth.uid() and c.rol in ('admin','rrpp')));


-- ── La portada pública ────────────────────────────────────────────
-- No enumera: hay que traer el código. Devuelve nombre corto + el código de
-- la lista individual, que es lo único que la página necesita para mandarte
-- al lugar correcto.
create or replace function public.cumples_del_dia(p_codigo text)
returns table (nombre text, codigo text, cupos int, tomados int, lleno boolean, fecha date)
language sql stable security definer set search_path = public as $$
  select
    -- "Cumpleaños de Tasnim Arcos Spataro" → "Tasnim"
    initcap(split_part(
      btrim(regexp_replace(l.nombre, '^\s*Cumplea(ñ|n)os de\s*', '', 'i')), ' ', 1)),
    l.codigo::text,
    coalesce(l.cupos, 0)::int,
    c.n::int,
    (coalesce(l.cupos, 0) > 0 and c.n >= l.cupos),
    h.fecha
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
  order by 1
$$;

revoke execute on function public.cumples_del_dia(text) from public;
grant  execute on function public.cumples_del_dia(text) to anon, authenticated;


-- ── Chequeo ───────────────────────────────────────────────────────
select 'cumple_links' as tabla,
       (select count(*) from public.cumple_links) as portadas,
       (select count(*) from public.listas
         where codigo like 'CUMPLE-%' and estado = 'aprobada') as listas_de_cumple;
