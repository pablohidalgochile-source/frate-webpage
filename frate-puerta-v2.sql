-- ============================================================
-- FRATE — PUERTA V2: buscar por RUT + lista de escaneados
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
--
-- Ambas funciones son SECURITY DEFINER con gate de rol
-- (admin/portero) — el portero no necesita RLS abierta.
-- ============================================================

-- Buscar tickets por RUT dentro de un evento (para gente sin celular).
-- Devuelve una fila por ENTRADA que calce con ese RUT, con su estado.
create or replace function public.puerta_buscar_rut(p_rut text, p_evento int) returns json
language plpgsql security definer set search_path = public as $$
declare
  limpio text := regexp_replace(lower(coalesce(p_rut,'')), '[^0-9k]', '', 'g');
  v json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  if length(limpio) < 7 then return json_build_object('error','RUT demasiado corto'); end if;

  select coalesce(json_agg(row_to_json(t) order by t.ya_usado asc, t.nombre), '[]'::json) into v
  from (
    select pos.qr                                   as qr,
           coalesce(x.per->>'nombre', p.nombre_cliente) as nombre,
           x.per->>'rut'                            as rut,
           ip.nombre_ticket,
           p.nombre_cliente                         as comprador,
           'FCC-'||lpad(p.id::text, 6, '0')         as orden,
           (qu.qr_id is not null)                   as ya_usado,
           qu.created_at                            as usado_at,
           qu.incidencia
    from items_pedido ip
    join pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    cross join lateral jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
    left join lateral (select ip.personas -> (pos.i::int - 1) as per) x on true
    left join qr_usados qu on qu.qr_id = pos.qr
    where ip.evento_id = p_evento
      and regexp_replace(lower(coalesce(x.per->>'rut','')), '[^0-9k]', '', 'g') = limpio
  ) t;
  return v;
end; $$;

-- Todos los escaneados de un evento (nombre, RUT, hora, quién escaneó)
create or replace function public.puerta_escaneados(p_evento int) returns json
language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;

  select coalesce(json_agg(row_to_json(t) order by t.hora desc), '[]'::json) into v
  from (
    select qu.qr_id,
           qu.created_at                                as hora,
           qu.incidencia,
           coalesce(x.per->>'nombre', p.nombre_cliente) as nombre,
           x.per->>'rut'                                as rut,
           ip.nombre_ticket,
           (select coalesce('@'||c.username, c.nombres) from clientes c where c.id = qu.escaneado_por) as escaneado_por
    from qr_usados qu
    join items_pedido ip on ip.qr_ids ? qu.qr_id and ip.evento_id = p_evento
    join pedidos p on p.id = ip.pedido_id
    left join lateral (
      select ip.personas -> (pos.i::int - 1) as per
      from jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
      where pos.qr = qu.qr_id
      limit 1
    ) x on true
  ) t;
  return v;
end; $$;

grant execute on function public.puerta_buscar_rut(text, int) to authenticated;
grant execute on function public.puerta_escaneados(int) to authenticated;

-- Verificación
select 'puerta_buscar_rut' as rpc, case when exists(select 1 from pg_proc where proname='puerta_buscar_rut') then 'OK' else 'FALTA' end as estado
union all
select 'puerta_escaneados', case when exists(select 1 from pg_proc where proname='puerta_escaneados') then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO.
-- ============================================================
