-- ═══════════════════════════════════════════════════════════════════
-- 📅 NOCHES QUE PASARON ANTES DE QUE LA APP LAS REGISTRARA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Pablo, 2026-08-03: «Jueves 2 de julio: 45 mujeres y 56 hombres que
-- ingresaron, que quemaron su QR. Cada lista tenía 100 inscritos.»
--
-- ⚠️ LO QUE **NO** SE HACE ACÁ: inventar 200 personas.
--    No existen esos 200 nombres ni sus RUT. Fabricarlos dejaría 200
--    fichas falsas en lista_inscritos y en Personas PARA SIEMPRE,
--    ensuciando frecuentes, duplicados y todo el CRM.
--
-- LO QUE SÍ: la noche se declara en AGREGADO, en la lista misma, con
--    una marca visible. En los reportes esas filas salen etiquetadas
--    «histórico» — un número escrito por una persona nunca se confunde
--    con uno que salió de un escáner.
--
-- Correr DESPUÉS de frate-rrpp-rendimiento.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) Los números declarados viven en la lista ────────────────────
alter table public.listas
  add column if not exists hist_inscritos int,
  add column if not exists hist_entraron  int,
  add column if not exists hist_mujeres   int,
  add column if not exists hist_hombres   int,
  add column if not exists hist_nota      text,
  add column if not exists hist_por       text,
  add column if not exists hist_at        timestamptz;

comment on column public.listas.hist_entraron is
  'Declarado a mano para una noche anterior a la app. NO salió del escáner.';


-- ── 2) La noche del 2 de julio ─────────────────────────────────────
insert into public.eventos (nombre, fecha, estado, activo, archivado)
select 'JUEVES 2 DE JULIO', date '2026-07-02', 'cerrado', false, false
where not exists (select 1 from public.eventos where fecha = date '2026-07-02');


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
create view public.v_rrpp_listas
with (security_invoker = on) as
-- a) lo real: lo que pasó por el escáner
select p.clave, p.rrpp_nombre, p.tiene_cuenta, p.rrpp_id,
       p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo,
       false                                       as historico,
       count(*)::int                               as fichas,
       sum(p.personas_pedidas)::int                as personas_pedidas,
       count(*) filter (where p.genero='F')::int   as fichas_mujer,
       count(*) filter (where p.genero='M')::int   as fichas_hombre,
       count(*) filter (where p.genero not in ('F','M'))::int as fichas_sin_genero,
       sum(p.qr_emitidos)::int                     as qr_emitidos,
       count(*) filter (where p.qr_emitidos = 0)::int as fichas_sin_qr,
       sum(p.entraron)::int                        as entraron
from public.v_rrpp_personas p
group by p.clave, p.rrpp_nombre, p.tiene_cuenta, p.rrpp_id,
         p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo

union all

-- b) lo declarado: solo listas históricas que NO tienen inscritos reales,
--    para que una lista a medio cargar no se cuente dos veces.
select
  public.rrpp_clave_final(
    coalesce(coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))::text,
             'txt:'||public.rrpp_norm(l.duenio_nombre), 'sin-duenio'))    as clave,
  coalesce(nullif('@'||c.username,'@'),
           nullif(btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')),''),
           nullif(btrim(coalesce(l.duenio_nombre,'')),''), '(sin dueño)') as rrpp_nombre,
  (coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre)) is not null) as tiene_cuenta,
  coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))     as rrpp_id,
  l.id, l.nombre, coalesce(e.fecha::date, l.fecha::date), l.evento_id, e.nombre, l.tipo,
  true                                                                    as historico,
  coalesce(l.hist_inscritos,0),
  coalesce(l.hist_inscritos,0),
  coalesce(l.hist_mujeres,0),
  coalesce(l.hist_hombres,0),
  greatest(coalesce(l.hist_inscritos,0) - coalesce(l.hist_mujeres,0) - coalesce(l.hist_hombres,0), 0),
  -- «quemaron su QR» ⇒ los inscritos tenían QR. Es un supuesto, y por eso
  -- la fila va marcada histórica: nadie va a creer que esto se escaneó.
  coalesce(l.hist_inscritos,0),
  0,
  coalesce(l.hist_entraron,0)
from public.listas l
left join public.eventos e on e.id = l.evento_id
left join public.clientes c on c.id = coalesce(l.duenio_id, public.rrpp_cuenta_de_texto(l.duenio_nombre))
where l.eliminada_at is null
  and l.hist_inscritos is not null
  and not exists (select 1 from public.lista_inscritos li where li.lista_id = l.id);


-- ── 5) Los tres RPC leen de la vista nueva ─────────────────────────
create or replace function public.rrpp_rendimiento(
  p_evento int  default null,
  p_desde  date default null,
  p_hasta  date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json; v_tarifa int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin ve el rendimiento de todas las RRPP');
  end if;
  select coalesce((select nullif(valor,'')::int from public.config_valores where clave='rrpp_tarifa'), 500)
    into v_tarifa;

  select coalesce(json_agg(row_to_json(t) order by t.entraron desc, t.personas_pedidas desc), '[]'::json)
    into v from (
    select p.clave,
           coalesce((select a.nombre_final from public.rrpp_alias a
                      where a.clave_final = p.clave and a.nombre_final is not null limit 1),
                    max(p.rrpp_nombre))                       as rrpp,
           bool_or(p.tiene_cuenta)                            as tiene_cuenta,
           count(distinct p.rrpp_nombre)::int                 as identidades,
           count(*) filter (where p.historico)::int           as listas_historicas,
           count(*)::int                                      as listas,
           sum(p.personas_pedidas)::int                       as personas_pedidas,
           sum(p.fichas_mujer)::int                           as fichas_mujer,
           sum(p.fichas_hombre)::int                          as fichas_hombre,
           sum(p.fichas_sin_genero)::int                      as fichas_sin_genero,
           sum(p.qr_emitidos)::int                            as qr_emitidos,
           sum(p.fichas_sin_qr)::int                          as fichas_sin_qr,
           sum(p.entraron)::int                               as entraron,
           greatest(sum(p.qr_emitidos) - sum(p.entraron), 0)::int as no_entraron,
           case when sum(p.qr_emitidos) > 0
                then round(100.0 * sum(p.entraron) / sum(p.qr_emitidos))::int else 0 end as pct,
           v_tarifa                                           as tarifa,
           (sum(p.entraron) * v_tarifa)::int                  as a_pagar,
           min(p.fecha)                                       as desde,
           max(p.fecha)                                       as hasta
    from public.v_rrpp_listas p
    where (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
    group by p.clave
  ) t;

  return jsonb_build_object('ok', true, 'tarifa', v_tarifa, 'rrpp', v);
end; $$;
grant execute on function public.rrpp_rendimiento(int, date, date) to authenticated;


create or replace function public.rrpp_por_lista(
  p_evento int  default null,
  p_desde  date default null,
  p_hasta  date default null,
  p_clave  text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json; v_tarifa int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select coalesce((select nullif(valor,'')::int from public.config_valores where clave='rrpp_tarifa'), 500)
    into v_tarifa;

  select coalesce(json_agg(row_to_json(t) order by t.fecha desc nulls last, t.entraron desc), '[]'::json)
    into v from (
    select p.lista_id, p.lista_nombre as lista, p.fecha, p.evento_id, p.evento_nombre,
           p.clave, p.rrpp_nombre as atribuida_a, p.tiene_cuenta, p.historico,
           p.fichas, p.personas_pedidas, p.fichas_mujer, p.fichas_hombre,
           p.qr_emitidos, p.fichas_sin_qr, p.entraron,
           greatest(p.qr_emitidos - p.entraron, 0) as no_entraron,
           case when p.qr_emitidos > 0
                then round(100.0*p.entraron/p.qr_emitidos)::int else 0 end as pct,
           (p.entraron * v_tarifa)::int as a_pagar
    from public.v_rrpp_listas p
    where (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
      and (p_clave  is null or p.clave = p_clave)
  ) t;

  return jsonb_build_object('ok', true, 'tarifa', v_tarifa, 'listas', v);
end; $$;
grant execute on function public.rrpp_por_lista(int, date, date, text) to authenticated;


-- La liquidación también: si no, se le paga por las noches escaneadas
-- pero no por las cargadas a mano, y el total del panel no calzaría.
create or replace function public.rrpp_liquidar(
  p_clave   text,
  p_evento  int,
  p_tarifa  int,
  p_pagado  boolean default false,
  p_nota    text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v record; v_id bigint;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin liquida');
  end if;
  if coalesce(p_tarifa, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'La tarifa no puede ser negativa');
  end if;

  select coalesce(sum(p.entraron),0)::int as entraron,
         min(p.fecha)                     as fecha,
         max(p.rrpp_nombre)               as nom,
         max(p.rrpp_id::text)             as rid
    into v
  from public.v_rrpp_listas p
  where p.clave = p_clave
    and (p_evento is null or p.evento_id = p_evento);

  if v.entraron is null then
    return jsonb_build_object('ok', false, 'error', 'No encontré gente para esa RRPP en esa noche');
  end if;

  insert into public.rrpp_pagos as r
    (clave, rrpp_id, rrpp_nombre, evento_id, fecha, personas, tarifa, total, estado, nota,
     liquidado_por, liquidado_at, pagado_por, pagado_at)
  values
    (p_clave, nullif(v.rid,'')::uuid, coalesce(nullif(v.nom,''),'(sin dueño)'), p_evento, v.fecha,
     v.entraron, p_tarifa, v.entraron * p_tarifa,
     case when p_pagado then 'pagado' else 'pendiente' end, p_nota,
     v_nom, now(),
     case when p_pagado then v_nom end,
     case when p_pagado then now() end)
  on conflict (clave, coalesce(evento_id, -1)) do update set
     personas      = excluded.personas,
     tarifa        = excluded.tarifa,
     total         = excluded.total,
     nota          = coalesce(excluded.nota, r.nota),
     rrpp_nombre   = excluded.rrpp_nombre,
     fecha         = excluded.fecha,
     estado        = case when r.estado = 'pagado' then 'pagado' else excluded.estado end,
     pagado_por    = case when r.estado <> 'pagado' and p_pagado then v_nom else r.pagado_por end,
     pagado_at     = case when r.estado <> 'pagado' and p_pagado then now() else r.pagado_at end,
     liquidado_por = v_nom,
     liquidado_at  = now()
  returning r.id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'personas', v.entraron,
                            'total', v.entraron * p_tarifa,
                            'estado', case when p_pagado then 'pagado' else 'pendiente' end);
end; $$;
grant execute on function public.rrpp_liquidar(text, int, int, boolean, text) to authenticated;


-- ── 6) Chequeo: la noche del 2 de julio tiene que aparecer ─────────
select l.fecha, l.nombre, l.duenio_nombre,
       l.hist_inscritos as inscritos_declarados,
       l.hist_entraron  as entraron_declarados,
       l.hist_entraron * 500 as a_pagar
from public.listas l
where l.codigo like 'HIST-0207-%'
union all
select null, '━━ TOTAL DEL 2 DE JULIO ━━', null,
       sum(hist_inscritos), sum(hist_entraron), sum(hist_entraron)*500
from public.listas where codigo like 'HIST-0207-%';
