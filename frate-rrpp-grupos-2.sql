-- 🗂️ TRES GRUPOS · parte 2 de 2 — que el informe lo devuelva
-- Corre DESPUÉS de frate-rrpp-grupos-1.sql.
--
-- Un solo cambio respecto de la versión anterior: agrega `grupo` a la
-- respuesta. Todo lo demás —agrupación, alias, conteos, orden, el `paga`
-- y el `a_pagar`— queda exactamente igual.

create or replace function public.rrpp_rendimiento(
  p_evento int default null, p_desde date default null, p_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
    select
      p.clave                                                 as clave,
      coalesce(
        (select a.nombre_final from public.rrpp_alias a
          where a.clave_final = p.clave and a.nombre_final is not null limit 1),
        max(p.rrpp_nombre))                                   as rrpp,
      bool_or(p.tiene_cuenta)                                 as tiene_cuenta,
      count(distinct p.rrpp_nombre)                           as identidades,
      max(p.duenio_texto)                                     as texto,
      count(distinct p.lista_id)                              as listas,
      count(*)                                                as fichas,
      sum(p.personas_pedidas)                                 as personas_pedidas,
      count(*) filter (where p.genero = 'F')                  as fichas_mujer,
      count(*) filter (where p.genero = 'M')                  as fichas_hombre,
      count(*) filter (where p.genero not in ('F','M'))       as fichas_sin_genero,
      sum(p.qr_emitidos)                                      as qr_emitidos,
      count(*) filter (where p.qr_emitidos = 0)               as fichas_sin_qr,
      sum(p.entraron)                                         as entraron,
      greatest(sum(p.qr_emitidos) - sum(p.entraron), 0)       as no_entraron,
      case when sum(p.qr_emitidos) > 0
           then round(100.0 * sum(p.entraron) / sum(p.qr_emitidos))::int else 0 end as pct,
      coalesce((select g.paga   from public.rrpp_pago g where g.clave = p.clave), true)      as paga,
      coalesce((select g.tarifa from public.rrpp_pago g where g.clave = p.clave), v_tarifa)  as tarifa,
      -- ⬇️ LO ÚNICO NUEVO. Sin fila en rrpp_pago = «por clasificar».
      coalesce((select g.grupo  from public.rrpp_pago g where g.clave = p.clave), 'sin')     as grupo,
      case when coalesce((select g.paga from public.rrpp_pago g where g.clave = p.clave), true)
           then sum(p.entraron) * coalesce(
                  (select g.tarifa from public.rrpp_pago g where g.clave = p.clave), v_tarifa)
           else 0 end                                         as a_pagar,
      min(p.fecha)                                            as desde,
      max(p.fecha)                                            as hasta
    from public.v_rrpp_personas p
    where (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
    group by p.clave
  ) t;

  return jsonb_build_object('ok', true, 'tarifa', v_tarifa, 'rrpp', v);
end; $$;

grant execute on function public.rrpp_rendimiento(int, date, date) to authenticated;
