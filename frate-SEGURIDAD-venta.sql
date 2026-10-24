-- ============================================================
-- FRATE — ENDURECIMIENTO DE SEGURIDAD antes de vender entradas.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh). Idempotente.
--
-- Cierra 2 hoyos CRÍTICOS + endurece la puerta y agrega índices.
-- NO rompe la compra (crear-pago usa service_role y salta RLS) ni las
-- cortesías de admin (admin_pedidos_all / admin_items_all ya dan acceso
-- total al admin). Las cortesías YA emitidas siguen validando (la puerta
-- valida por existencia del token, no por su formato).
-- ============================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║ FASE 0 · CRÍTICO — cerrar RLS abierto en pedidos/items      ║
-- ╚════════════════════════════════════════════════════════════╝

-- 1) pedidos: QUITAR el insert público (cualquiera podía crear un pedido
--    con estado='pagado'). El admin sigue por 'admin_pedidos_all' (for all);
--    la compra web entra por crear-pago (service_role, ignora RLS).
drop policy if exists "pedidos_insert_own" on public.pedidos;
--    (se mantiene 'pedidos_select_own' = el comprador logueado ve lo suyo,
--     y 'admin_pedidos_all' = admin ve/hace todo)

-- 2) items_pedido: QUITAR la lectura pública (cualquiera se bajaba TODOS
--    los qr_ids + nombre/RUT) y el insert público.
drop policy if exists "items_select_own" on public.items_pedido;
drop policy if exists "items_insert_own" on public.items_pedido;

--    Lectura acotada: el comprador logueado ve SOLO los items de sus pedidos.
--    (el admin ya está cubierto por 'admin_items_all' = for all)
drop policy if exists "items_owner_read" on public.items_pedido;
create policy "items_owner_read" on public.items_pedido for select
  using (exists (select 1 from public.pedidos p
                 where p.id = items_pedido.pedido_id and p.cliente_id = auth.uid()));

-- ╔════════════════════════════════════════════════════════════╗
-- ║ FASE 2a · Puerta — quemado ATÓMICO (doble-scan concurrente) ║
-- ╚════════════════════════════════════════════════════════════╝
-- Si dos puertas escanean el MISMO QR a la vez, el índice único de
-- qr_usados hace fallar al segundo insert: lo capturamos y devolvemos
-- "Ya fue escaneado" limpio (antes salía un error crudo).
create or replace function public.puerta_quemar_qr(p_qr text, p_evento int, p_forzar boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item   items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_otro   boolean := false;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;

  v_otro := (p_evento is not null and v_item.evento_id is not null and v_item.evento_id <> p_evento);
  if v_otro and not p_forzar then
    return json_build_object('ok', false, 'otro_evento', true, 'evento_id', v_item.evento_id,
                             'nombre_evento', v_item.nombre_evento, 'motivo', 'Esta entrada es de OTRO evento');
  end if;

  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then return json_build_object('ok', false, 'motivo', 'Pedido no pagado'); end if;
  if exists (select 1 from qr_usados where qr_id = p_qr) then
    return json_build_object('ok', false, 'motivo', 'Ya fue escaneado');
  end if;

  begin
    insert into qr_usados (qr_id, pedido_id, escaneado_por, gate_id)
    values (p_qr, v_pedido.id, auth.uid(), case when v_otro then 'FORZADO-otro-evento' else null end);
  exception
    when unique_violation then
      return json_build_object('ok', false, 'motivo', 'Ya fue escaneado');   -- ganó la carrera el otro dispositivo
    when undefined_column then
      begin
        insert into qr_usados (qr_id, pedido_id, escaneado_por) values (p_qr, v_pedido.id, auth.uid());
      exception when unique_violation then
        return json_build_object('ok', false, 'motivo', 'Ya fue escaneado');
      end;
  end;
  return json_build_object('ok', true, 'forzado', v_otro and p_forzar);
end; $$;
grant execute on function public.puerta_quemar_qr(text, int, boolean) to authenticated;

-- ╔════════════════════════════════════════════════════════════╗
-- ║ FASE 2b · Índices para escala (puerta + barrido de pagos)   ║
-- ╚════════════════════════════════════════════════════════════╝
-- Búsqueda del QR en la puerta (qr_ids ? token) sin seq-scan:
create index if not exists items_pedido_qr_ids_gin on public.items_pedido using gin (qr_ids);
-- Snapshot y reportes por evento:
create index if not exists items_pedido_evento_idx on public.items_pedido (evento_id);
-- Barrido de pendientes expirados que corre en cada compra + filtros admin:
create index if not exists pedidos_estado_created_idx on public.pedidos (estado, created_at);

-- ╔════════════════════════════════════════════════════════════╗
-- ║ VERIFICACIÓN                                                ║
-- ╚════════════════════════════════════════════════════════════╝
select 'pedidos_insert_own eliminada' as check,
       case when not exists(select 1 from pg_policies where tablename='pedidos' and policyname='pedidos_insert_own') then 'OK' else 'AÚN ABIERTA' end
union all select 'items_select_own eliminada',
       case when not exists(select 1 from pg_policies where tablename='items_pedido' and policyname='items_select_own') then 'OK' else 'AÚN ABIERTA' end
union all select 'items_insert_own eliminada',
       case when not exists(select 1 from pg_policies where tablename='items_pedido' and policyname='items_insert_own') then 'OK' else 'AÚN ABIERTA' end
union all select 'items_owner_read creada',
       case when exists(select 1 from pg_policies where tablename='items_pedido' and policyname='items_owner_read') then 'OK' else 'FALTA' end
union all select 'idx gin qr_ids',
       case when exists(select 1 from pg_indexes where indexname='items_pedido_qr_ids_gin') then 'OK' else 'FALTA' end
union all select 'puerta_quemar_qr atómico',
       case when exists(select 1 from pg_proc where proname='puerta_quemar_qr' and pronargs=3) then 'OK' else 'FALTA' end;
