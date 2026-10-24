-- ============================================================
-- FRATE — Reporte POST-EVENTO: asistencia real vs emitida, no-shows,
-- curva de llegada (por hora), desglose por lista/tipo y por género.
-- Toda la data ya existe en qr_usados / items_pedido / pedidos.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create or replace function public.evento_reporte(p_evento int)
returns json language plpgsql security definer set search_path = public as $$
declare v json; v_nombre text; v_fecha date; v_aforo int;
begin
  if not exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero')) then
    return json_build_object('error','Sin permiso');
  end if;
  select nombre, fecha, aforo into v_nombre, v_fecha, v_aforo from public.eventos where id = p_evento;

  with ck as (
    select qu.qr_id,
           qu.created_at                                   as hora,
           (coalesce(qu.incidencia::text,'') <> '')        as incidencia,
           lower(coalesce(x.per->>'genero',''))            as genero,
           coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as ticket
    from public.qr_usados qu
    join public.items_pedido ip on ip.qr_ids ? qu.qr_id and ip.evento_id = p_evento
    join public.pedidos p on p.id = ip.pedido_id
    left join lateral (
      select ip.personas -> (pos.i::int - 1) as per
      from jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
      where pos.qr = qu.qr_id limit 1
    ) x on true
  ),
  emit_lbl as (
    select coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as label,
           sum(jsonb_array_length(ip.qr_ids))::int as total
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
    group by 1
  )
  select json_build_object(
    'evento',      v_nombre,
    'fecha',       v_fecha,
    'aforo',       v_aforo,
    'emitidas',    (select coalesce(sum(total),0) from emit_lbl),
    'entraron',    (select count(*) from ck where not incidencia),
    'incidencias', (select count(*) from ck where incidencia),
    'genero', (select json_build_object(
        'F',    count(*) filter (where genero in ('f','femenino','mujer')),
        'M',    count(*) filter (where genero in ('m','masculino','hombre')),
        'otro', count(*) filter (where genero = '' or genero not in ('f','femenino','mujer','m','masculino','hombre'))
      ) from ck where not incidencia),
    'por_hora', (select coalesce(json_agg(row_to_json(h) order by h.hora), '[]'::json) from (
        select to_char(date_trunc('hour', hora at time zone 'America/Santiago'), 'HH24:00') as hora, count(*)::int as n
        from ck where not incidencia group by 1) h),
    'por_lista', (select coalesce(json_agg(row_to_json(d) order by d.total desc, d.label), '[]'::json) from (
        select e.label,
               coalesce((select count(*)::int from ck where not ck.incidencia and ck.ticket = e.label), 0) as llegaron,
               e.total,
               (select min(hora) from ck where not ck.incidencia and ck.ticket = e.label) as primera,
               (select max(hora) from ck where not ck.incidencia and ck.ticket = e.label) as ultima
        from emit_lbl e) d),
    'ts', extract(epoch from now())
  ) into v;
  return v;
end; $$;
grant execute on function public.evento_reporte(int) to authenticated;

select 'evento_reporte' as check,
       case when exists(select 1 from pg_proc where proname='evento_reporte') then 'OK' else 'FALTA' end;
