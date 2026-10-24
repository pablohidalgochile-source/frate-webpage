-- ═══ carga histórica · PARTE 5 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

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
