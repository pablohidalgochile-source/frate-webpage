-- ============================================================
-- FRATE — Snapshot de QR para validación OFFLINE en la puerta
-- El validador descarga TODOS los QR válidos del evento (mismo
-- formato que puerta_check_qr) para validar sin internet. Al
-- reconectar, sincroniza los ingresos que quemó local.
-- Correr en el Supabase de la WEB. Idempotente.
-- ============================================================

create or replace function public.puerta_snapshot_qr(p_evento int)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v from (
    select
      qr.qr                                          as qr,
      true                                           as ok,
      (qu.qr_id is not null)                         as ya_usado,
      qu.created_at                                  as usado_at,
      qu.incidencia                                  as incidencia,
      p.id                                           as pedido_id,
      'FCC-'||lpad(p.id::text, 6, '0')               as orden,
      p.nombre_cliente                               as comprador,
      p.email_cliente                                as email,
      ip.evento_id                                   as evento_id,
      ip.nombre_evento                               as nombre_evento,
      ip.nombre_ticket                               as nombre_ticket,
      ip.condiciones                                 as condiciones,
      coalesce(ip.personas -> (qr.i::int - 1), 'null'::jsonb) as persona
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    cross join lateral jsonb_array_elements_text(ip.qr_ids) with ordinality qr(qr, i)
    left join public.qr_usados qu on qu.qr_id = qr.qr
    where ip.evento_id = p_evento
  ) t;
  return v;
end; $$;
grant execute on function public.puerta_snapshot_qr(int) to authenticated;

select 'puerta_snapshot_qr' as check,
       case when exists(select 1 from pg_proc where proname='puerta_snapshot_qr') then 'OK' else 'FALTA' end;
