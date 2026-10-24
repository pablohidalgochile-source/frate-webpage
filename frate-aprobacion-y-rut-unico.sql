-- ============================================================
-- FRATE · DOS CANDADOS QUE TOCAN PLATA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
--   ① APROBACIÓN DE LISTAS — hoy un RRPP crea su lista y los QR salen sin
--      que nadie mire. La columna `requires_manual_approval` existe desde
--      hace tiempo… y NUNCA se consulta. El candado estaba diseñado y
--      desconectado.
--
--   ② UN RUT = UNA ENTRADA POR NOCHE — hoy la misma persona puede estar en
--      dos listas, recibir dos QR, ocupar dos cupos y entrar una vez. Es lo
--      que vimos en el Manual 14: entró a las 00:27 y a las 00:28.
--
-- Idempotente.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- ① APROBACIÓN DE LISTAS
-- ══════════════════════════════════════════════════════════════

-- El RRPP de confianza se salta la revisión. Sin esto, revisar 150 nombres
-- cada jueves termina en "aprobar sin mirar", que es peor que no tener candado.
alter table public.clientes add column if not exists rrpp_confianza boolean default false;

alter table public.listas add column if not exists aprobada_por    uuid;
alter table public.listas add column if not exists aprobada_nombre text;
alter table public.listas add column if not exists aprobada_at     timestamptz;
alter table public.listas add column if not exists rechazo_motivo  text;


-- ¿Se pueden emitir los QR de esta lista? Una sola función, para que la
-- respuesta sea la misma en todas partes.
create or replace function public.lista_puede_emitir(p_lista_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; l record;
begin
  -- Sin este chequeo, cualquier cuenta con sesión podría ir sacando nombres de
  -- listas de a uno preguntando por id. `security definer` salta la RLS.
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select id, estado, nombre, duenio_id, aprobada_at into l
    from public.listas where id = p_lista_id;
  if l.id is null then
    return jsonb_build_object('ok', false, 'error', 'La lista no existe');
  end if;
  if l.estado = 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Esta lista fue rechazada');
  end if;
  if l.estado <> 'aprobada' then
    return jsonb_build_object('ok', false, 'error',
      'La lista «' || coalesce(l.nombre,'') || '» todavía no está aprobada. Un admin tiene que revisarla antes de que salgan los QR.');
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.lista_puede_emitir(int) to authenticated;


-- Aprobar o rechazar (solo admin). Deja firma.
create or replace function public.lista_resolver(
  p_lista_id int, p_aprobar boolean, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; l record;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin aprueba listas');
  end if;

  select id, nombre, estado into l from public.listas where id = p_lista_id;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'No existe esa lista'); end if;

  if coalesce(p_aprobar, false) then
    update public.listas
       set estado='aprobada', aprobada_por=auth.uid(), aprobada_nombre=v_nom,
           aprobada_at=now(), rechazo_motivo=null
     where id = p_lista_id;
  else
    if coalesce(btrim(p_motivo),'') = '' then
      return jsonb_build_object('ok', false, 'error', 'Di por qué la rechazas');
    end if;
    update public.listas
       set estado='rechazada', aprobada_por=auth.uid(), aprobada_nombre=v_nom,
           aprobada_at=now(), rechazo_motivo=btrim(p_motivo)
     where id = p_lista_id;
  end if;

  begin perform public.bitacora_registrar(
    case when coalesce(p_aprobar,false) then 'lista_aprobar' else 'lista_rechazar' end,
    null, null, 0, jsonb_build_object('lista_id', p_lista_id, 'nombre', l.nombre, 'motivo', p_motivo));
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'actor', v_nom);
end; $$;
grant execute on function public.lista_resolver(int,boolean,text) to authenticated;


-- Las que están esperando (para la bandeja del panel)
create or replace function public.listas_por_aprobar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  return jsonb_build_object('ok', true, 'listas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'nombre', l.nombre, 'fecha', l.fecha, 'cupos', l.cupos,
             'duenio', coalesce(c.username, c.nombres, l.duenio_nombre, '—'),
             'evento', (select e.nombre from public.eventos e where e.id = l.evento_id),
             'inscritos', (select count(*) from public.lista_inscritos li where li.lista_id = l.id),
             'esperando_horas', round(extract(epoch from (now() - l.created_at))/3600)
           ) order by l.created_at)
      from public.listas l
      left join public.clientes c on c.id = l.duenio_id
     where l.estado = 'pendiente'
       and coalesce(l.fecha, current_date) >= current_date - 1
  ), '[]'::jsonb));
end; $$;
grant execute on function public.listas_por_aprobar() to authenticated;


-- ══════════════════════════════════════════════════════════════
-- ② UN RUT = UNA ENTRADA POR NOCHE
-- ══════════════════════════════════════════════════════════════

-- ¿Este RUT ya tiene algo para esta noche? Devuelve QUÉ tiene y cuánto pesa,
-- para poder decidir cuál se queda.
--
-- JERARQUÍA (gana la MEJOR, no la primera — la persona se queda con lo mejor
-- que le ofrecieron, y el cupo perdido vuelve a quien lo dio):
--    100 · entrada PAGADA          — puso plata, gana siempre
--     80 · cumpleaños / reserva    — es la protagonista de la noche
--     50 + orden de zona · cortesía en zona VIP
--     10 · cortesía general
create or replace function public.rut_ya_tiene_entrada(p_rut text, p_evento_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_rut text;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  v_rut := upper(regexp_replace(coalesce(p_rut,''), '[^0-9kK]', '', 'g'));
  if length(v_rut) < 7 then
    -- Sin RUT no hay detección confiable: se dice, no se finge.
    return jsonb_build_object('ok', true, 'sin_rut', true, 'tiene', '[]'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'sin_rut', false, 'tiene', coalesce((
    -- (a) entradas ya emitidas (compras y cortesías con QR)
    select jsonb_agg(x order by (x->>'peso')::int desc) from (
      select jsonb_build_object(
        'origen', 'entrada', 'pedido_id', p.id,
        'que', case when coalesce(p.total_pagado,0) > 0 then 'compró su entrada'
                    else coalesce(ip.nombre_ticket, 'cortesía') end,
        'zona', (select z.nombre from public.zonas z where z.id = ip.zona_id),
        'peso', case when coalesce(p.total_pagado,0) > 0 then 100
                     else 50 + coalesce((select 40 - z2.orden from public.zonas z2 where z2.id = ip.zona_id), 0) end
      ) as x
      from public.items_pedido ip
      join public.pedidos p on p.id = ip.pedido_id
      where ip.evento_id = p_evento_id
        and p.estado = 'pagado'
        and upper(regexp_replace(coalesce(ip.rut_asistente,''), '[^0-9kK]', '', 'g')) = v_rut

      union all
      -- (b) inscripciones en listas que todavía no emiten
      select jsonb_build_object(
        'origen', 'lista', 'lista_id', l.id, 'que', l.nombre,
        'zona', (select z.nombre from public.zonas z where z.id = coalesce(li.zona_id, l.zona_id)),
        'peso', case when l.tipo in ('birthday','reservation','cumpleanos','reserva') then 80
                     else 50 + coalesce((select 40 - z3.orden from public.zonas z3
                                          where z3.id = coalesce(li.zona_id, l.zona_id)), 0) end
      )
      from public.lista_inscritos li
      join public.listas l on l.id = li.lista_id
      where l.evento_id = p_evento_id
        and coalesce(l.estado,'') <> 'rechazada'
        and li.pedido_cortesia_id is null
        and upper(regexp_replace(coalesce(li.rut,''), '[^0-9kK]', '', 'g')) = v_rut
    ) s
  ), '[]'::jsonb));
end; $$;
grant execute on function public.rut_ya_tiene_entrada(text,int) to authenticated;


-- Los repetidos de UNA lista, de una sola pasada (para el semáforo de revisión)
create or replace function public.lista_repetidos(p_lista_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_ev int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  select evento_id into v_ev from public.listas where id = p_lista_id;

  return jsonb_build_object('ok', true, 'repetidos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'inscrito_id', li.id, 'nombre', li.nombre, 'rut', li.rut,
             'tambien_en', otra.nombre, 'otra_lista_id', otra.id))
      from public.lista_inscritos li
      join public.listas l on l.id = li.lista_id
      join public.lista_inscritos li2
        on upper(regexp_replace(coalesce(li2.rut,''), '[^0-9kK]', '', 'g'))
         = upper(regexp_replace(coalesce(li.rut,''),  '[^0-9kK]', '', 'g'))
       and li2.id <> li.id
      join public.listas otra on otra.id = li2.lista_id and otra.evento_id = v_ev
     where li.lista_id = p_lista_id
       and length(upper(regexp_replace(coalesce(li.rut,''), '[^0-9kK]', '', 'g'))) >= 7
       and coalesce(otra.estado,'') <> 'rechazada'
  ), '[]'::jsonb));
end; $$;
grant execute on function public.lista_repetidos(int) to authenticated;


-- ══════════════════════════════════════════════════════════════
-- 6) `rrpp_resumen` tiene que decir el estado y el motivo del rechazo
-- ══════════════════════════════════════════════════════════════
-- Sin esto, FRATE PASE muestra "pausada" a una lista que en realidad está
-- esperando aprobación, y quien la creó no sabe por qué se la rechazaron.
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
           l.cupos_zonas, l.zona_id, l.hora_max_llegada,
           l.rechazo_motivo, l.aprobada_nombre, l.aprobada_at,   -- ← lo nuevo
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


-- ══════════════════════════════════════════════════════════════
-- Verificación
-- ══════════════════════════════════════════════════════════════
select 'clientes.rrpp_confianza' as chequeo,
       case when exists(select 1 from information_schema.columns where table_name='clientes' and column_name='rrpp_confianza') then '✅ ok' else '❌ falta' end as estado
union all
select 'firma de aprobación en listas',
       case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='aprobada_por') then '✅ ok' else '❌ falta' end
union all
select 'función lista_puede_emitir',   case when exists(select 1 from pg_proc where proname='lista_puede_emitir')   then '✅ ok' else '❌ falta' end
union all
select 'función lista_resolver',       case when exists(select 1 from pg_proc where proname='lista_resolver')       then '✅ ok' else '❌ falta' end
union all
select 'función listas_por_aprobar',   case when exists(select 1 from pg_proc where proname='listas_por_aprobar')   then '✅ ok' else '❌ falta' end
union all
select 'función rut_ya_tiene_entrada', case when exists(select 1 from pg_proc where proname='rut_ya_tiene_entrada') then '✅ ok' else '❌ falta' end
union all
select 'función lista_repetidos',      case when exists(select 1 from pg_proc where proname='lista_repetidos')      then '✅ ok' else '❌ falta' end;

-- ¿Cuántas listas quedarían esperando aprobación ahora mismo?
select count(*) as listas_pendientes_hoy
from public.listas
where estado = 'pendiente' and coalesce(fecha, current_date) >= current_date - 1;

-- ============================================================
-- ⚠️ ANTES DE CORRER, TEN CLARO ESTO
--
-- Desde que corras esto y despliegue el candado, **una lista sin aprobar no
-- manda QR**. Si un jueves nadie aprueba a tiempo, esa gente llega sin
-- entrada y el problema es en la puerta.
--
-- Marca como `rrpp_confianza = true` a quienes ya te merecen esa confianza:
--   update clientes set rrpp_confianza = true where username in ('cotty','jlizama');
--
-- Y avísale al equipo antes de la primera noche con esto encendido.
-- ============================================================

-- ============================================================
-- ⚡ ARRANQUE SUAVE — corre ESTO junto con lo de arriba
--
-- Sin esto, la primera noche con el candado encendido puede terminar con gente
-- en la puerta sin QR porque nadie alcanzó a aprobar. Marca de confianza a
-- quienes ya trabajan contigo hace tiempo: sus listas siguen saliendo solas.
--
-- ⚠️ Cambia los username por los tuyos ANTES de correr esta línea.
-- update public.clientes set rrpp_confianza = true
--  where rol = 'rrpp' and username in ('cotty', 'pon-aqui-otro');
--
-- ¿Quiénes son tus RRPP hoy y cómo quedaron?
select coalesce('@'||username, email) as quien,
       case when rrpp_confianza then '✅ emite solo' else '🔒 espera aprobación' end as como_queda
from public.clientes where rol = 'rrpp' order by rrpp_confianza desc, username;
