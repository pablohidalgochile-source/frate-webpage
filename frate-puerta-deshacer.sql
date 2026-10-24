-- ============================================================
-- FRATE · DESHACER, DESVALIDAR Y REGISTRAR RECHAZOS EN LA PUERTA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- TRES COSAS QUE FALTABAN:
--
--   1. DESHACER — el portero se equivocó y lo ve al segundo. Puede revertir
--      SU PROPIO último escaneo, dentro de una ventana corta. Sin pedir
--      permiso: está ahí mirando y pedir firma para eso es fricción tonta.
--
--   2. DESVALIDAR — la entrada se usó hace horas o días y hay que devolverla
--      (compró mal, reclamo, se quemó por error). Esto SÍ lo firma un admin:
--      es una llave peligrosa — desvalidar una entrada real y revenderla es
--      una forma de robar.
--
--   3. RECHAZO REGISTRADO — cuando alguien NO entra (ebriedad, el carnet no
--      coincide, vetado), hoy no queda nada escrito. La entrada NO se quema
--      y el motivo se guarda: es lo que después justifica una devolución.
--
-- Idempotente.
-- ============================================================

-- ── 0) Cuántos minutos puede deshacer el portero ──
insert into public.config_valores(clave, valor)
select 'puerta_deshacer_minutos', '5'
where not exists (select 1 from public.config_valores where clave='puerta_deshacer_minutos');


-- ── 1) DESHACER · el propio portero, ventana corta ──
create or replace function public.puerta_deshacer(p_qr text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v_min int; u record;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','portero') then
    return jsonb_build_object('ok', false, 'error', 'Solo personal de puerta');
  end if;

  select coalesce(nullif(valor,'')::int, 5) into v_min
    from public.config_valores where clave='puerta_deshacer_minutos';
  v_min := coalesce(v_min, 5);

  select * into u from public.qr_usados where qr_id = p_qr;
  if u.qr_id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa entrada no está marcada como usada');
  end if;

  -- 🔒 Solo el propio escaneo, y solo recién hecho. Un portero no puede
  --    deshacer lo de otro ni algo de anoche: para eso está desvalidar.
  if v_rol <> 'admin' and u.escaneado_por is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Ese ingreso lo registró otra persona. Pídele a un admin que lo desvalide.');
  end if;
  if u.created_at < now() - (v_min || ' minutes')::interval then
    return jsonb_build_object('ok', false, 'error',
      'Pasaron más de ' || v_min || ' minutos. Ahora tiene que desvalidarlo un admin.');
  end if;

  delete from public.qr_usados where qr_id = p_qr;

  begin
    insert into public.puerta_rechazos(qr_id, evento_id, nombre, motivo, nota, portero_id)
    select p_qr, ip.evento_id, ip.nombre_asistente, 'deshecho',
           'El portero deshizo su propio ingreso', auth.uid()
      from public.items_pedido ip
     where ip.qr_ids ? p_qr limit 1;
  exception when others then null; end;

  begin perform public.bitacora_registrar('puerta_deshacer', u.pedido_id, null, 0,
    jsonb_build_object('qr', p_qr, 'por', v_nom));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'actor', v_nom);
end; $$;


-- ── 2) DESVALIDAR · solo admin, con motivo ──
create or replace function public.puerta_desvalidar(
  p_qr text, p_motivo text, p_para_devolucion boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; u record; v_ped bigint;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin puede desvalidar una entrada');
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Tienes que decir por qué se desvalida');
  end if;

  select * into u from public.qr_usados where qr_id = p_qr;
  if u.qr_id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa entrada no está marcada como usada');
  end if;
  v_ped := u.pedido_id;

  delete from public.qr_usados where qr_id = p_qr;

  begin
    insert into public.puerta_rechazos(qr_id, evento_id, nombre, motivo, nota, portero_id)
    select p_qr, ip.evento_id, ip.nombre_asistente, 'desvalidada',
           btrim(p_motivo) || ' · desvalidó ' || v_nom, auth.uid()
      from public.items_pedido ip
     where ip.qr_ids ? p_qr limit 1;
  exception when others then null; end;

  -- Si se pidió, queda en la bandeja de devoluciones para que alguien decida.
  if coalesce(p_para_devolucion, false) and v_ped is not null then
    begin
      update public.pedidos
         set dev_estado = 'pendiente',
             dev_motivo = 'Entrada desvalidada: ' || btrim(p_motivo),
             dev_solicitada_at = now()
       where id = v_ped and coalesce(dev_estado,'') <> 'procesada';
    exception when others then null; end;
  end if;

  begin perform public.bitacora_registrar('puerta_desvalidar', v_ped, null, 0,
    jsonb_build_object('qr', p_qr, 'motivo', btrim(p_motivo),
                       'para_devolucion', coalesce(p_para_devolucion,false),
                       'usada_el', u.created_at));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'actor', v_nom, 'pedido_id', v_ped);
end; $$;


-- ── 3) RECHAZO · no entra, y la entrada NO se quema ──
create table if not exists public.puerta_rechazos (
  id          bigserial primary key,
  qr_id       text,
  evento_id   int,
  nombre      text,
  motivo      text not null,          -- ebriedad · carnet · fecha · vetado · se_fue · otro
  nota        text,
  portero_id  uuid default auth.uid(),
  created_at  timestamptz default now()
);
create index if not exists idx_prech_evento on public.puerta_rechazos(evento_id, created_at desc);
create index if not exists idx_prech_qr     on public.puerta_rechazos(qr_id);

alter table public.puerta_rechazos enable row level security;
drop policy if exists prech_staff on public.puerta_rechazos;
create policy prech_staff on public.puerta_rechazos for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero','rrpp')));
revoke insert, update, delete on public.puerta_rechazos from anon, authenticated;

create or replace function public.puerta_rechazar(
  p_qr text, p_motivo text, p_nombre text default null,
  p_evento_id int default null, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','portero') then
    return jsonb_build_object('ok', false, 'error', 'Solo personal de puerta');
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el motivo');
  end if;

  -- ⚠️ Acá NO se toca qr_usados: la entrada queda VÁLIDA. Solo se anota que
  --    esta persona no entró y por qué.
  insert into public.puerta_rechazos(qr_id, evento_id, nombre, motivo, nota)
  values (nullif(btrim(coalesce(p_qr,'')),''), p_evento_id,
          nullif(btrim(coalesce(p_nombre,'')),''), btrim(p_motivo),
          nullif(btrim(coalesce(p_nota,'')),''));

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.puerta_deshacer(text)                         to authenticated;
grant execute on function public.puerta_desvalidar(text,text,boolean)          to authenticated;
grant execute on function public.puerta_rechazar(text,text,text,int,text)      to authenticated;


-- ── 4) Verificación ──
select 'tabla puerta_rechazos' as chequeo,
       case when exists(select 1 from information_schema.tables where table_name='puerta_rechazos') then '✅ ok' else '❌ falta' end as estado
union all
select 'función puerta_deshacer',
       case when exists(select 1 from pg_proc where proname='puerta_deshacer') then '✅ ok' else '❌ falta' end
union all
select 'función puerta_desvalidar',
       case when exists(select 1 from pg_proc where proname='puerta_desvalidar') then '✅ ok' else '❌ falta' end
union all
select 'función puerta_rechazar',
       case when exists(select 1 from pg_proc where proname='puerta_rechazar') then '✅ ok' else '❌ falta' end
union all
select 'ventana para deshacer (minutos)',
       coalesce((select valor from public.config_valores where clave='puerta_deshacer_minutos'), '❌ falta');

-- ============================================================
-- ⚠️ UNA COSA QUE ESTO NO ARREGLA
--
-- Al deshacer o desvalidar se borra el registro de ingreso, pero el contador
-- `personas.visitas` ya subió y NO baja. Ese contador ya estaba mal por otro
-- motivo (le carga la visita al comprador, no a quien entró) y se arregla
-- aparte. El aforo, el tablero de la noche y los QR sí quedan correctos.
-- ============================================================
