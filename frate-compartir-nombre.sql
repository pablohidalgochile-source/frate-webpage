-- 📸 EL NOMBRE PARA LA FOTO QUE COMPARTEN · idempotente
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- EL BUG: quien compra SIN cuenta comparte una foto que dice «PABLO ANDRES»
-- y «MIÉRCOLES 15 JULIO». Son los valores de ejemplo de casita.html.
--
-- POR QUÉ PASA: `_nombreDelPedido` lee `pedidos` con la llave pública, y la
-- RLS la tapa para quien no tiene sesión. Devuelve vacío → cae al ejemplo.
-- Como el 96% compra sin cuenta, le pasa a casi todos.
--
-- 🔒 POR QUÉ SOLO EL PRIMER NOMBRE: el id del pedido va en la URL de retorno
--    de MercadoPago y es correlativo, o sea adivinable. Si esto devolviera el
--    nombre completo, cualquiera recorrería los números y armaría la lista de
--    compradores. El primer nombre es lo único que se dibuja en el flyer y no
--    sirve para identificar a nadie.
--    Tampoco devuelve correo, RUT, monto ni qué compró.

create or replace function public.pedido_para_compartir(p_id int)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_nombre text; v_fecha date; v_hora text; v_evento text;
begin
  select p.nombre_cliente into v_nombre
    from public.pedidos p
   where p.id = p_id and p.estado = 'pagado';

  if v_nombre is null then
    return jsonb_build_object('ok', false);
  end if;

  -- La fecha del evento de esa compra.
  select e.nombre, e.fecha, e.hora into v_evento, v_fecha, v_hora
    from public.items_pedido ip
    join public.eventos e on e.id = ip.evento_id
   where ip.pedido_id = p_id
   order by e.fecha nulls last
   limit 1;

  return jsonb_build_object(
    'ok', true,
    -- SOLO el primer nombre. Se parte en el primer espacio y se limpia.
    'nombre', split_part(btrim(regexp_replace(v_nombre, '\s+', ' ', 'g')), ' ', 1),
    'evento', v_evento,
    'fecha',  v_fecha,
    'hora',   v_hora
  );
end; $$;

-- Abierta a propósito: la usa la página de «gracias por tu compra», donde la
-- persona todavía no tiene sesión. Por eso devuelve tan poco.
grant execute on function public.pedido_para_compartir(int) to anon, authenticated;

comment on function public.pedido_para_compartir is
  'Solo el PRIMER nombre y la fecha del evento, para la foto que comparte quien compró. No devuelve correo, RUT ni montos: el id del pedido es adivinable.';


-- ── Chequeo ────────────────────────────────────────────────────────
-- Debe traer solo el primer nombre, nunca el apellido.
select public.pedido_para_compartir(4761) as ejemplo;
