-- ═══ carga histórica · PARTE 6 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

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
