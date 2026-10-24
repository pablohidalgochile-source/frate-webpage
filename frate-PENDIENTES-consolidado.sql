-- ================================================================
-- FRATE — SQL PENDIENTE CONSOLIDADO (correr en Supabase WEB: ydwlpra…)
-- Generado 2026-07-12. Todo idempotente (create or replace / if not exists).
-- Verificado por REST antes de armar este archivo:
--   ✅ YA corridos (NO incluidos): frate-puerta-grupo, frate-link, frate-biblioteca-ticket
--   ▶ Incluidos abajo:
--       1) evento_reporte  → FALTABA por completo
--       2) evento_vivo     → re-aplicar por si era versión vieja
--       3) personas_upsert → re-aplicar para asegurar el FIX de dedup
-- ================================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║ 1/3 · frate-evento-reporte.sql  (FALTABA)                   ║
-- ╚════════════════════════════════════════════════════════════╝
-- ============================================================
-- FRATE — Reporte POST-EVENTO: asistencia real vs emitida, no-shows,
-- curva de llegada (por hora), desglose por lista/tipo y por género.
-- Toda la data ya existe en qr_usados / items_pedido / pedidos.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create or replace function public.evento_reporte(p_evento int)
returns json language plpgsql security definer set search_path = public as $$
declare v json; v_nombre text; v_fecha date; v_aforo int;
begin
  if not exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','portero')) then
    return json_build_object('error','Sin permiso');
  end if;
  select nombre, fecha, aforo into v_nombre, v_fecha, v_aforo from public.eventos where id = p_evento;

  with ck as (
    select qu.qr_id,
           qu.created_at                                   as hora,
           (coalesce(qu.incidencia::text,'') <> '')        as incidencia,
           lower(coalesce(x.per->>'genero',''))            as genero,
           coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as ticket
    from public.qr_usados qu
    join public.items_pedido ip on ip.qr_ids ? qu.qr_id and ip.evento_id = p_evento
    join public.pedidos p on p.id = ip.pedido_id
    left join lateral (
      select ip.personas -> (pos.i::int - 1) as per
      from jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
      where pos.qr = qu.qr_id limit 1
    ) x on true
  ),
  emit_lbl as (
    select coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as label,
           sum(jsonb_array_length(ip.qr_ids))::int as total
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
    group by 1
  )
  select json_build_object(
    'evento',      v_nombre,
    'fecha',       v_fecha,
    'aforo',       v_aforo,
    'emitidas',    (select coalesce(sum(total),0) from emit_lbl),
    'entraron',    (select count(*) from ck where not incidencia),
    'incidencias', (select count(*) from ck where incidencia),
    'genero', (select json_build_object(
        'F',    count(*) filter (where genero in ('f','femenino','mujer')),
        'M',    count(*) filter (where genero in ('m','masculino','hombre')),
        'otro', count(*) filter (where genero = '' or genero not in ('f','femenino','mujer','m','masculino','hombre'))
      ) from ck where not incidencia),
    'por_hora', (select coalesce(json_agg(row_to_json(h) order by h.hora), '[]'::json) from (
        select to_char(date_trunc('hour', hora at time zone 'America/Santiago'), 'HH24:00') as hora, count(*)::int as n
        from ck where not incidencia group by 1) h),
    'por_lista', (select coalesce(json_agg(row_to_json(d) order by d.total desc, d.label), '[]'::json) from (
        select e.label,
               coalesce((select count(*)::int from ck where not ck.incidencia and ck.ticket = e.label), 0) as llegaron,
               e.total,
               (select min(hora) from ck where not ck.incidencia and ck.ticket = e.label) as primera,
               (select max(hora) from ck where not ck.incidencia and ck.ticket = e.label) as ultima
        from emit_lbl e) d),
    'ts', extract(epoch from now())
  ) into v;
  return v;
end; $$;
grant execute on function public.evento_reporte(int) to authenticated;

select 'evento_reporte' as check,
       case when exists(select 1 from pg_proc where proname='evento_reporte') then 'OK' else 'FALTA' end;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ 2/3 · frate-evento-vivo.sql  (asegurar última versión)      ║
-- ╚════════════════════════════════════════════════════════════╝
-- ============================================================
-- FRATE — "PUERTA EN VIVO": conteo + feed en tiempo real de la puerta
-- Un solo RPC devuelve TODO para el tablero: cuántos entraron, aforo,
-- ritmo (últimos 10 min), desglose por lista/tipo, género y el FEED
-- (últimos que entraron, el más reciente ARRIBA).
-- También agrega columna `aforo` al evento (capacidad, opcional).
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

alter table public.eventos add column if not exists aforo int;

create or replace function public.evento_vivo(p_evento int)
returns json language plpgsql security definer set search_path = public as $$
declare v json; v_aforo int; v_nombre text;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select aforo, nombre into v_aforo, v_nombre from public.eventos where id = p_evento;

  with ck as (
    select qu.qr_id,
           qu.created_at                                   as hora,
           (coalesce(qu.incidencia::text, '') <> '')       as incidencia,   -- incidencia es TEXTO (motivo); true si viene con algo
           coalesce(x.per->>'nombre', p.nombre_cliente)    as nombre,
           x.per->>'rut'                                   as rut,
           lower(coalesce(x.per->>'genero',''))            as genero,
           coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as ticket
    from public.qr_usados qu
    join public.items_pedido ip on ip.qr_ids ? qu.qr_id and ip.evento_id = p_evento
    join public.pedidos p on p.id = ip.pedido_id
    left join lateral (
      select ip.personas -> (pos.i::int - 1) as per
      from jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
      where pos.qr = qu.qr_id
      limit 1
    ) x on true
  ),
  emit as (
    select coalesce(sum(jsonb_array_length(ip.qr_ids)), 0) as n
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
  ),
  -- Emitidos POR lista/tipo (cuántos ERAN de cada una)
  emit_lbl as (
    select coalesce(nullif(ip.condiciones->>'titulo',''), ip.nombre_ticket, 'Entrada') as label,
           sum(jsonb_array_length(ip.qr_ids))::int as total
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    where ip.evento_id = p_evento
    group by 1
  )
  select json_build_object(
    'evento',      v_nombre,
    'aforo',       v_aforo,
    'emitidas',    (select n from emit),
    'entraron',    (select count(*) from ck where not incidencia),
    'incidencias', (select count(*) from ck where incidencia),
    'ritmo_10min', (select count(*) from ck where not incidencia and hora > now() - interval '10 minutes'),
    'genero', (select json_build_object(
        'F',    count(*) filter (where genero in ('f','femenino','mujer')),
        'M',    count(*) filter (where genero in ('m','masculino','hombre')),
        'otro', count(*) filter (where genero = '' or genero not in ('f','femenino','mujer','m','masculino','hombre'))
      ) from ck where not incidencia),
    'desglose', (select coalesce(json_agg(row_to_json(d) order by d.total desc, d.label), '[]'::json)
        from (
          select e.label,
                 coalesce((select count(*)::int from ck where not ck.incidencia and ck.ticket = e.label), 0) as llegaron,
                 e.total
          from emit_lbl e
        ) d),
    'feed', (select coalesce(json_agg(row_to_json(f) order by f.hora desc), '[]'::json)
        from (select nombre, rut, hora, ticket as nombre_ticket, incidencia from ck order by hora desc limit 80) f),
    'ts', extract(epoch from now())
  ) into v;
  return v;
end; $$;
grant execute on function public.evento_vivo(int) to authenticated;

select 'evento_vivo' as check,
       case when exists(select 1 from pg_proc where proname='evento_vivo') then 'OK' else 'FALTA' end as rpc,
       case when exists(select 1 from information_schema.columns where table_name='eventos' and column_name='aforo') then 'OK' else 'FALTA' end as col_aforo;


-- ╔════════════════════════════════════════════════════════════╗
-- ║ 3/3 · frate-FIX-personas-dedup.sql  (asegurar el FIX)       ║
-- ╚════════════════════════════════════════════════════════════╝
-- ============================================================
-- FRATE — FIX: personas triplicadas al capturar desde "Nuevo" (puerta)
-- Causa: personas_upsert dedupe por RUT o EMAIL; si el VIP no trae ninguno,
-- cada camino (RPC + trigger items_pedido + trigger qr_usados) inserta una
-- ficha NUEVA → 3 filas. Fix: agregar dedupe por NOMBRE cuando no hay rut ni
-- email (cae en la misma ficha, prefiriendo la que ya esté identificada).
-- Incluye limpieza de los duplicados que ya quedaron.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create or replace function public.personas_upsert(
  p_nombre text, p_rut text default null, p_email text default null,
  p_telefono text default null, p_instagram text default null,
  p_origen text default null, p_visita boolean default false,
  p_fecha_nacimiento date default null, p_universidad text default null,
  p_genero text default null, p_datos_extra jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rut text; v_email text; v_nom text;
begin
  v_rut   := nullif(btrim(coalesce(p_rut,'')),'');
  v_email := lower(nullif(btrim(coalesce(p_email,'')),''));
  v_nom   := nullif(btrim(coalesce(p_nombre,'')),'');
  if v_nom is null and v_rut is null and v_email is null then return; end if;

  if v_rut is not null then
    select id into v_id from public.personas where lower(rut)=lower(v_rut) limit 1;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from public.personas where lower(email)=v_email limit 1;
  end if;
  -- 🆕 Sin rut ni email: dedupe por NOMBRE (evita triplicar VIP de puerta).
  --    Prefiere una ficha ya identificada (con rut/email) para no crear otra suelta.
  if v_id is null and v_rut is null and v_email is null and v_nom is not null then
    select id into v_id from public.personas
    where lower(btrim(nombre)) = lower(v_nom)
    order by (coalesce(btrim(rut),'')<>'' or coalesce(btrim(email),'')<>'') desc, id
    limit 1;
  end if;

  if v_id is null then
    insert into public.personas(rut,nombre,email,telefono,instagram,origen,visitas,ultima_vez,
                                fecha_nacimiento,universidad,genero,datos_extra)
    values (v_rut, v_nom, v_email,
            nullif(btrim(coalesce(p_telefono,'')),''),
            nullif(btrim(coalesce(p_instagram,'')),''),
            case when p_origen is null then '{}'::text[] else array[p_origen] end,
            case when p_visita then 1 else 0 end,
            now(), p_fecha_nacimiento,
            nullif(btrim(coalesce(p_universidad,'')),''),
            nullif(btrim(coalesce(p_genero,'')),''),
            p_datos_extra);
  else
    update public.personas set
      nombre    = coalesce(v_nom, nombre),
      rut       = coalesce(rut, v_rut),
      email     = coalesce(email, v_email),
      telefono  = coalesce(telefono, nullif(btrim(coalesce(p_telefono,'')),'')),
      instagram = coalesce(instagram, nullif(btrim(coalesce(p_instagram,'')),'')),
      fecha_nacimiento = coalesce(fecha_nacimiento, p_fecha_nacimiento),
      universidad = coalesce(universidad, nullif(btrim(coalesce(p_universidad,'')),'')),
      genero    = coalesce(genero, nullif(btrim(coalesce(p_genero,'')),'')),
      datos_extra = case when p_datos_extra is null then datos_extra
                         else coalesce(datos_extra,'{}'::jsonb) || p_datos_extra end,
      origen    = case when p_origen is null or p_origen = any(origen) then origen else origen || p_origen end,
      visitas   = visitas + case when p_visita then 1 else 0 end,
      ultima_vez= now(), updated_at = now()
    where id = v_id;
  end if;
end; $$;
grant execute on function public.personas_upsert(text,text,text,text,text,text,boolean,date,text,text,jsonb) to authenticated;

-- ── LIMPIEZA (segura) de los triplicados que YA quedaron ─────
-- Borra SOLO las fichas sin rut ni email cuando existe OTRA del mismo nombre
-- que YA está identificada (tiene rut o email). Así no fusiona por error a
-- dos personas anónimas distintas que casualmente compartan nombre.
delete from public.personas p
where coalesce(btrim(p.rut),'')='' and coalesce(btrim(p.email),'')=''
  and exists (
    select 1 from public.personas q
    where q.id <> p.id
      and lower(btrim(q.nombre)) = lower(btrim(p.nombre))
      and (coalesce(btrim(q.rut),'')<>'' or coalesce(btrim(q.email),'')<>'')
  );

select 'personas_upsert dedupe por nombre' as check, 'OK' as estado,
       (select count(*) from public.personas) as total_fichas;


-- ── FIN. Deberías ver varias filas 'OK' en los checks de cada bloque. ──
