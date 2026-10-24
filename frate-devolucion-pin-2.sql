
-- 🔒 EL RPC TAMBIÉN EXIGE EL PIN · parte 2 de 2 (corre después de la 1)
-- Sin esto el candado vive SOLO en la pantalla y cualquiera lo saltaría
-- llamando `mi_entrada_gestion` desde la consola del navegador.

create or replace function public.mi_entrada_gestion(
  p_pedido_id  int,
  p_tipo       text,
  p_motivo     text default null,
  p_comentario text default null,
  p_pin        text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v_mio boolean := false;
  p public.pedidos%rowtype; v_nom text;
  v_fin timestamptz; v_ev int; v_evfecha date;
begin
  if v_id is null then return jsonb_build_object('ok',false,'error','Inicia sesión'); end if;
  if coalesce(p_tipo,'') not in ('cambio_dia','abierto','devolucion') then
    return jsonb_build_object('ok',false,'error','Opción no válida'); end if;

  select lower(btrim(email)),
         nullif(upper(regexp_replace(coalesce(rut,''),'[^0-9kK]','','g')),''),
         coalesce(nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_email, v_rut, v_nom from public.clientes where id = v_id;

  select * into p from public.pedidos where id = p_pedido_id;
  if p.id is null then return jsonb_build_object('ok',false,'error','No encontramos esa compra'); end if;
  if p.estado <> 'pagado' then return jsonb_build_object('ok',false,'error','Solo se gestionan compras pagadas'); end if;
  if p.dev_estado is not null then return jsonb_build_object('ok',false,'error','Ya hay una solicitud en revisión'); end if;

  -- Le pertenece por cuenta, por correo o porque su RUT va en el ticket.
  v_mio := (p.cliente_id = v_id)
        or (v_email is not null and lower(btrim(coalesce(p.email_cliente,''))) = v_email)
        or (v_rut is not null and exists (
              select 1 from public.items_pedido ip
              cross join lateral jsonb_array_elements(coalesce(ip.personas,'[]'::jsonb)) per
              where ip.pedido_id = p.id
                and upper(regexp_replace(coalesce(per->>'rut',''),'[^0-9kK]','','g')) = v_rut));
  if not v_mio then return jsonb_build_object('ok',false,'error','Esta compra no aparece a tu nombre'); end if;

  -- Ya entró: `incidencia is null` distingue el ingreso real de un QR quemado.
  if exists (select 1 from public.items_pedido ip
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
    join public.qr_usados u on u.qr_id = q.qr and u.incidencia is null
    where ip.pedido_id = p.id) then
    return jsonb_build_object('ok',false,'error','Esta entrada ya se usó en la puerta'); end if;

  -- ⭐ LA VENTANA: la devolución cierra al terminar la noche. Cambiar de día
  --    y dejarla abierta no tienen ventana: son las salidas a empujar.
  if p_tipo = 'devolucion' then
    select ip.evento_id, e.fecha into v_ev, v_evfecha
      from public.items_pedido ip
      join public.eventos e on e.id = ip.evento_id
     where ip.pedido_id = p.id order by e.fecha limit 1;

    if v_evfecha is not null then
      v_fin := (v_evfecha + 1)::timestamptz + time '05:00';
      if now() > v_fin then
        if not public.devolucion_pin_ok(p_pin) then
          return jsonb_build_object('ok',false,'error','fuera_de_plazo','mensaje',
            'Esta noche ya pasó. Para devoluciones fuera de plazo necesitas el código del equipo.');
        end if;
        -- Usó el PIN: queda registrado. Si esto crece, la regla no se respeta.
        begin
          insert into public.devolucion_excepciones(pedido_id,cliente_id,evento_id,fecha_evento,motivo)
          values (p.id,v_id,v_ev,v_evfecha,btrim(coalesce(p_motivo,'')||' — '||coalesce(p_comentario,'')));
        exception when others then null; end;
      end if;
    end if;
  end if;

  update public.pedidos
     set dev_estado      = 'pendiente',
         dev_opcion      = p_tipo,
         dev_motivo      = btrim(coalesce(p_motivo,'') || ' — ' || coalesce(p_comentario,'')),
         dev_solicitada_at = now()
   where id = p.id;

  return jsonb_build_object('ok',true,'tipo',p_tipo,
    'pago_es_mio',(p.cliente_id = v_id or lower(btrim(coalesce(p.email_cliente,''))) = v_email),
    'comprador',p.nombre_cliente,'correo_comprador',p.email_cliente,'pedida_por',v_nom);
end; $$;

revoke execute on function public.mi_entrada_gestion(int,text,text,text,text) from anon, public;
grant  execute on function public.mi_entrada_gestion(int,text,text,text,text) to authenticated;
