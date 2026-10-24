-- ============================================================
-- FRATE — PORTAL DEL RRPP (self-service embajadoras).
-- Cada RRPP entra a /rrpp con su cuenta y ve/crea SUS listas,
-- cupos, cuántos llegaron y sus ventas por código.
-- Todo scoped a auth.uid() (SECURITY DEFINER + gate por rol).
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- Reusa: listas.duenio_id, lista_inscritos, codigos.duenio_id,
--        stats_codigos() (ventas), qr_usados (check-ins).
-- ============================================================

-- ── Helper: ¿el que llama es RRPP o admin? ───────────────────
create or replace function public.rrpp_ok() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp'));
$$;

-- ── 1) RESUMEN: mis listas con cupos / inscritos / llegaron ──
create or replace function public.rrpp_resumen() returns json
language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nombre text; v json;
begin
  select rol, coalesce(nullif(trim(nombres),''), nullif(trim(nombre),''), 'RRPP')
    into v_rol, v_nombre from clientes where id = auth.uid();
  if v_rol is null or v_rol not in ('admin','rrpp') then
    return json_build_object('error','Sin permiso');
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.fecha desc nulls last, t.id desc), '[]'::json)
    into v from (
    select l.id, l.codigo, l.nombre, l.tipo, l.estado, l.cupos, l.evento_id,
           (select e.nombre from eventos e where e.id = l.evento_id) as evento_nombre,
           coalesce((select to_char(e.fecha,'YYYY-MM-DD') from eventos e where e.id = l.evento_id),
                    l.fecha::text) as fecha,
           (select count(*) from lista_inscritos li where li.lista_id = l.id) as inscritos,
           (select count(*) from lista_inscritos li
              where li.lista_id = l.id and li.pedido_cortesia_id is not null
                and exists(select 1 from items_pedido ip
                             join qr_usados qu on ip.qr_ids ? qu.qr_id
                           where ip.pedido_id = li.pedido_cortesia_id)) as llegaron
    from listas l
    where l.duenio_id = auth.uid()
  ) t;

  return json_build_object('nombre', v_nombre, 'es_admin', v_rol = 'admin', 'listas', v);
end; $$;
grant execute on function public.rrpp_resumen() to authenticated;

-- ── 2) DETALLE de una lista mía (verifica dueño) ─────────────
create or replace function public.rrpp_lista_detalle(p_lista_id integer) returns json
language plpgsql security definer set search_path = public as $$
declare v_own boolean; v_nombre text; v_cupos int; v_cod text; v json;
begin
  if not rrpp_ok() then return json_build_object('error','Sin permiso'); end if;
  select (l.duenio_id = auth.uid()), l.nombre, l.cupos, l.codigo
    into v_own, v_nombre, v_cupos, v_cod from listas l where l.id = p_lista_id;
  if v_own is null then return json_build_object('error','La lista no existe'); end if;
  if not v_own  then return json_build_object('error','Esa lista no es tuya'); end if;

  select coalesce(json_agg(row_to_json(t) order by t.entered desc, t.nombre), '[]'::json)
    into v from (
    select li.id, li.nombre, li.rut, li.estado,
           (li.pedido_cortesia_id is not null
             and exists(select 1 from items_pedido ip
                          join qr_usados qu on ip.qr_ids ? qu.qr_id
                        where ip.pedido_id = li.pedido_cortesia_id)) as entered
    from lista_inscritos li where li.lista_id = p_lista_id
  ) t;

  return json_build_object('ok', true, 'nombre', v_nombre, 'codigo', v_cod,
                           'cupos', v_cupos, 'inscritos', v);
end; $$;
grant execute on function public.rrpp_lista_detalle(integer) to authenticated;

-- ── 3) CREAR una lista (queda mía, aprobada, emisión = admin) ─
create or replace function public.rrpp_crear_lista(
  p_evento_id integer, p_nombre text, p_cupos integer default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nombre text; v_cod text; v_id int; v_fecha date; v_try int := 0;
begin
  select rol, coalesce(nullif(trim(nombres),''), nullif(trim(nombre),''), 'RRPP')
    into v_rol, v_nombre from clientes where id = auth.uid();
  if v_rol is null or v_rol not in ('admin','rrpp') then
    return json_build_object('error','Sin permiso');
  end if;
  if coalesce(trim(p_nombre),'') = '' then
    return json_build_object('error','Ponle un nombre a la lista');
  end if;
  select fecha into v_fecha from eventos where id = p_evento_id;

  -- código único (R + 7 hex); reintenta si choca
  loop
    v_try := v_try + 1;
    v_cod := 'R' || upper(substr(md5(random()::text || clock_timestamp()::text || v_try::text), 1, 7));
    exit when not exists(select 1 from listas where codigo = v_cod);
    if v_try > 8 then return json_build_object('error','No pude generar el código, reintenta'); end if;
  end loop;

  insert into listas (nombre, evento_id, fecha, cupos, duenio_id, duenio_nombre,
                      codigo, estado, tipo, origen, requires_manual_approval)
  values (trim(p_nombre), p_evento_id, v_fecha, nullif(coalesce(p_cupos,0),0),
          auth.uid(), v_nombre, v_cod, 'aprobada', 'guest_list', 'rrpp', true)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'codigo', v_cod);
end; $$;
grant execute on function public.rrpp_crear_lista(integer, text, integer) to authenticated;

-- ── 4) AGREGAR un invitado a mi lista (respeta cupo) ─────────
create or replace function public.rrpp_agregar_inscrito(
  p_lista_id integer, p_nombre text, p_rut text default null,
  p_email text default null, p_telefono text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_own boolean; v_cupos int; v_count int;
begin
  if not rrpp_ok() then return json_build_object('error','Sin permiso'); end if;
  select (duenio_id = auth.uid()), cupos into v_own, v_cupos from listas where id = p_lista_id;
  if v_own is null then return json_build_object('error','La lista no existe'); end if;
  if not v_own  then return json_build_object('error','Esa lista no es tuya'); end if;
  if coalesce(trim(p_nombre),'') = '' then return json_build_object('error','Falta el nombre'); end if;

  if v_cupos is not null and v_cupos > 0 then
    select count(*) into v_count from lista_inscritos where lista_id = p_lista_id;
    if v_count >= v_cupos then
      return json_build_object('error', 'Lista llena (' || v_cupos || ' cupos)');
    end if;
  end if;

  insert into lista_inscritos (lista_id, nombre, rut, email, telefono, estado, origen)
  values (p_lista_id, upper(trim(p_nombre)), nullif(trim(p_rut),''),
          nullif(trim(p_email),''), nullif(trim(p_telefono),''), 'pendiente', 'rrpp');

  return json_build_object('ok', true,
    'inscritos', (select count(*) from lista_inscritos where lista_id = p_lista_id));
end; $$;
grant execute on function public.rrpp_agregar_inscrito(integer, text, text, text, text) to authenticated;

-- ── Verificación ─────────────────────────────────────────────
select 'rrpp_ok'             as check, case when exists(select 1 from pg_proc where proname='rrpp_ok')             then 'OK' else 'FALTA' end
union all select 'rrpp_resumen',        case when exists(select 1 from pg_proc where proname='rrpp_resumen')        then 'OK' else 'FALTA' end
union all select 'rrpp_lista_detalle',  case when exists(select 1 from pg_proc where proname='rrpp_lista_detalle')  then 'OK' else 'FALTA' end
union all select 'rrpp_crear_lista',    case when exists(select 1 from pg_proc where proname='rrpp_crear_lista')    then 'OK' else 'FALTA' end
union all select 'rrpp_agregar_inscrito', case when exists(select 1 from pg_proc where proname='rrpp_agregar_inscrito') then 'OK' else 'FALTA' end;
