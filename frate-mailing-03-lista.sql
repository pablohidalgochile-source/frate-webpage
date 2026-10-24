-- FRATE · MAILING · administrar campañas (lista con conteos + registro de envíos paginado)
-- Proyecto WEB · SQL Editor · aditivo: 2 columnas nuevas en campanas y 2 funciones nuevas (solo el servidor las usa).
-- Reversa: drop function if exists public.campana_listar(boolean), public.campana_envios_pagina(text,text,text,integer,integer);
set lock_timeout = '5s';

alter table public.campanas add column if not exists nombre text;          -- etiqueta visible (el id no cambia nunca)
alter table public.campanas add column if not exists archivada_at timestamptz;

create or replace function public.campana_listar(p_archivadas boolean default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ultimo desc nulls last), '[]'::jsonb) from (
    select c.id, c.nombre, c.config ->> 'asunto' as asunto, c.archivada_at, c.creada_at, c.actualizada_at,
           (c.tanda_hasta is not null and c.tanda_hasta > now()) as tanda_en_curso,
           coalesce(e.total, 0) as registros, coalesce(e.enviados, 0) as enviados, coalesce(e.errores, 0) as errores,
           coalesce(e.sin_remedio, 0) as sin_remedio, coalesce(e.en_curso, 0) as en_curso, coalesce(e.colgados, 0) as colgados,
           e.primer_envio, e.ultimo_envio, greatest(c.actualizada_at, e.ultimo_envio) as ultimo
      from campanas c
      left join (select campana, count(*) as total,
                        count(*) filter (where estado = 'enviado') as enviados,
                        count(*) filter (where estado = 'error') as errores,
                        count(*) filter (where estado = 'error' and intentos >= 3) as sin_remedio,
                        count(*) filter (where estado = 'enviando' and creado_at > now() - interval '5 minutes') as en_curso,
                        count(*) filter (where estado = 'enviando' and creado_at <= now() - interval '5 minutes') as colgados,
                        min(enviado_at) as primer_envio, max(enviado_at) as ultimo_envio
                   from campana_envios group by campana) e on e.campana = c.id
     where p_archivadas is null
        or (p_archivadas and c.archivada_at is not null)
        or (not p_archivadas and c.archivada_at is null)
  ) x
$$;

create or replace function public.campana_envios_pagina(p_campana text, p_estado text default null, p_q text default null,
                                                        p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  with f as (
    select e.id, e.email, e.estado, e.intentos, e.error, e.creado_at, e.enviado_at,
           exists (select 1 from correo_bajas b where b.email = e.email) as baja
      from campana_envios e
     where e.campana = p_campana
       and (coalesce(p_estado, 'todos') = 'todos'
            or (p_estado = 'enviado'     and e.estado = 'enviado')
            or (p_estado = 'error'       and e.estado = 'error' and e.intentos < 3)
            or (p_estado = 'sin_remedio' and e.estado = 'error' and e.intentos >= 3)
            or (p_estado = 'enviando'    and e.estado = 'enviando' and e.creado_at >  now() - interval '5 minutes')
            or (p_estado = 'colgado'     and e.estado = 'enviando' and e.creado_at <= now() - interval '5 minutes')
            or (p_estado = 'baja'        and exists (select 1 from correo_bajas b where b.email = e.email)))
       and (coalesce(btrim(p_q), '') = '' or e.email ilike '%' || btrim(p_q) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'filas', coalesce((select jsonb_agg(to_jsonb(g) order by g.enviado_at desc nulls first, g.id desc)
                         from (select * from f order by enviado_at desc nulls first, id desc
                                limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) g),
                      '[]'::jsonb))
$$;

revoke all on function public.campana_listar(boolean), public.campana_envios_pagina(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.campana_listar(boolean), public.campana_envios_pagina(text, text, text, integer, integer) to service_role;
notify pgrst, 'reload schema';

select jsonb_array_length(public.campana_listar(null)) as campanas_guardadas;
