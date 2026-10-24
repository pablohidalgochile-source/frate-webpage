-- ============================================================
-- FRATE · QUIÉN HIZO CADA COSA CON LA PLATA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- PROBLEMA: hay 79 escrituras del panel que mueven plata —devolver, anular,
-- borrar, abrir cupo, marcar pagado, emitir cortesías— y NINGUNA guarda quién
-- las hizo. El sistema sabe QUÉ pasó; no sabe QUIÉN. Con 5 cuentas de admin,
-- eso significa que cualquiera de las cinco puede sacar plata sin dejar rastro.
--
-- ESTO AGREGA DOS COSAS:
--   1. Una BITÁCORA a prueba de manos: se inserta y no se puede editar ni borrar.
--   2. Que BORRAR una orden deje de ser un borrado. Pasa a ser una anulación
--      con motivo y firma. Borrar evidencia no puede ser un botón.
--
-- 🔒 LO IMPORTANTE: el nombre de quien firma lo pone el SERVIDOR desde
--    auth.uid(). El navegador no puede mentir sobre quién es. Si dejáramos
--    que el cliente mandara el nombre, la bitácora no valdría nada.
--
-- Idempotente.
-- ============================================================

-- ── 1) La bitácora ──
create table if not exists public.bitacora_admin (
  id           bigserial primary key,
  accion       text not null,          -- devolver · anular · borrar_cortesia · dar_cupo · marcar_pagado · emitir_cortesias
  pedido_id    bigint,
  evento_id    int,
  monto        integer default 0,
  detalle      jsonb,
  actor_id     uuid,                   -- de auth.uid(), no del navegador
  actor_nombre text not null,
  actor_rol    text,
  creado_at    timestamptz default now()
);
create index if not exists idx_bitacora_fecha  on public.bitacora_admin(creado_at desc);
create index if not exists idx_bitacora_actor  on public.bitacora_admin(actor_id, creado_at desc);
create index if not exists idx_bitacora_pedido on public.bitacora_admin(pedido_id);

alter table public.bitacora_admin enable row level security;

drop policy if exists bitacora_admin_read on public.bitacora_admin;
create policy bitacora_admin_read on public.bitacora_admin for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

-- A prueba de manos: se escribe SOLO por la función de abajo, y nunca se corrige.
revoke insert, update, delete on public.bitacora_admin from anon, authenticated;


-- ── 2) Registrar (la única puerta de entrada a la bitácora) ──
create or replace function public.bitacora_registrar(
  p_accion text, p_pedido_id bigint default null, p_evento_id int default null,
  p_monto integer default 0, p_detalle jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text;
begin
  -- 🔒 El actor sale del login. El navegador NO manda el nombre.
  select rol,
         coalesce(nullif('@'||username,'@'),
                  nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''),
                  email, 'desconocido')
    into v_rol, v_nom
    from public.clientes where id = auth.uid();

  if v_rol is null then
    -- Sin sesión válida no se registra ni se finge que sí.
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  insert into public.bitacora_admin(accion, pedido_id, evento_id, monto, detalle,
                                    actor_id, actor_nombre, actor_rol)
  values (p_accion, p_pedido_id, p_evento_id, coalesce(p_monto,0), p_detalle,
          auth.uid(), v_nom, v_rol);

  return jsonb_build_object('ok', true, 'actor', v_nom);
end; $$;
grant execute on function public.bitacora_registrar(text,bigint,int,integer,jsonb) to authenticated;


-- ── 3) Anular en vez de borrar ──
alter table public.pedidos add column if not exists anulada_por    text;
alter table public.pedidos add column if not exists anulada_por_id uuid;
alter table public.pedidos add column if not exists anulada_at     timestamptz;
alter table public.pedidos add column if not exists anulada_motivo text;

-- La anulación también la hace el servidor, para que la firma sea real y para
-- que no se pueda anular sin motivo.
create or replace function public.anular_pedido(p_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v_est text; v_monto int; v_ev int;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if v_rol <> 'admin' then return jsonb_build_object('ok', false, 'error', 'Solo admin'); end if;
  if coalesce(btrim(p_motivo),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Tienes que decir por qué se anula');
  end if;

  select estado, coalesce(total_pagado, total, 0) into v_est, v_monto
    from public.pedidos where id = p_id;
  if v_est is null then return jsonb_build_object('ok', false, 'error', 'No existe esa orden'); end if;
  if v_est = 'anulado' then return jsonb_build_object('ok', false, 'error', 'Ya estaba anulada'); end if;

  select ip.evento_id into v_ev from public.items_pedido ip where ip.pedido_id = p_id limit 1;

  -- Se marca. NO se borra: los items y los QR quedan como prueba de lo que hubo.
  update public.pedidos
     set estado = 'anulado', anulada_por = v_nom, anulada_por_id = auth.uid(),
         anulada_at = now(), anulada_motivo = btrim(p_motivo)
   where id = p_id;

  perform public.bitacora_registrar('anular', p_id, v_ev, v_monto,
            jsonb_build_object('estado_anterior', v_est, 'motivo', btrim(p_motivo)));

  return jsonb_build_object('ok', true, 'estado_anterior', v_est, 'actor', v_nom);
end; $$;
grant execute on function public.anular_pedido(bigint,text) to authenticated;


-- ── 4) La nota de crédito lleva su emisor (lo necesita el contador) ──
alter table public.notas_credito add column if not exists emitida_por    text;
alter table public.notas_credito add column if not exists emitida_por_id uuid;


-- ── 5) Verificación ──
select 'tabla bitacora_admin' as chequeo,
       case when exists(select 1 from information_schema.tables
                        where table_schema='public' and table_name='bitacora_admin')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'bitácora a prueba de manos (sin update/delete)',
       case when not has_table_privilege('authenticated','public.bitacora_admin','update')
             and not has_table_privilege('authenticated','public.bitacora_admin','delete')
            then '✅ ok' else '🚨 se puede editar' end
union all
select 'función bitacora_registrar',
       case when exists(select 1 from pg_proc where proname='bitacora_registrar') then '✅ ok' else '❌ falta' end
union all
select 'función anular_pedido',
       case when exists(select 1 from pg_proc where proname='anular_pedido') then '✅ ok' else '❌ falta' end
union all
select 'columnas de anulación en pedidos',
       case when exists(select 1 from information_schema.columns
                        where table_name='pedidos' and column_name='anulada_por')
            then '✅ ok' else '❌ falta' end
union all
select 'emisor en notas_credito',
       case when exists(select 1 from information_schema.columns
                        where table_name='notas_credito' and column_name='emitida_por')
            then '✅ ok' else '❌ falta' end;

-- ============================================================
-- QUÉ CAMBIA EN LA PRÁCTICA
--
--   · El botón 🗑️ de Órdenes deja de borrar. Pide motivo y anula.
--     La orden sigue ahí, en gris, con quién la anuló y por qué.
--   · Devolver, abrir cupo, marcar pagado y emitir cortesías quedan
--     escritos con nombre y hora.
--   · Nadie puede editar ni borrar la bitácora. Ni un admin.
--
-- Para mirarla:
--   select creado_at, actor_nombre, accion, pedido_id, monto, detalle
--     from bitacora_admin order by creado_at desc limit 50;
-- ============================================================
