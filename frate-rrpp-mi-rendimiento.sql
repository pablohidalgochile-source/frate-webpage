-- 💸 QUE LA RRPP VEA SU PROPIA PLATA · proyecto WEB (ydwlpra…) · idempotente
-- 🔒 La clave sale de auth.uid(), NUNCA de un parámetro: si viniera del
--    navegador, cualquiera pediría el rendimiento —y la plata— de otra.
-- 📊 Lee de v_rrpp_listas y no de v_rrpp_personas, porque la primera une
--    las noches históricas. Con la otra, a Cotty le faltaría el 2 de julio.

create or replace function public.rrpp_mi_rendimiento(
  p_desde date default null,
  p_hasta date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v_clave text; v_tarifa int; v jsonb;
begin
  select rol, coalesce(nullif('@'||username,'@'),
           nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), 'RRPP')
    into v_rol, v_nom from public.clientes where id = auth.uid();

  if v_rol is null or v_rol not in ('rrpp','admin') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  -- Respeta la fusión de alias: si tiene dos cuentas unidas, ve el total.
  v_clave := public.rrpp_clave_final(auth.uid()::text);

  select coalesce((select nullif(valor,'')::int from public.config_valores
                    where clave='rrpp_tarifa'), 500) into v_tarifa;

  with mias as (
    select l.* from public.v_rrpp_listas l
    where l.clave = v_clave
      and (p_desde is null or l.fecha >= p_desde)
      and (p_hasta is null or l.fecha <= p_hasta)
  ),
  tot as (
    select count(distinct lista_id)::int          as listas,
           coalesce(sum(fichas),0)::int           as inscritos,
           coalesce(sum(entraron),0)::int         as entraron,
           case when coalesce(sum(qr_emitidos),0) > 0
                then round(100.0*sum(entraron)/sum(qr_emitidos))::int
                else 0 end                        as pct,
           coalesce(sum(entraron),0)::int * v_tarifa as a_pagar
    from mias
  ),
  tipos as (
    select coalesce(nullif(btrim(lista_tipo),''),'otra') as tipo,
           sum(fichas)::int                              as inscritos,
           sum(entraron)::int                            as entraron,
           sum(entraron)::int * v_tarifa                 as monto
    from mias group by 1
  ),
  noches as (
    select m.fecha, m.evento_id,
           max(m.evento_nombre)          as evento,
           count(distinct m.lista_id)::int as listas,
           sum(m.fichas)::int            as inscritos,
           sum(m.entraron)::int          as entraron,
           sum(m.entraron)::int * v_tarifa as monto,
           bool_or(m.historico)          as historico
    from mias m group by m.fecha, m.evento_id
  ),
  noches2 as (
    select n.*, coalesce(rp.estado, 'sin liquidar') as pago
    from noches n
    left join public.rrpp_pagos rp
      on rp.clave = v_clave
     and coalesce(rp.evento_id, -1) = coalesce(n.evento_id, -1)
  ),
  pagos as (
    select coalesce(sum(total) filter (where estado =  'pagado'),0)::int as pagado,
           coalesce(sum(total) filter (where estado <> 'pagado'),0)::int as pendiente
    from public.rrpp_pagos
    where clave = v_clave
      and (p_desde is null or fecha >= p_desde)
      and (p_hasta is null or fecha <= p_hasta)
  )
  select jsonb_build_object(
    'ok', true, 'rrpp', v_nom, 'tarifa', v_tarifa,
    'desde', p_desde, 'hasta', p_hasta,
    'total',     (select row_to_json(t) from tot t),
    'pagos',     (select row_to_json(p) from pagos p),
    'por_tipo',  coalesce((select json_agg(row_to_json(x) order by x.entraron desc) from tipos x), '[]'::json),
    'por_noche', coalesce((select json_agg(row_to_json(y) order by y.fecha desc)    from noches2 y), '[]'::json)
  ) into v;

  return v;
end; $$;

revoke execute on function public.rrpp_mi_rendimiento(date,date) from anon, public;
grant  execute on function public.rrpp_mi_rendimiento(date,date) to authenticated;
