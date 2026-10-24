-- ============================================================
-- FRATE · LISTAS MIXTAS — 10 cupos: 4 VIP y 6 general
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Hasta ahora una lista tenía UNA zona para todos. Pero un anfitrión reparte:
-- "de mis 10, cuatro entran a VIP Fuego y seis a general".
--
-- Se agregan dos cosas:
--   · el REPARTO en la lista  → cuántos cupos hay de cada zona
--   · la ZONA DE CADA PERSONA → a qué zona quedó cada inscrito
--
-- ⚠️ `listas.zona_id` NO se elimina: sigue sirviendo para las listas de una
--    sola zona, que son la mayoría, y es lo que se usa por defecto.
--
-- Idempotente. Requiere haber corrido frate-zonas.sql.
-- ============================================================

-- ── 1) El reparto de la lista ──
-- [{"zona_id":2,"cupos":4},{"zona_id":1,"cupos":6}]
alter table public.listas add column if not exists cupos_zonas jsonb;

-- ── 2) A qué zona quedó cada persona ──
alter table public.lista_inscritos add column if not exists zona_id int references public.zonas(id);
create index if not exists idx_li_zona on public.lista_inscritos(lista_id, zona_id);

-- ── 3) La hora de corte, que PASE nunca mandaba ──
-- Ya existía dentro de `condiciones` como jsonb; se sube a columna para poder
-- filtrar y para que no se pierda si alguien reescribe las condiciones.
alter table public.listas add column if not exists hora_max_llegada text;


-- ── 4) Cómo va el reparto de una lista ──
create or replace function public.lista_reparto(p_lista_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_own boolean; v_rep jsonb;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;
  -- Un rrpp solo ve sus propias listas.
  select (duenio_id = auth.uid()), cupos_zonas into v_own, v_rep
    from public.listas where id = p_lista_id;
  if v_own is null then return jsonb_build_object('ok', false, 'error', 'La lista no existe'); end if;
  if v_rol = 'rrpp' and not v_own then
    return jsonb_build_object('ok', false, 'error', 'Esa lista no es tuya');
  end if;

  return jsonb_build_object('ok', true, 'reparto', coalesce((
    select jsonb_agg(jsonb_build_object(
             'zona_id', z.id, 'nombre', z.nombre, 'emoji', z.emoji, 'color', z.color,
             'cupos', (e.value->>'cupos')::int,
             'usados', coalesce((select count(*) from public.lista_inscritos li
                                  where li.lista_id = p_lista_id and li.zona_id = z.id), 0)
           ) order by z.orden, z.id)
      from jsonb_array_elements(coalesce(v_rep, '[]'::jsonb)) e
      join public.zonas z on z.id = (e.value->>'zona_id')::int
  ), '[]'::jsonb));
end; $$;
grant execute on function public.lista_reparto(int) to authenticated;


-- ── 5) Mover a una persona de zona (el anfitrión reparte a su gente) ──
create or replace function public.inscrito_mover_zona(p_inscrito_id bigint, p_zona_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_lista int; v_own boolean; v_cupos int; v_usados int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select li.lista_id into v_lista from public.lista_inscritos li where li.id = p_inscrito_id;
  if v_lista is null then return jsonb_build_object('ok', false, 'error', 'No existe ese inscrito'); end if;
  select (duenio_id = auth.uid()) into v_own from public.listas where id = v_lista;
  if v_rol = 'rrpp' and not coalesce(v_own,false) then
    return jsonb_build_object('ok', false, 'error', 'Esa lista no es tuya');
  end if;

  -- Respeta el reparto: no se puede meter a un quinto en 4 cupos de VIP.
  if p_zona_id is not null then
    select (e.value->>'cupos')::int into v_cupos
      from public.listas l, jsonb_array_elements(coalesce(l.cupos_zonas,'[]'::jsonb)) e
     where l.id = v_lista and (e.value->>'zona_id')::int = p_zona_id;
    if v_cupos is not null then
      select count(*) into v_usados from public.lista_inscritos
       where lista_id = v_lista and zona_id = p_zona_id and id <> p_inscrito_id;
      if v_usados >= v_cupos then
        return jsonb_build_object('ok', false, 'error',
          'Esa zona ya tiene sus ' || v_cupos || ' cupos ocupados en esta lista');
      end if;
    end if;
  end if;

  update public.lista_inscritos set zona_id = p_zona_id where id = p_inscrito_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.inscrito_mover_zona(bigint,int) to authenticated;


-- ── 5b) `rrpp_resumen` tiene que decir si la lista es mixta ──
-- Sin esto, el botón 🧩 de "repartir" nunca aparecería en FRATE PASE: la app
-- lee las listas por esta función y `cupos_zonas` no venía en la respuesta.
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
           l.cupos_zonas, l.zona_id, l.hora_max_llegada,          -- ← lo nuevo
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


-- ── 6) Verificación ──
select 'listas.cupos_zonas' as chequeo,
       case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='cupos_zonas') then '✅ ok' else '❌ falta' end as estado
union all
select 'listas.hora_max_llegada',
       case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='hora_max_llegada') then '✅ ok' else '❌ falta' end
union all
select 'lista_inscritos.zona_id',
       case when exists(select 1 from information_schema.columns where table_name='lista_inscritos' and column_name='zona_id') then '✅ ok' else '❌ falta' end
union all
select 'función lista_reparto',
       case when exists(select 1 from pg_proc where proname='lista_reparto') then '✅ ok' else '❌ falta' end
union all
select 'función inscrito_mover_zona',
       case when exists(select 1 from pg_proc where proname='inscrito_mover_zona') then '✅ ok' else '❌ falta' end;

-- ============================================================
-- CÓMO QUEDA UNA LISTA MIXTA
--
--   listas.cupos       = 10          ← el total, como siempre
--   listas.cupos_zonas = [{"zona_id":2,"cupos":4},{"zona_id":1,"cupos":6}]
--
-- Los inscritos entran SIN zona. El anfitrión reparte a los suyos desde su
-- lista, y `inscrito_mover_zona` no lo deja pasarse del cupo de cada zona.
-- Quien quede sin zona asignada usa la de la lista (`listas.zona_id`).
-- ============================================================
