-- FRATE · MAILING · PÚBLICO «SELECCIÓN» (2 de 2): listado de la selección + lista de campañas con su público
-- Proyecto WEB · SQL Editor · correr DESPUÉS del 04a.
set lock_timeout = '5s';

create or replace function public.campana_seleccion_pagina(p_campana text, p_q text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  with f as (
    select s.email, s.nombre, s.origen, (s.cliente_id is not null) as con_cuenta, s.agregada_at,
           exists (select 1 from campana_envios e where e.campana = s.campana and e.email = s.email and e.estado = 'enviado') as enviado,
           exists (select 1 from correo_bajas b where b.email = s.email) as baja
      from campana_seleccion s
     where s.campana = p_campana
       and (coalesce(btrim(p_q), '') = '' or s.email ilike '%' || btrim(p_q) || '%' or coalesce(s.nombre, '') ilike '%' || btrim(p_q) || '%')
  )
  select jsonb_build_object(
    'total',      (select count(*) from f),
    'con_cuenta', (select count(*) from campana_seleccion where campana = p_campana and cliente_id is not null),
    'sin_cuenta', (select count(*) from campana_seleccion where campana = p_campana and cliente_id is null),
    'filas', coalesce((select jsonb_agg(to_jsonb(g) order by g.agregada_at desc, g.email)
                         from (select * from f order by agregada_at desc, email
                                limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) g), '[]'::jsonb))
$$;

-- Lista de campañas: igual que antes + su público + «colgados» aparte de «en curso».
create or replace function public.campana_listar(p_archivadas boolean default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ultimo desc nulls last), '[]'::jsonb) from (
    select c.id, c.nombre, c.config ->> 'asunto' as asunto, coalesce(c.config ->> 'publico', 'miembros') as publico,
           c.archivada_at, c.creada_at, c.actualizada_at,
           (c.tanda_hasta is not null and c.tanda_hasta > now()) as tanda_en_curso,
           coalesce(e.total, 0) as registros, coalesce(e.enviados, 0) as enviados, coalesce(e.errores, 0) as errores,
           coalesce(e.sin_remedio, 0) as sin_remedio, coalesce(e.en_curso, 0) as en_curso, coalesce(e.colgados, 0) as colgados,
           (select count(*) from campana_seleccion s where s.campana = c.id) as seleccionados,
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
     where p_archivadas is null or (p_archivadas and c.archivada_at is not null) or (not p_archivadas and c.archivada_at is null)
  ) x
$$;

revoke all on function public.campana_seleccion_pagina(text, text, integer, integer), public.campana_listar(boolean) from public, anon, authenticated;
grant execute on function public.campana_seleccion_pagina(text, text, integer, integer), public.campana_listar(boolean) to service_role;
notify pgrst, 'reload schema';

select jsonb_array_length(public.campana_listar(null)) as campanas;
