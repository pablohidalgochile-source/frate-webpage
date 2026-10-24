-- ============================================================
-- FRATE — REACTIVACIONES + tickets nominativos + 5 días hábiles
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
-- ============================================================

-- ── 1) Solicitudes: el cliente elige crédito (reactivación) o dinero ──
alter table public.pedidos add column if not exists dev_opcion text;  -- 'credito' | 'dinero'

-- ── 2) Valores configurables ─────────────────────────────────
insert into public.config_valores (clave, valor, label) values
  ('reactivacion_horas',      '48', 'Reactivación — horas post-evento para pedir crédito por ticket no usado'),
  ('devolucion_dias_habiles', '5',  'Devoluciones — días hábiles que se informan al cliente')
on conflict (clave) do nothing;

-- ── 3) RPC: editar los datos del asistente de una entrada ─────
-- (tickets nominativos: si fue regalo, el dueño corrige nombre+RUT
--  mientras esa entrada NO haya sido usada en la puerta)
create or replace function public.editar_asistente(p_item_id integer, p_idx integer, p_nombre text, p_rut text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_item items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_qr text;
  v_personas jsonb;
begin
  if auth.uid() is null then return json_build_object('error','Inicia sesión'); end if;
  select * into v_item from items_pedido where id = p_item_id;
  if not found then return json_build_object('error','Entrada no encontrada'); end if;
  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.cliente_id is distinct from auth.uid() then return json_build_object('error','Esta compra no es tuya'); end if;
  if v_pedido.estado <> 'pagado' then return json_build_object('error','Solo compras pagadas'); end if;
  if coalesce(trim(p_nombre),'') = '' or coalesce(trim(p_rut),'') = '' then
    return json_build_object('error','Nombre y RUT son obligatorios');
  end if;

  v_qr := v_item.qr_ids ->> p_idx;
  if v_qr is not null and exists (select 1 from qr_usados where qr_id = v_qr) then
    return json_build_object('error','Esa entrada ya fue usada en la puerta; no se puede editar');
  end if;

  v_personas := coalesce(v_item.personas, '[]'::jsonb);
  -- asegurar largo del arreglo hasta p_idx
  while jsonb_array_length(v_personas) <= p_idx loop
    v_personas := v_personas || '{}'::jsonb;
  end loop;
  v_personas := jsonb_set(v_personas, array[p_idx::text],
                  coalesce(v_personas -> p_idx, '{}'::jsonb) || jsonb_build_object('nombre', trim(p_nombre), 'rut', trim(p_rut)));
  update items_pedido set personas = v_personas,
    nombre_asistente = case when p_idx = 0 then trim(p_nombre) else nombre_asistente end,
    rut_asistente    = case when p_idx = 0 then trim(p_rut)    else rut_asistente end
  where id = p_item_id;
  return json_build_object('ok', true);
end; $$;
grant execute on function public.editar_asistente(integer, integer, text, text) to authenticated;

-- ── 4) Verificación ──────────────────────────────────────────
select 'dev_opcion' as check, case when exists(select 1 from information_schema.columns where table_name='pedidos' and column_name='dev_opcion') then 'OK' else 'FALTA' end
union all select 'editar_asistente', case when exists(select 1 from pg_proc where proname='editar_asistente') then 'OK' else 'FALTA' end
union all select 'config reactivacion', case when exists(select 1 from config_valores where clave='reactivacion_horas') then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO.
-- ============================================================
