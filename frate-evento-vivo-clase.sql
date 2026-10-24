-- === 5) El tablero de puerta deja de adivinar ===
-- Reemplaza evento_vivo: la categoria preventa/cortesia/puerta ahora sale
-- de la CLASE del tipo de ticket, y los 🧪 prueba no cuentan en nada.
-- Correr DESPUES de frate-clase-ticket.sql (necesita item_clase()).

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
      and public.item_clase(ip.tipo_ticket_id, ip.nombre_ticket, coalesce(ip.precio_unitario,0)) <> 'prueba'
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
      and public.item_clase(ip.tipo_ticket_id, ip.nombre_ticket, coalesce(ip.precio_unitario,0)) <> 'prueba'
  ),
  -- Emitidos POR lista/tipo (cuántos ERAN de cada una)
  emit_lbl as (
    select coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as label,
           sum(jsonb_array_length(ip.qr_ids))::int as total,
           -- La categoría la DECLARA el tipo de ticket (frate-clase-ticket.sql).
           -- Antes se deducía del precio, y por eso las 15 VIP AIRE que se
           -- vendieron en $295.000 aparecían como cortesía: su tipo vale $0.
           -- 'venta' se traduce a 'preventa' porque así se llama en el tablero.
           case public.item_clase(max(ip.tipo_ticket_id), max(ip.nombre_ticket), max(coalesce(ip.precio_unitario,0)))
                when 'venta' then 'preventa' else
                public.item_clase(max(ip.tipo_ticket_id), max(ip.nombre_ticket), max(coalesce(ip.precio_unitario,0)))
           end as cat
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
      -- Los tipos marcados 🧪 prueba no cuentan en ninguna parte. Para eso existe la clase.
      and public.item_clase(ip.tipo_ticket_id, ip.nombre_ticket, coalesce(ip.precio_unitario,0)) <> 'prueba'
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
