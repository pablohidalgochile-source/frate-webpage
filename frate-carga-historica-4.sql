-- ═══ carga histórica · PARTE 4 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

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
