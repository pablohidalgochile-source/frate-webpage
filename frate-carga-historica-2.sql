-- ═══ carga histórica · PARTE 2 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

-- ── 3) Sus dos listas, a nombre de Cotty ───────────────────────────
-- La cuenta manda; si no la encuentro, queda el texto y el módulo de RRPP
-- la une igual con las otras identidades de Constanza.
with ev as (
  select id from public.eventos where fecha = date '2026-07-02' order by id limit 1
),
cotty as (
  select id, coalesce(nullif('@'||username,'@'),
                      nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),'')) as nom
  from public.clientes
  where rol in ('admin','rrpp')
    and (username ilike 'thiscotty' or username ilike 'cotty'
         or coalesce(nombres,'')||' '||coalesce(apellidos,'') ilike '%constanza%rivera%')
  order by (username ilike 'thiscotty') desc
  limit 1
),
nuevas(nombre, genero, insc, entraron) as (
  values ('CORTESIA MUJER (EMBAJADORA) JUEVES 2 JUL',  'F', 100, 45),
         ('CORTESIA HOMBRE (EMBAJADORA) JUEVES 2 JUL', 'M', 100, 56)
)
insert into public.listas
  (nombre, codigo, fecha, evento_id, duenio_id, duenio_nombre, genero_esperado, cupos,
   estado, tipo, condiciones,
   hist_inscritos, hist_entraron, hist_mujeres, hist_hombres, hist_nota, hist_por, hist_at)
select
  n.nombre,
  'HIST-0207-' || n.genero,
  date '2026-07-02',
  (select id from ev),
  (select id from cotty),
  coalesce((select nom from cotty), 'EMBAJADORA COTTY'),
  n.genero,
  n.insc,
  'cerrada',
  'guest_list',
  jsonb_build_object('titulo', n.nombre, 'carga_historica', true,
                     'texto', 'Noche cargada a mano: la app todavía no registraba ese día.'),
  n.insc, n.entraron,
  case when n.genero = 'F' then n.entraron else 0 end,
  case when n.genero = 'M' then n.entraron else 0 end,
  'Declarado por el dueño el 2026-08-03. No salió del escáner.',
  'carga histórica',
  now()
from nuevas n
where not exists (select 1 from public.listas l where l.codigo = 'HIST-0207-' || n.genero);


-- ── 4) Una sola fuente por lista: lo escaneado + lo declarado ──────
-- Antes los tres RPC sumaban desde v_rrpp_personas, que cuenta personas.
-- Una noche declarada no tiene personas, así que valía 0. Esta vista une
-- las dos cosas SIN mezclarlas: cada fila dice si es histórica o no.
drop view if exists public.v_rrpp_listas cascade;
