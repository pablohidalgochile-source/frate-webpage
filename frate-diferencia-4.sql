-- 🎫 TICKET DE DIFERENCIA · PARTE 4 de 4 — que la puerta vea el precio
-- Corre después de la parte 3.
--
-- POR QUÉ: para proponer la diferencia hay que saber cuánto pagó. Hoy
-- `puerta_check_qr` devuelve el nombre del ticket pero NO su precio, así
-- que el validador no tiene contra qué restar.
--
-- Se agregan DOS campos y no se toca nada más: misma firma, mismo
-- comportamiento, mismos permisos. Lo demás queda igual que estaba.

create or replace function public.puerta_check_qr(p_qr text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_usado qr_usados%rowtype;
  v_idx int;
  v_persona json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;

  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;

  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then
    return json_build_object('ok', false, 'motivo', 'Pedido no pagado (estado: '||coalesce(v_pedido.estado,'—')||')');
  end if;

  select i-1 into v_idx from jsonb_array_elements_text(v_item.qr_ids) with ordinality t(qr, i) where t.qr = p_qr;
  v_persona := coalesce(v_item.personas -> v_idx, 'null'::jsonb)::json;

  select * into v_usado from qr_usados where qr_id = p_qr;

  return json_build_object(
    'ok', true,
    'ya_usado', found,
    'usado_at', v_usado.created_at,
    'incidencia', v_usado.incidencia,
    'pedido_id', v_pedido.id,
    'orden', 'FCC-'||lpad(v_pedido.id::text, 6, '0'),
    'comprador', v_pedido.nombre_cliente,
    'email', v_pedido.email_cliente,
    'evento_id', v_item.evento_id,
    'nombre_evento', v_item.nombre_evento,
    'nombre_ticket', v_item.nombre_ticket,
    'condiciones', v_item.condiciones,
    'persona', v_persona,
    -- ── lo nuevo ──
    'precio_unitario', coalesce(v_item.precio_unitario, 0),
    'diferencia_pendiente', (
      select jsonb_build_object('codigo', td.codigo, 'monto', td.monto)
        from public.tickets_diferencia td
       where td.qr_id = p_qr and td.estado = 'pendiente' limit 1)
  );
end; $$;

-- Chequeo: que siga cerrada a quien no es de la puerta.
select has_function_privilege('anon', 'public.puerta_check_qr(text)', 'EXECUTE') as la_llama_un_anonimo;
