-- ============================================================
-- FRATE — "PUERTA EN VIVO": conteo + feed en tiempo real de la puerta
-- Un solo RPC devuelve TODO para el tablero: cuántos entraron, aforo,
-- ritmo (últimos 10 min), desglose por lista/tipo, género y el FEED
-- (últimos que entraron, el más reciente ARRIBA).
-- También agrega columna `aforo` al evento (capacidad, opcional).
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

alter table public.eventos add column if not exists aforo int;

create or replace function public.evento_vivo(p_evento int)
returns json language plpgsql security definer set search_path = public as $$
declare v json; v_aforo int; v_nombre text;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select aforo, nombre into v_aforo, v_nombre from public.eventos where id = p_evento;

  with ck as (
    select qu.qr_id,
           qu.created_at                                   as hora,
           (coalesce(qu.incidencia::text, '') <> '')       as incidencia,   -- incidencia es TEXTO (motivo); true si viene con algo
           coalesce(x.per->>'nombre', p.nombre_cliente)    as nombre,
           x.per->>'rut'                                   as rut,
           lower(coalesce(x.per->>'genero',''))            as genero,
           coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as ticket
    from public.qr_usados qu
    join public.items_pedido ip on ip.qr_ids ? qu.qr_id and ip.evento_id = p_evento
    join public.pedidos p on p.id = ip.pedido_id
    left join lateral (
      select ip.personas -> (pos.i::int - 1) as per
      from jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
      where pos.qr = qu.qr_id
      limit 1
    ) x on true
  ),
  emit as (
    select coalesce(sum(jsonb_array_length(ip.qr_ids)), 0) as n
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
  ),
  -- Emitidos POR lista/tipo (cuántos ERAN de cada una)
  emit_lbl as (
    select coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as label,
           sum(jsonb_array_length(ip.qr_ids))::int as total,
           -- categoría por DATO (no por adivinar el nombre): preventa=pagó, puerta=ingreso VIP directo, resto cortesía
           case when max(coalesce(ip.precio_unitario,0)) > 0 then 'preventa'
                when bool_or(coalesce(ip.nombre_ticket,'') ~* 'ingreso') then 'puerta'
                else 'cortesia' end as cat
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
    group by 1
  )
  select json_build_object(
    'evento',      v_nombre,
    'aforo',       v_aforo,
    'emitidas',    (select n from emit),
    'entraron',    (select count(*) from ck where not incidencia),
    'incidencias', (select count(*) from ck where incidencia),
    'ritmo_10min', (select count(*) from ck where not incidencia and hora > now() - interval '10 minutes'),
    'genero', (select json_build_object(
        'F',    count(*) filter (where genero in ('f','femenino','mujer')),
        'M',    count(*) filter (where genero in ('m','masculino','hombre')),
        'otro', count(*) filter (where genero = '' or genero not in ('f','femenino','mujer','m','masculino','hombre'))
      ) from ck where not incidencia),
    'desglose', (select coalesce(json_agg(row_to_json(d) order by d.total desc, d.label), '[]'::json)
        from (
          select e.label, e.cat,
                 coalesce((select count(*)::int from ck where not ck.incidencia and ck.ticket = e.label), 0) as llegaron,
                 e.total
          from emit_lbl e
        ) d),
    'feed', (select coalesce(json_agg(row_to_json(f) order by f.hora desc), '[]'::json)
        from (select nombre, rut, hora, ticket as nombre_ticket, incidencia from ck order by hora desc limit 80) f),
    'ts', extract(epoch from now())
  ) into v;
  return v;
end; $$;
grant execute on function public.evento_vivo(int) to authenticated;

select 'evento_vivo' as check,
       case when exists(select 1 from pg_proc where proname='evento_vivo') then 'OK' else 'FALTA' end as rpc,
       case when exists(select 1 from information_schema.columns where table_name='eventos' and column_name='aforo') then 'OK' else 'FALTA' end as col_aforo;
