-- ═══════════════════════════════════════════════════════════════════
-- 💸 RENDIMIENTO Y PAGO POR RRPP
-- ═══════════════════════════════════════════════════════════════════
-- Tres reglas que puso Pablo y que este archivo respeta al pie:
--
--   1. La RRPP se identifica POR AMBAS: si la lista tiene cuenta
--      (duenio_id) manda la cuenta; si no, manda el texto normalizado.
--      Una lista con cuenta y una con solo texto se juntan cuando el
--      texto calza con el username o el nombre de esa cuenta.
--   2. Los acompañantes CUENTAN como personas.
--   3. Escaneado es que llegó. Sin escaneo no se paga. No hay
--      "entró sin QR" — si el portero no escaneó, la plata no sale.
--
-- Todo es de solo lectura salvo la tabla rrpp_pagos, que es nueva.
-- Correr entero. Es idempotente: lo puedes correr de nuevo sin miedo.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) La clave única de una RRPP ──────────────────────────────────
-- Sin esto "EMBAJADORA COTTY", "Embajadora Cotty" y la cuenta @thiscotty
-- son tres promotoras distintas y le pagas tres veces (o ninguna).
create or replace function public.rrpp_norm(p_txt text)
returns text language sql immutable as $$
  -- Recorta DESPUÉS de limpiar los símbolos: con el btrim adentro,
  -- '@thiscotty · X' quedaba como ' THISCOTTY X' (la arroba se volvía
  -- espacio cuando ya no había nada que recortar) y eso hacía dos claves
  -- distintas para el mismo nombre.
  select nullif(
    btrim(regexp_replace(
      upper(translate(coalesce(p_txt,''),
                      'áéíóúÁÉÍÓÚäëïöüÄËÏÖÜàèìòùÀÈÌÒÙñÑ',
                      'aeiouAEIOUaeiouAEIOUaeiouAEIOUnN')),
      '[^A-Z0-9]+', ' ', 'g')),
    '')
$$;

-- Resuelve el texto libre contra las cuentas reales. Devuelve el id de
-- la cuenta si el nombre escrito a mano corresponde a alguien que existe.
create or replace function public.rrpp_cuenta_de_texto(p_txt text)
returns uuid language sql stable set search_path = public as $$
  select c.id
  from public.clientes c
  where public.rrpp_norm(p_txt) is not null
    and c.rol in ('admin','rrpp')
    and (
      public.rrpp_norm(p_txt) = public.rrpp_norm(c.username)
      or public.rrpp_norm(p_txt) = public.rrpp_norm(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,''))
      -- "EMBAJADORA COTTY" trae el username adentro. Ojo: tiene que calzar
      -- PALABRA COMPLETA. Con like '%COTTY%' el texto "@thiscotty · ..."
      -- calzaba con la cuenta @cotty, que es OTRA persona.
      or (length(public.rrpp_norm(c.username)) >= 4
          and ' '||public.rrpp_norm(p_txt)||' ' like '% '||public.rrpp_norm(c.username)||' %')
    )
  order by c.rol desc
  limit 1
$$;


-- ── 1b) Unir identidades: la misma persona con dos cuentas ────────
-- Caso real: Constanza Rivera aparece como @thiscotty, como @cotty y como
-- el texto "EMBAJADORA COTTY". Sin esto son tres promotoras y se le paga
-- tres veces. Acá se dice cuál manda; el resto apunta a esa.
create table if not exists public.rrpp_alias (
  clave_origen text primary key,
  clave_final  text not null,
  nombre_final text,
  unido_por    text,
  unido_at     timestamptz not null default now()
);
alter table public.rrpp_alias enable row level security;
drop policy if exists rrpp_alias_admin on public.rrpp_alias;
create policy rrpp_alias_admin on public.rrpp_alias for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

create or replace function public.rrpp_clave_final(p_clave text)
returns text language sql stable set search_path = public as $$
  select coalesce((select a.clave_final from public.rrpp_alias a where a.clave_origen = p_clave), p_clave)
$$;


-- ── 2) La vista base: una fila por persona de lista ────────────────
-- Acá vive TODA la verdad del cálculo. La usan el resumen, la ficha y
-- la liquidación, así que los tres números no se pueden contradecir.
-- `as materialized` a propósito: sin eso, rrpp_cuenta_de_texto() se ejecuta
-- una vez POR INSCRITO (miles de veces) en lugar de una vez por lista.
-- Se bota y se rehace: `create or replace view` NO puede renombrar ni mover
-- columnas, solo agregar al final. Si ya corriste una versión anterior de este
-- archivo, sin este drop revienta con «cannot change name of view column».
-- Nada depende de la vista salvo los RPC de más abajo, que se recrean solos.
drop view if exists public.v_rrpp_personas;
create view public.v_rrpp_personas
with (security_invoker = on) as
with l0 as materialized (
  select li2.*, coalesce(li2.duenio_id, public.rrpp_cuenta_de_texto(li2.duenio_nombre)) as _rrpp_id
  from public.listas li2
  where li2.eliminada_at is null
),
l as materialized (
  select l0.*,
         -- La clave YA viene resuelta por alias: quien la use aguas abajo no
         -- puede equivocarse ni volver a partir a la misma persona en dos.
         public.rrpp_clave_final(
           coalesce(l0._rrpp_id::text, 'txt:'||public.rrpp_norm(l0.duenio_nombre), 'sin-duenio')
         )                                                                   as _clave,
         coalesce(nullif('@'||c.username,'@'),
                  nullif(btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')),''),
                  nullif(btrim(coalesce(l0.duenio_nombre,'')),''),
                  '(sin dueño)')                                             as _rrpp_nombre,
         (l0._rrpp_id is not null)                                           as _tiene_cuenta
  from l0 left join public.clientes c on c.id = l0._rrpp_id
)
select
  l.id                                        as lista_id,
  l.nombre                                    as lista_nombre,
  l.evento_id,
  coalesce(e.fecha::date, l.fecha::date)      as fecha,
  e.nombre                                    as evento_nombre,
  l.tipo                                      as lista_tipo,
  -- identidad de la RRPP (regla 1)
  l._rrpp_id                                  as rrpp_id,
  l._clave                                    as clave,
  l._rrpp_nombre                              as rrpp_nombre,
  l._tiene_cuenta                             as tiene_cuenta,
  nullif(btrim(coalesce(l.duenio_nombre,'')),'') as duenio_texto,
  li.id                                       as inscrito_id,
  li.nombre                                   as persona,
  li.rut,
  li.estado                                   as inscrito_estado,
  -- género: el de la persona; si no lo dio, el que espera la lista; si no, sin dato
  left(upper(coalesce(nullif(li.genero,''), nullif(l.genero_esperado,''), '?')),1) as genero,
  -- regla 2: la ficha vale por ella + sus acompañantes
  1 + coalesce(li.acompanantes,0)             as personas_pedidas,
  -- QR que se le llegaron a emitir
  (select count(*) from public.items_pedido ip
     cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.pedido_id = li.pedido_cortesia_id)                       as qr_emitidos,
  -- regla 3: entró = QR escaneado en la puerta
  (select count(*) from public.items_pedido ip
     cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(qr)
   where ip.pedido_id = li.pedido_cortesia_id
     and exists (select 1 from public.qr_usados qu where qu.qr_id = q.qr)) as entraron
from l
join public.lista_inscritos li on li.lista_id = l.id
left join public.eventos e on e.id = l.evento_id;


-- ── 3) El resumen: una fila por RRPP ───────────────────────────────
-- p_evento manda si viene; si no, se puede acotar por rango de fechas.
create or replace function public.rrpp_rendimiento(
  p_evento int  default null,
  p_desde  date default null,
  p_hasta  date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json; v_tarifa int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin ve el rendimiento de todas las RRPP');
  end if;

  select coalesce((select nullif(valor,'')::int from public.config_valores where clave='rrpp_tarifa'), 500)
    into v_tarifa;

  select coalesce(json_agg(row_to_json(t) order by t.entraron desc, t.personas_pedidas desc), '[]'::json)
    into v from (
    select
      p.clave                                                 as clave,
      coalesce(
        (select a.nombre_final from public.rrpp_alias a
          where a.clave_final = p.clave and a.nombre_final is not null limit 1),
        max(p.rrpp_nombre))                                   as rrpp,
      bool_or(p.tiene_cuenta)                                 as tiene_cuenta,
      -- cuántas identidades distintas quedaron pegadas en esta fila
      count(distinct p.rrpp_nombre)                           as identidades,
      max(p.duenio_texto)                                     as texto,
      count(distinct p.lista_id)                              as listas,
      count(*)                                                as fichas,
      sum(p.personas_pedidas)                                 as personas_pedidas,
      count(*) filter (where p.genero = 'F')                  as fichas_mujer,
      count(*) filter (where p.genero = 'M')                  as fichas_hombre,
      count(*) filter (where p.genero not in ('F','M'))       as fichas_sin_genero,
      sum(p.qr_emitidos)                                      as qr_emitidos,
      count(*) filter (where p.qr_emitidos = 0)               as fichas_sin_qr,
      sum(p.entraron)                                         as entraron,
      greatest(sum(p.qr_emitidos) - sum(p.entraron), 0)       as no_entraron,
      case when sum(p.qr_emitidos) > 0
           then round(100.0 * sum(p.entraron) / sum(p.qr_emitidos))::int else 0 end as pct,
      v_tarifa                                                as tarifa,
      sum(p.entraron) * v_tarifa                              as a_pagar,
      min(p.fecha)                                            as desde,
      max(p.fecha)                                            as hasta
    from public.v_rrpp_personas p
    where (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
    group by p.clave
  ) t;

  return jsonb_build_object('ok', true, 'tarifa', v_tarifa, 'rrpp', v);
end; $$;
grant execute on function public.rrpp_rendimiento(int, date, date) to authenticated;


-- ── 4) La ficha: sus listas y su gente ─────────────────────────────
create or replace function public.rrpp_detalle(
  p_clave  text,
  p_evento int  default null,
  p_desde  date default null,
  p_hasta  date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_listas json; v_gente json;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.fecha desc nulls last, t.lista_nombre), '[]'::json)
    into v_listas from (
    select p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo,
           count(*)                                    as fichas,
           sum(p.personas_pedidas)                     as personas_pedidas,
           count(*) filter (where p.genero='F')        as fichas_mujer,
           count(*) filter (where p.genero='M')        as fichas_hombre,
           sum(p.qr_emitidos)                          as qr_emitidos,
           count(*) filter (where p.qr_emitidos = 0)   as fichas_sin_qr,
           sum(p.entraron)                             as entraron
    from public.v_rrpp_personas p
    where p.clave = p_clave
      and (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
    group by p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.lista_tipo
  ) t;

  -- La gente: primero los que no entraron, que son los que hay que mirar.
  select coalesce(json_agg(row_to_json(g) order by g.entraron, g.persona), '[]'::json)
    into v_gente from (
    select p.persona, p.rut, p.genero, p.lista_nombre, p.fecha,
           p.personas_pedidas, p.qr_emitidos, p.entraron, p.inscrito_estado
    from public.v_rrpp_personas p
    where p.clave = p_clave
      and (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
    limit 2000
  ) g;

  return jsonb_build_object('ok', true, 'listas', v_listas, 'gente', v_gente);
end; $$;
grant execute on function public.rrpp_detalle(text, int, date, date) to authenticated;


-- ── 4b) EL CUADRO: una fila por lista y por noche ─────────────────
-- Es la misma verdad que el resumen, pero abierta. Sin esto solo se ve
-- el total de una RRPP y no en qué noche rindió y en cuál no.
create or replace function public.rrpp_por_lista(
  p_evento int  default null,
  p_desde  date default null,
  p_hasta  date default null,
  p_clave  text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json; v_tarifa int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select coalesce((select nullif(valor,'')::int from public.config_valores where clave='rrpp_tarifa'), 500)
    into v_tarifa;

  select coalesce(json_agg(row_to_json(t) order by t.fecha desc nulls last, t.entraron desc), '[]'::json)
    into v from (
    select p.lista_id, p.lista_nombre as lista, p.fecha, p.evento_id, p.evento_nombre,
           p.clave, max(p.rrpp_nombre) as atribuida_a, bool_or(p.tiene_cuenta) as tiene_cuenta,
           count(*)                                    as fichas,
           sum(p.personas_pedidas)                     as personas_pedidas,
           count(*) filter (where p.genero='F')        as fichas_mujer,
           count(*) filter (where p.genero='M')        as fichas_hombre,
           sum(p.qr_emitidos)                          as qr_emitidos,
           count(*) filter (where p.qr_emitidos = 0)   as fichas_sin_qr,
           sum(p.entraron)                             as entraron,
           greatest(sum(p.qr_emitidos)-sum(p.entraron),0) as no_entraron,
           case when sum(p.qr_emitidos) > 0
                then round(100.0*sum(p.entraron)/sum(p.qr_emitidos))::int else 0 end as pct,
           sum(p.entraron) * v_tarifa                  as a_pagar
    from public.v_rrpp_personas p
    where (p_evento is null or p.evento_id = p_evento)
      and (p_desde  is null or p.fecha >= p_desde)
      and (p_hasta  is null or p.fecha <= p_hasta)
      and (p_clave  is null or p.clave = p_clave)
    group by p.lista_id, p.lista_nombre, p.fecha, p.evento_id, p.evento_nombre, p.clave
  ) t;

  return jsonb_build_object('ok', true, 'tarifa', v_tarifa, 'listas', v);
end; $$;
grant execute on function public.rrpp_por_lista(int, date, date, text) to authenticated;


-- ── 4c) Unir dos o más identidades en una sola ────────────────────
create or replace function public.rrpp_unir(
  p_claves      text[],
  p_clave_final text,
  p_nombre      text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; k text; n int := 0;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin une RRPP');
  end if;
  if p_clave_final is null or array_length(p_claves,1) is null then
    return jsonb_build_object('ok', false, 'error', 'Faltan las claves');
  end if;

  foreach k in array p_claves loop
    if k <> p_clave_final then
      insert into public.rrpp_alias (clave_origen, clave_final, nombre_final, unido_por)
      values (k, p_clave_final, p_nombre, v_nom)
      on conflict (clave_origen) do update
        set clave_final = excluded.clave_final,
            nombre_final = excluded.nombre_final,
            unido_por = excluded.unido_por, unido_at = now();
      n := n + 1;
    end if;
  end loop;

  -- Si la principal ya era alias de otra, la cadena se aplana: nadie
  -- queda apuntando a una clave que a su vez apunta a otra parte.
  update public.rrpp_alias set clave_final = p_clave_final
   where clave_final in (select clave_origen from public.rrpp_alias where clave_final = p_clave_final);
  delete from public.rrpp_alias where clave_origen = p_clave_final;

  -- El nombre elegido manda para todo el grupo.
  if p_nombre is not null then
    update public.rrpp_alias set nombre_final = p_nombre where clave_final = p_clave_final;
  end if;

  return jsonb_build_object('ok', true, 'unidas', n);
end; $$;
grant execute on function public.rrpp_unir(text[], text, text) to authenticated;

-- Deshacer: devuelve una identidad a su propia fila.
create or replace function public.rrpp_separar(p_clave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then return jsonb_build_object('ok', false, 'error', 'Sin permiso'); end if;
  delete from public.rrpp_alias where clave_origen = p_clave;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.rrpp_separar(text) to authenticated;


-- ── 5) La plata: lo que se le liquida a cada una ───────────────────
-- Una fila por (RRPP, evento). El monto queda CONGELADO al liquidar:
-- si mañana subes la tarifa, la noche del jueves sigue valiendo lo suyo.
create table if not exists public.rrpp_pagos (
  id             bigserial primary key,
  clave          text        not null,          -- misma clave del resumen
  rrpp_id        uuid        references public.clientes(id),
  rrpp_nombre    text        not null,
  evento_id      int         references public.eventos(id),
  fecha          date,
  personas       int         not null default 0, -- QR escaneados al momento de liquidar
  tarifa         int         not null default 500,
  total          int         not null default 0,
  estado         text        not null default 'pendiente',  -- pendiente | pagado
  nota           text,
  liquidado_por  text,
  liquidado_at   timestamptz not null default now(),
  pagado_por     text,
  pagado_at      timestamptz
);
create unique index if not exists rrpp_pagos_uniq on public.rrpp_pagos (clave, coalesce(evento_id, -1));
create index if not exists rrpp_pagos_estado on public.rrpp_pagos (estado, fecha desc);

alter table public.rrpp_pagos enable row level security;
drop policy if exists rrpp_pagos_admin on public.rrpp_pagos;
create policy rrpp_pagos_admin on public.rrpp_pagos for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

-- Liquidar: toma el número de entradas escaneadas AHORA y lo congela.
create or replace function public.rrpp_liquidar(
  p_clave   text,
  p_evento  int,
  p_tarifa  int,
  p_pagado  boolean default false,
  p_nota    text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v record; v_id bigint;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin liquida');
  end if;
  if coalesce(p_tarifa, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'La tarifa no puede ser negativa');
  end if;

  select coalesce(sum(p.entraron),0)                                as entraron,
         min(p.fecha)                                               as fecha,
         max(coalesce(p.duenio_texto,''))                           as texto,
         max(p.rrpp_id::text)                                       as rid
    into v
  from public.v_rrpp_personas p
  where p.clave = p_clave
    and (p_evento is null or p.evento_id = p_evento);

  if v.entraron is null then
    return jsonb_build_object('ok', false, 'error', 'No encontré gente para esa RRPP en esa noche');
  end if;

  insert into public.rrpp_pagos as r
    (clave, rrpp_id, rrpp_nombre, evento_id, fecha, personas, tarifa, total, estado, nota,
     liquidado_por, liquidado_at, pagado_por, pagado_at)
  values
    (p_clave, nullif(v.rid,'')::uuid, coalesce(nullif(v.texto,''),'(sin dueño)'), p_evento, v.fecha,
     v.entraron, p_tarifa, v.entraron * p_tarifa,
     case when p_pagado then 'pagado' else 'pendiente' end, p_nota,
     v_nom, now(),
     case when p_pagado then v_nom end,
     case when p_pagado then now() end)
  on conflict (clave, coalesce(evento_id, -1)) do update set
     personas      = excluded.personas,
     tarifa        = excluded.tarifa,
     total         = excluded.total,
     nota          = coalesce(excluded.nota, r.nota),
     rrpp_nombre   = excluded.rrpp_nombre,
     fecha         = excluded.fecha,
     -- una noche ya pagada no vuelve a pendiente sola
     estado        = case when r.estado = 'pagado' then 'pagado' else excluded.estado end,
     pagado_por    = case when r.estado <> 'pagado' and p_pagado then v_nom else r.pagado_por end,
     pagado_at     = case when r.estado <> 'pagado' and p_pagado then now() else r.pagado_at end,
     liquidado_por = v_nom,
     liquidado_at  = now()
  returning r.id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'personas', v.entraron,
                            'total', v.entraron * p_tarifa,
                            'estado', case when p_pagado then 'pagado' else 'pendiente' end);
end; $$;
grant execute on function public.rrpp_liquidar(text, int, int, boolean, text) to authenticated;


-- ── 6) El acumulado: cuánto lleva ganado cada una ──────────────────
create or replace function public.rrpp_acumulado()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select coalesce(json_agg(row_to_json(t) order by t.ganado desc), '[]'::json) into v from (
    select clave, max(rrpp_nombre) as rrpp,
           count(*)                                            as noches,
           sum(personas)                                       as entraron,
           sum(total)                                          as ganado,
           sum(total) filter (where estado='pagado')           as pagado,
           coalesce(sum(total) filter (where estado<>'pagado'),0) as se_le_debe,
           max(fecha)                                          as ultima
    from public.rrpp_pagos group by clave
  ) t;
  return jsonb_build_object('ok', true, 'rrpp', v);
end; $$;
grant execute on function public.rrpp_acumulado() to authenticated;


-- ── 7) La tarifa por defecto ───────────────────────────────────────
insert into public.config_valores (clave, valor)
values ('rrpp_tarifa', '500')
on conflict (clave) do nothing;


-- ── 8) Chequeo ─────────────────────────────────────────────────────
select 'v_rrpp_personas'  as objeto, case when exists(select 1 from pg_views  where viewname='v_rrpp_personas') then 'OK' else 'FALTA' end as estado
union all select 'rrpp_rendimiento', case when exists(select 1 from pg_proc where proname='rrpp_rendimiento') then 'OK' else 'FALTA' end
union all select 'rrpp_detalle',     case when exists(select 1 from pg_proc where proname='rrpp_detalle')     then 'OK' else 'FALTA' end
union all select 'rrpp_pagos',       case when exists(select 1 from pg_tables where tablename='rrpp_pagos')   then 'OK' else 'FALTA' end
union all select 'rrpp_liquidar',    case when exists(select 1 from pg_proc where proname='rrpp_liquidar')    then 'OK' else 'FALTA' end
union all select 'rrpp_acumulado',   case when exists(select 1 from pg_proc where proname='rrpp_acumulado')   then 'OK' else 'FALTA' end
union all select 'rrpp_por_lista',   case when exists(select 1 from pg_proc where proname='rrpp_por_lista')   then 'OK' else 'FALTA' end
union all select 'rrpp_alias',       case when exists(select 1 from pg_tables where tablename='rrpp_alias')   then 'OK' else 'FALTA' end
union all select 'rrpp_unir',        case when exists(select 1 from pg_proc where proname='rrpp_unir')        then 'OK' else 'FALTA' end;
