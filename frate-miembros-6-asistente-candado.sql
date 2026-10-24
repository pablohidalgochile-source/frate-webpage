-- FRATE · PASO 8 · la entrada de miembro no se regala desde «Mi cuenta → Asistentes»
-- Proyecto WEB · SQL Editor · reemplaza editar_asistente con la MISMA firma
-- (conserva los permisos). Es la definición viva del 14-sep + 1 bloque nuevo.
-- Reversa: correr el mismo archivo sin el bloque marcado «NUEVO».
set lock_timeout = '5s';

create or replace function public.editar_asistente(p_item_id integer, p_idx integer, p_nombre text, p_rut text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- NUEVO · entrada de miembro: va a nombre del dueño de la cuenta
  if exists (select 1 from tipos_ticket where id = v_item.tipo_ticket_id and solo_miembros) then
    return json_build_object('error','Esta entrada es de miembro: va a tu nombre y no se puede regalar');
  end if;
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
end; $function$;

select pg_get_function_identity_arguments('public.editar_asistente'::regproc) as firma,
       position('no se puede regalar' in pg_get_functiondef('public.editar_asistente'::regproc)) > 0 as candado;
