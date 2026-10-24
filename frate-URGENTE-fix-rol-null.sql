-- ============================================================
-- 🚨 URGENTE · CORRE ESTO YA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- QUÉ PASÓ: dos funciones que escribí hoy comprobaban el rol así:
--
--     select rol into v_rol from clientes where id = auth.uid();
--     if v_rol <> 'admin' then return 'Solo admin'; end if;
--
-- Para alguien SIN sesión, auth.uid() es NULL → no hay fila → v_rol queda
-- NULL. Y en PostgreSQL `NULL <> 'admin'` NO es TRUE: es NULL. El `if` nunca
-- entra y la función sigue de largo.
--
-- CONSECUENCIA: con la llave pública que está en el HTML de frate.cl,
-- cualquiera podía llamar:
--   · anular_pedido(<id>, 'x')            → anular una orden pagada
--   · puerta_resolver_ingreso(<id>, true) → aprobar un ingreso a la fiesta
--
-- Comprobado en vivo: las dos respondían "No existe esa orden/solicitud"
-- en vez de "Solo admin", o sea que ya habían pasado el control.
--
-- LA REGLA: nunca comparar un rol que puede venir NULL. Siempre
-- `coalesce(v_rol,'') <> 'admin'`, o un `is null` explícito antes.
--
-- Idempotente. Solo redefine las dos funciones; no toca datos.
-- ============================================================

-- ── 1) anular_pedido ──
create or replace function public.anular_pedido(p_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v_est text; v_monto int; v_ev int;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();

  -- 🔒 coalesce: sin sesión, v_rol es NULL y la comparación directa daba NULL.
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;

  if coalesce(btrim(p_motivo),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Tienes que decir por qué se anula');
  end if;

  select estado, coalesce(total_pagado, total, 0) into v_est, v_monto
    from public.pedidos where id = p_id;
  if v_est is null then return jsonb_build_object('ok', false, 'error', 'No existe esa orden'); end if;
  if v_est = 'anulado' then return jsonb_build_object('ok', false, 'error', 'Ya estaba anulada'); end if;

  select ip.evento_id into v_ev from public.items_pedido ip where ip.pedido_id = p_id limit 1;

  update public.pedidos
     set estado = 'anulado', anulada_por = v_nom, anulada_por_id = auth.uid(),
         anulada_at = now(), anulada_motivo = btrim(p_motivo)
   where id = p_id;

  perform public.bitacora_registrar('anular', p_id, v_ev, v_monto,
            jsonb_build_object('estado_anterior', v_est, 'motivo', btrim(p_motivo)));

  return jsonb_build_object('ok', true, 'estado_anterior', v_est, 'actor', v_nom);
end; $$;


-- ── 2) puerta_resolver_ingreso ──
create or replace function public.puerta_resolver_ingreso(
  p_id bigint, p_aprobar boolean, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rol text; v_quien text; s record; v_pedido bigint; v_qr text; v_evnom text;
begin
  select rol, coalesce(nullif('@'||username,'@'), nullif(btrim(nombres||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_quien
    from public.clientes where id = auth.uid();

  -- 🔒 mismo arreglo: sin sesión no se autoriza nada.
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin puede autorizar un ingreso');
  end if;

  select * into s from public.puerta_solicitudes where id = p_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'No existe esa solicitud'); end if;
  if s.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud ya está ' || s.estado);
  end if;

  if not coalesce(p_aprobar, false) then
    update public.puerta_solicitudes
       set estado='rechazada', resuelta_por=auth.uid(), resuelta_nombre=v_quien,
           resuelta_at=now(), nota=p_nota
     where id = p_id;
    return jsonb_build_object('ok', true, 'estado', 'rechazada');
  end if;

  select nombre into v_evnom from public.eventos where id = s.evento_id;

  insert into public.pedidos(nombre_cliente, email_cliente, estado, total, fee_servicio,
                             total_pagado, metodo_pago, referencia_pago, fecha_pago)
  values (s.nombre, null, 'pagado', 0, 0, 0, 'cortesia', 'PUERTA-VIP', now())
  returning id into v_pedido;

  v_qr := 'FCC-'||v_pedido||'-PUERTA-0';

  insert into public.items_pedido(pedido_id, producto_tipo, evento_id, nombre_evento,
                                  nombre_ticket, tipo_ticket_id, cantidad, precio_unitario,
                                  personas, qr_ids, nombre_asistente, rut_asistente)
  values (v_pedido, 'ticket', s.evento_id, coalesce(v_evnom, 'Ingreso puerta'),
          s.nombre_ticket, s.tipo_ticket_id, 1, 0,
          jsonb_build_array(jsonb_build_object('nombre', s.nombre, 'rut', coalesce(s.rut,''))),
          jsonb_build_array(v_qr), s.nombre, coalesce(s.rut,''));

  begin
    insert into public.qr_usados(qr_id, pedido_id, escaneado_por, gate_id)
    values (v_qr, v_pedido, coalesce(s.solicitada_por, auth.uid()), 'PUERTA-VIP');
  exception when others then null; end;

  begin perform public.personas_upsert(s.nombre, s.rut, null, s.telefono, s.instagram, 'puerta', false);
  exception when others then null; end;

  begin
    insert into public.ingresos_manuales(nombre, rut, telefono, instagram, motivo, evento_id, portero_id)
    values (s.nombre, s.rut, s.telefono, s.instagram,
            coalesce(s.motivo,'') || ' · ' || coalesce(s.nombre_ticket,'') || ' · autorizó ' || v_quien,
            s.evento_id, coalesce(s.solicitada_por, auth.uid()));
  exception when others then null; end;

  update public.puerta_solicitudes
     set estado='aprobada', resuelta_por=auth.uid(), resuelta_nombre=v_quien,
         resuelta_at=now(), nota=p_nota, pedido_id=v_pedido
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado','aprobada', 'pedido_id', v_pedido, 'qr', v_qr);
end; $$;


-- ── 3) Verificación: las dos tienen que rechazar a quien no tiene sesión ──
select 'anular_pedido protegida' as chequeo,
       case when (select prosrc from pg_proc where proname='anular_pedido')
                 like '%coalesce(v_rol,'''') <> ''admin''%'
            then '✅ ok' else '🚨 sigue abierta' end as estado
union all
select 'puerta_resolver_ingreso protegida',
       case when (select prosrc from pg_proc where proname='puerta_resolver_ingreso')
                 like '%coalesce(v_rol,'''') <> ''admin''%'
            then '✅ ok' else '🚨 sigue abierta' end;

-- ============================================================
-- CÓMO COMPROBARLO TÚ MISMO desde la terminal (sin sesión):
--
--   curl -s -X POST 'https://ydwlpraoaaijlfssevoh.supabase.co/rest/v1/rpc/anular_pedido' \
--     -H 'apikey: sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt' \
--     -H 'Content-Type: application/json' -d '{"p_id":1,"p_motivo":"x"}'
--
--   ANTES:   {"ok":false,"error":"No existe esa orden"}   ← pasó el control
--   DESPUÉS: {"ok":false,"error":"Solo admin"}            ← lo frenó
-- ============================================================
