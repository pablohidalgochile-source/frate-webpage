-- 🗂️ TRES GRUPOS EN EL INFORME · parte 1 de 2
-- Proyecto WEB · idempotente. Agrega una columna y clasifica a todos.
--
-- El informe mezclaba tres cosas: una promotora que cobra, admins que traen
-- gente pero no cobran, e identidades del local que ni siquiera son personas.
-- Todas con las mismas columnas y todas con plata al lado.
--
-- REGLA DE PABLO: solo @thiscotty cobra ($500 por persona escaneada).
-- Todos los demás aparecen con su gente, sin plata.

alter table public.rrpp_pago
  add column if not exists grupo text not null default 'equipo'
  check (grupo in ('rrpp','equipo','casa'));


-- ── Clasificar a todos de una vez ─────────────────────────────────
-- Se toman las claves REALES desde la vista del informe, para no depender
-- de que yo adivine cómo se llama cada una.
insert into public.rrpp_pago (clave, nombre, paga, tarifa, grupo, nota)
select distinct on (p.clave)
  p.clave,
  p.rrpp_nombre,
  -- solo cotty cobra
  (public.rrpp_norm(p.rrpp_nombre) like '%thiscotty%')                        as paga,
  case when public.rrpp_norm(p.rrpp_nombre) like '%thiscotty%' then 500 end   as tarifa,
  case
    when public.rrpp_norm(p.rrpp_nombre) like '%thiscotty%'    then 'rrpp'
    -- la casa: identidades del local, no personas
    when p.rrpp_nombre ilike '%invitafrate%'
      or p.rrpp_nombre ilike 'FRATE%'
      or p.rrpp_nombre ilike '%anfitri%'
      or p.rrpp_nombre ilike '%(sin due%'                      then 'casa'
    else 'equipo'                                              -- admins
  end                                                                         as grupo,
  'clasificado automáticamente'                                               as nota
from public.v_rrpp_personas p
where p.clave is not null
on conflict (clave) do nothing;   -- lo que ya editaste a mano NO se pisa


-- ── Chequeo ───────────────────────────────────────────────────────
select grupo,
       count(*)                          as identidades,
       count(*) filter (where paga)      as cobran,
       string_agg(nombre, ' · ' order by nombre) as quienes
from public.rrpp_pago
group by grupo
order by grupo;
