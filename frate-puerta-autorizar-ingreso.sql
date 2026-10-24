-- ============================================================
-- FRATE · NADIE ENTRA POR LA PUERTA SIN QUE UN ADMIN LO AUTORICE
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- HOY: el portero aprieta "➕ Cliente nuevo · ingreso VIP", escribe un nombre
-- y la persona ENTRA. Sin pedirle permiso a nadie y sin decir qué entrada se
-- le está regalando. Quedan como "Ingreso VIP / puerta", todos iguales.
--
-- DESDE ACÁ:
--   1. El portero/anfitrión SOLICITA. Nadie entra todavía.
--   2. Tiene que elegir SÍ O SÍ el tipo de entrada que está pidiendo.
--   3. Un ADMIN aprueba o rechaza desde el panel. Queda firmado con su nombre.
--   4. Recién ahí se crea la entrada y el check-in.
--
-- Un admin logueado en la puerta sigue pudiendo registrar directo (está ahí,
-- es la autorización en persona) — pero también con tipo de entrada obligatorio.
--
-- Idempotente. Correr entero.
-- ============================================================

-- ── 1) La bandeja de solicitudes ──
create table if not exists public.puerta_solicitudes (
  id              bigserial primary key,
  evento_id       int,
  nombre          text not null,
  rut             text,
  telefono        text,
  instagram       text,
  tipo_ticket_id  int,                       -- OBLIGATORIO al solicitar
  nombre_ticket   text,                      -- copia legible: sobrevive si borran el tipo
  motivo          text,
  estado          text not null default 'pendiente',   -- pendiente | aprobada | rechazada
  solicitada_por  uuid default auth.uid(),
  solicitada_at   timestamptz default now(),
  resuelta_por    uuid,
  resuelta_nombre text,                      -- quién firmó, en texto, para que no se pierda
  resuelta_at     timestamptz,
  nota            text,
  pedido_id       bigint                     -- el pedido que se creó al aprobar
);
create index if not exists idx_psol_pend on public.puerta_solicitudes(estado, solicitada_at desc);
create index if not exists idx_psol_ev   on public.puerta_solicitudes(evento_id, solicitada_at desc);

alter table public.puerta_solicitudes enable row level security;
drop policy if exists psol_staff on public.puerta_solicitudes;
create policy psol_staff on public.puerta_solicitudes for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero','rrpp')));
-- Escribir SOLO por las funciones de abajo (security definer). Nadie a mano.
revoke insert, update, delete on public.puerta_solicitudes from anon, authenticated;


-- ── 2) PEDIR autorización (portero / anfitrión / admin) ──
create or replace function public.puerta_solicitar_ingreso(
  p_nombre text, p_tipo_ticket_id int, p_evento_id int,
  p_rut text default null, p_telefono text default null,
  p_instagram text default null, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_id bigint; v_tnom text; v_tev int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if v_rol is null or v_rol not in ('admin','portero','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Solo personal de puerta');
  end if;
  if coalesce(btrim(p_nombre),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre');
  end if;

  -- El tipo de entrada NO es opcional: es el punto de todo esto.
  if p_tipo_ticket_id is null then
    return jsonb_build_object('ok', false, 'error', 'Tienes que elegir qué entrada le estás autorizando');
  end if;
  select nombre, evento_id into v_tnom, v_tev from public.tipos_ticket where id = p_tipo_ticket_id;
  if v_tnom is null then
    return jsonb_build_object('ok', false, 'error', 'Ese tipo de entrada no existe');
  end if;
  if p_evento_id is not null and v_tev is not null and v_tev <> p_evento_id then
    return jsonb_build_object('ok', false, 'error', 'Esa entrada es de otro evento');
  end if;

  -- Anti-doble-toque: si ya hay una pendiente para el mismo nombre y evento, se devuelve esa.
  select id into v_id from public.puerta_solicitudes
   where estado='pendiente' and evento_id is not distinct from p_evento_id
     and upper(btrim(nombre)) = upper(btrim(p_nombre))
   order by solicitada_at desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'repetida', true);
  end if;

  insert into public.puerta_solicitudes(evento_id, nombre, rut, telefono, instagram,
                                        tipo_ticket_id, nombre_ticket, motivo)
  values (p_evento_id, upper(btrim(p_nombre)), nullif(btrim(coalesce(p_rut,'')),''),
          nullif(btrim(coalesce(p_telefono,'')),''), nullif(btrim(coalesce(p_instagram,'')),''),
          p_tipo_ticket_id, v_tnom, nullif(btrim(coalesce(p_motivo,'')),''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'ticket', v_tnom);
end; $$;


-- ── 3) RESOLVER: aprobar o rechazar (SOLO admin) ──
-- Al aprobar hace exactamente lo que hacía la puerta sola, pero con el tipo de
-- entrada elegido y firmado con el nombre de quien autorizó.
create or replace function public.puerta_resolver_ingreso(
  p_id bigint, p_aprobar boolean, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rol text; v_quien text; s record; v_pedido bigint; v_qr text; v_evnom text;
begin
  select rol, coalesce(nullif('@'||username,'@'), nullif(btrim(nombres||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_quien
    from public.clientes where id = auth.uid();
  if v_rol <> 'admin' then
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

  -- ── APROBADA: se crea la entrada, con su tipo, y se marca el ingreso ──
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

  -- Entra en el mismo acto (ya está parado en la puerta)
  begin
    insert into public.qr_usados(qr_id, pedido_id, escaneado_por, gate_id)
    values (v_qr, v_pedido, coalesce(s.solicitada_por, auth.uid()), 'PUERTA-VIP');
  exception when others then null; end;

  -- CRM
  begin perform public.personas_upsert(s.nombre, s.rut, null, s.telefono, s.instagram, 'puerta', false);
  exception when others then null; end;

  -- Log de siempre, ahora con el tipo y quién autorizó en el motivo
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


-- ── 4) La puerta consulta cómo quedó su solicitud ──
create or replace function public.puerta_estado_solicitud(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; s record;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if v_rol is null or v_rol not in ('admin','portero','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select estado, resuelta_nombre, nota, nombre, nombre_ticket
    into s from public.puerta_solicitudes where id = p_id;
  if s.estado is null then return jsonb_build_object('ok', false, 'error', 'No existe'); end if;
  return jsonb_build_object('ok', true, 'estado', s.estado, 'quien', s.resuelta_nombre,
                            'nota', s.nota, 'nombre', s.nombre, 'ticket', s.nombre_ticket);
end; $$;


-- ── 5) El portero ya NO puede registrar ingresos por su cuenta ──
-- La función vieja queda solo para admin (el admin que está parado en la puerta
-- ES la autorización presencial). El portero pasa por la bandeja.
create or replace function public.puerta_capturar_cliente(
  p_nombre text, p_rut text default null, p_telefono text default null,
  p_instagram text default null, p_motivo text default null, p_evento_id int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin') then
    return jsonb_build_object('ok', false,
      'error', 'Los ingresos nuevos ahora los autoriza un admin. Usa "Pedir autorización".');
  end if;
  return jsonb_build_object('ok', false,
    'error', 'Usa el flujo con tipo de entrada: pide la autorización y apruébala.');
end; $$;

grant execute on function public.puerta_solicitar_ingreso(text,int,int,text,text,text,text) to authenticated;
grant execute on function public.puerta_resolver_ingreso(bigint,boolean,text)               to authenticated;
grant execute on function public.puerta_estado_solicitud(bigint)                            to authenticated;


-- ── 6) Verificación ──
select 'tabla puerta_solicitudes' as chequeo,
       case when exists(select 1 from information_schema.tables
                        where table_schema='public' and table_name='puerta_solicitudes')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'RLS activa',
       case when (select rowsecurity from pg_tables where tablename='puerta_solicitudes')
            then '✅ ok' else '❌ abierta' end
union all
select 'función solicitar',  case when exists(select 1 from pg_proc where proname='puerta_solicitar_ingreso') then '✅ ok' else '❌ falta' end
union all
select 'función resolver',   case when exists(select 1 from pg_proc where proname='puerta_resolver_ingreso')  then '✅ ok' else '❌ falta' end
union all
select 'función estado',     case when exists(select 1 from pg_proc where proname='puerta_estado_solicitud')  then '✅ ok' else '❌ falta' end
union all
select 'la puerta ya no crea ingresos sola',
       case when (select prosrc from pg_proc where proname='puerta_capturar_cliente') like '%Pedir autorización%'
            then '✅ cerrada' else '🚨 sigue abierta' end;

-- ============================================================
-- ⚠️ ANTES DE CORRER, TEN CLARO ESTO:
--
-- Desde que corras esto, un portero NO puede dejar entrar a nadie que no
-- tenga QR sin que un admin lo apruebe. Si un sábado a las 2 AM no hay
-- ningún admin mirando el panel, esa persona SE QUEDA AFUERA.
--
-- Es exactamente lo que pediste. Pero es una decisión de operación, no de
-- software: asegúrate de que siempre haya un admin con el panel abierto,
-- o que un admin esté físicamente en la puerta (ese puede aprobar en el acto
-- desde su propio teléfono).
-- ============================================================
