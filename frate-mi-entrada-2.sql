-- 🎟️ MI ENTRADA · PARTE 2 de 2 — pedir la gestión
-- Corre después de la parte 1.
--
-- POR QUÉ NO SE REUSA `solicitar-devolucion`: esa edge exige
--     if (pedido.cliente_id !== uid) → 403 «Este pedido no es tuyo»
-- y eso mata el caso que más nos importa: Sebastián Villagra tiene una
-- entrada dentro de la orden de Andrés Bustamante. La entrada ES suya,
-- la orden NO. Con esa regla nunca podría gestionarla.
--
-- Acá se valida igual que en `mis_entradas()`: por cuenta, por correo O
-- por RUT dentro del ticket. Y se guarda de QUIÉN es la plata, porque no
-- siempre es de quien pide.

create or replace function public.mi_entrada_gestion(
  p_pedido_id  int,
  p_tipo       text,                    -- cambio_dia | abierto | devolucion
  p_motivo     text default null,
  p_comentario text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v_mio boolean := false;
  p public.pedidos%rowtype; v_nom text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión');
  end if;
  if coalesce(p_tipo,'') not in ('cambio_dia','abierto','devolucion') then
    return jsonb_build_object('ok', false, 'error', 'Opción no válida');
  end if;

  select lower(btrim(email)),
         nullif(upper(regexp_replace(coalesce(rut,''), '[^0-9kK]', '', 'g')), ''),
         coalesce(nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_email, v_rut, v_nom
    from public.clientes where id = v_id;

  select * into p from public.pedidos where id = p_pedido_id;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'No encontramos esa compra'); end if;
  if p.estado <> 'pagado' then
    return jsonb_build_object('ok', false, 'error', 'Solo se gestionan compras pagadas'); end if;
  if p.dev_estado is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya hay una solicitud en revisión para esta compra'); end if;

  -- ¿Le pertenece? Las tres vías, igual que mis_entradas().
  v_mio := (p.cliente_id = v_id)
        or (v_email is not null and lower(btrim(coalesce(p.email_cliente,''))) = v_email);

  if not v_mio and v_rut is not null then
    select exists (
      select 1 from public.items_pedido ip
      cross join lateral jsonb_array_elements(coalesce(ip.personas,'[]'::jsonb)) per
      where ip.pedido_id = p.id
        and upper(regexp_replace(coalesce(per->>'rut',''), '[^0-9kK]', '', 'g')) = v_rut
    ) into v_mio;
  end if;

  if not v_mio then
    return jsonb_build_object('ok', false, 'error', 'Esta compra no aparece a tu nombre');
  end if;

  -- Ya entró: no se gestiona nada.
  if exists (
    select 1 from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
    join public.qr_usados u on u.qr_id = q.qr
    where ip.pedido_id = p.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Esta entrada ya se usó en la puerta');
  end if;

  update public.pedidos
     set dev_estado      = 'pendiente',
         dev_opcion      = p_tipo,
         dev_motivo      = btrim(coalesce(p_motivo,'') || ' — ' || coalesce(p_comentario,'')),
         dev_solicitada_at = now()
   where id = p.id;

  return jsonb_build_object('ok', true, 'tipo', p_tipo,
    'pago_es_mio', (p.cliente_id = v_id
                    or lower(btrim(coalesce(p.email_cliente,''))) = v_email),
    'comprador', p.nombre_cliente, 'correo_comprador', p.email_cliente,
    'pedida_por', v_nom);
end; $$;

revoke execute on function public.mi_entrada_gestion(int,text,text,text) from anon, public;
grant  execute on function public.mi_entrada_gestion(int,text,text,text) to authenticated;
