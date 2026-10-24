-- ============================================================
-- FRATE — Captura de cliente nuevo en la PUERTA (VIP/artista/conocido)
-- El portero mete a alguien que no está en ninguna lista: genera una
-- cortesía $0 (SIN correo) para que CUENTE en el aforo, la marca como
-- ingresada (check-in), lo mete al CRM y lo registra en un log.
-- Correr en el Supabase de la WEB. Idempotente.
-- ============================================================

-- Log de ingresos manuales
create table if not exists public.ingresos_manuales (
  id         bigserial primary key,
  nombre     text,
  rut        text,
  telefono   text,
  instagram  text,
  motivo     text,
  evento_id  int,
  portero_id uuid,
  created_at timestamptz default now()
);
create index if not exists ingresos_manuales_evento_idx on public.ingresos_manuales (evento_id, created_at desc);
alter table public.ingresos_manuales enable row level security;
drop policy if exists "ingman_admin_read" on public.ingresos_manuales;
create policy "ingman_admin_read" on public.ingresos_manuales for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','portero')));

-- RPC: captura + cortesía $0 (sin correo) + check-in + CRM + log
create or replace function public.puerta_capturar_cliente(
  p_nombre text, p_rut text default null, p_telefono text default null,
  p_instagram text default null, p_motivo text default null, p_evento_id int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rol text; v_pedido bigint; v_qr text; v_evnom text;
begin
  select rol into v_rol from public.clientes where id = v_uid;
  if v_rol is null or v_rol not in ('admin','portero') then
    return jsonb_build_object('ok', false, 'error', 'Solo admin/portero');
  end if;
  if coalesce(btrim(p_nombre),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre');
  end if;
  select nombre into v_evnom from public.eventos where id = p_evento_id;

  -- 1) Cortesía $0 (SIN correo) → cuenta en el aforo total
  insert into public.pedidos(nombre_cliente, email_cliente, estado, total, fee_servicio, total_pagado, metodo_pago, referencia_pago, fecha_pago)
  values (p_nombre, null, 'pagado', 0, 0, 0, 'cortesia', 'PUERTA-VIP', now())
  returning id into v_pedido;
  v_qr := 'FCC-'||v_pedido||'-PUERTA-0';
  insert into public.items_pedido(pedido_id, producto_tipo, evento_id, nombre_evento, nombre_ticket, cantidad, precio_unitario, personas, qr_ids, nombre_asistente, rut_asistente)
  values (v_pedido, 'ticket', p_evento_id, coalesce(v_evnom, 'Ingreso puerta'), coalesce('Ingreso · '||nullif(p_motivo,''), 'Ingreso VIP / puerta'), 1, 0,
          jsonb_build_array(jsonb_build_object('nombre', p_nombre, 'rut', coalesce(p_rut,''))), jsonb_build_array(v_qr), p_nombre, coalesce(p_rut,''));

  -- 2) Marcar como INGRESÓ (check-in) → cuenta como asistencia
  begin
    insert into public.qr_usados(qr_id, pedido_id, escaneado_por, gate_id) values (v_qr, v_pedido, v_uid, 'PUERTA-VIP');
  exception when others then null; end;

  -- 3) CRM: sumar instagram/teléfono (la visita la agrega el trigger del check-in)
  begin perform public.personas_upsert(p_nombre, p_rut, null, p_telefono, p_instagram, 'puerta', false); exception when others then null; end;

  -- 4) Log de ingreso manual
  begin
    insert into public.ingresos_manuales(nombre, rut, telefono, instagram, motivo, evento_id, portero_id)
    values (p_nombre, nullif(btrim(coalesce(p_rut,'')),''), p_telefono, p_instagram, p_motivo, p_evento_id, v_uid);
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'qr', v_qr);
end; $$;
grant execute on function public.puerta_capturar_cliente(text, text, text, text, text, int) to authenticated;

select 'puerta_capturar_cliente' as check,
       case when exists(select 1 from pg_proc where proname='puerta_capturar_cliente') then 'OK' else 'FALTA' end,
       case when exists(select 1 from pg_tables where tablename='ingresos_manuales') then 'OK' else 'FALTA' end;
