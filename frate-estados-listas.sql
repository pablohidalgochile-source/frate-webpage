-- ============================================================
-- FRATE · LOS 3 EJES DE UNA LISTA — inscripción, revisión, emisión
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL PROBLEMA: `listas.estado` guardaba TRES cosas en un solo campo:
--     'aprobada' → hablaba de la REVISIÓN
--     'cerrada'  → hablaba de la INSCRIPCIÓN
--     'pausada'  → también de la inscripción
-- Al cerrar una lista se PISABA la aprobación, porque era la misma casilla.
-- Y no había dónde anotar si los QR ya salieron.
--
-- Consecuencia real (verificada el 2026-08-01): de 49 listas 'cerrada',
-- 48 no tenían firma de aprobación. Como 'cerrada' podía emitir, se podía
-- crear una lista, cerrarla y emitir sin que nadie la revisara.
--
-- ⚠️ NADA SE ROMPE: `estado` se sigue escribiendo solo, con un trigger que lo
--    mantiene en sincronía con los tres ejes. Todo el código viejo que lee o
--    escribe `estado` sigue funcionando exactamente igual.
--
-- Idempotente.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- ① Los tres ejes
-- ══════════════════════════════════════════════════════════════
alter table public.listas add column if not exists inscripcion  text;
alter table public.listas add column if not exists revision     text;
alter table public.listas add column if not exists emision      text;
alter table public.listas add column if not exists eliminada_at timestamptz;
alter table public.listas add column if not exists eliminada_por uuid;
-- Cuántos QR salieron y de cuántos: para poder decir «18 de 20».
alter table public.listas add column if not exists emitidas_n   int default 0;
alter table public.listas add column if not exists emision_at   timestamptz;

-- ══════════════════════════════════════════════════════════════
-- ② Traducir las que ya existen — UNA sola vez
-- ══════════════════════════════════════════════════════════════
-- Las 'cerrada' se dan por APROBADAS: operaron bien toda la semana y el
-- candado empieza hoy, no hacia atrás. De aquí en adelante cerrar NO aprueba.
update public.listas set
  inscripcion = coalesce(inscripcion, case
      when estado = 'cerrada' then 'cerrada'
      when estado = 'pausada' then 'pausada'
      else 'abierta' end),
  revision = coalesce(revision, case
      when estado = 'rechazada'  then 'rechazada'
      when estado = 'pendiente'  then 'pendiente'
      when estado = 'en_revision' then 'pendiente'
      when estado = 'borrador'   then 'borrador'
      else 'aprobada' end)
where inscripcion is null or revision is null;

-- La emisión se deduce contando quiénes ya tienen su cortesía emitida.
with cuenta as (
  select li.lista_id,
         count(*) filter (where li.pedido_cortesia_id is not null) as con_qr,
         count(*) as total
    from public.lista_inscritos li
   group by li.lista_id
)
update public.listas l set
  emitidas_n = coalesce(c.con_qr, 0),
  emision = case
      when coalesce(c.con_qr,0) = 0                       then 'sin_emitir'
      when coalesce(c.con_qr,0) >= coalesce(c.total,0)     then 'enviada'
      else 'parcial' end
from (select * from cuenta) c
where c.lista_id = l.id and l.emision is null;

update public.listas set emision = 'sin_emitir', emitidas_n = coalesce(emitidas_n,0)
where emision is null;

-- Ahora sí, los valores por defecto y los candados de dominio.
alter table public.listas alter column inscripcion set default 'abierta';
alter table public.listas alter column revision    set default 'pendiente';
alter table public.listas alter column emision     set default 'sin_emitir';

do $$ begin
  alter table public.listas add constraint listas_inscripcion_chk
    check (inscripcion in ('abierta','pausada','cerrada'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.listas add constraint listas_revision_chk
    check (revision in ('borrador','pendiente','aprobada','rechazada'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.listas add constraint listas_emision_chk
    check (emision in ('sin_emitir','parcial','enviada'));
exception when duplicate_object then null; end $$;

create index if not exists idx_listas_revision on public.listas(revision) where eliminada_at is null;
create index if not exists idx_listas_emision  on public.listas(emision)  where eliminada_at is null;

-- ══════════════════════════════════════════════════════════════
-- ③ El puente con `estado` — para que NADA del código viejo se rompa
-- ══════════════════════════════════════════════════════════════
-- Va en las dos direcciones:
--   · si alguien escribe `estado` (código viejo)  → se derivan los ejes
--   · si alguien escribe un eje (código nuevo)    → se deriva `estado`
create or replace function public.tg_listas_estado_sync()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Al insertar, si vino `estado` y no vinieron los ejes, se derivan de él.
    if new.inscripcion is null then
      new.inscripcion := case when new.estado = 'cerrada' then 'cerrada'
                              when new.estado = 'pausada' then 'pausada'
                              else 'abierta' end;
    end if;
    if new.revision is null then
      new.revision := case when new.estado = 'rechazada' then 'rechazada'
                           when new.estado in ('pendiente','en_revision') then 'pendiente'
                           when new.estado = 'borrador' then 'borrador'
                           when new.estado is null then 'pendiente'
                           else 'aprobada' end;
    end if;
    new.emision := coalesce(new.emision, 'sin_emitir');
  else
    -- UPDATE: manda quien cambió. Si cambió `estado` y no cambió ningún eje,
    -- es código viejo escribiendo: se derivan los ejes desde `estado`.
    if new.estado is distinct from old.estado
       and new.inscripcion is not distinct from old.inscripcion
       and new.revision    is not distinct from old.revision then
      if new.estado = 'cerrada' then new.inscripcion := 'cerrada';
      elsif new.estado = 'pausada' then new.inscripcion := 'pausada';
      elsif new.estado = 'aprobada' then
        new.inscripcion := 'abierta';
        -- ⚠️ Escribir estado='aprobada' desde el código viejo SÍ aprueba.
        --    Es el comportamiento que ya existía; no se cambia por sorpresa.
        new.revision := 'aprobada';
      elsif new.estado = 'rechazada' then new.revision := 'rechazada';
      elsif new.estado in ('pendiente','en_revision') then new.revision := 'pendiente';
      elsif new.estado = 'borrador' then new.revision := 'borrador';
      end if;
    end if;
  end if;

  -- Y siempre: `estado` queda reflejando los ejes, para las vistas viejas.
  -- El orden importa: lo que primero llama la atención es lo que se muestra.
  new.estado := case
      when new.eliminada_at is not null       then 'eliminada'
      when new.revision = 'rechazada'         then 'rechazada'
      when new.revision = 'borrador'          then 'borrador'
      when new.revision = 'pendiente'         then 'pendiente'
      when new.inscripcion = 'cerrada'        then 'cerrada'
      when new.inscripcion = 'pausada'        then 'pausada'
      else 'aprobada' end;
  return new;
end; $$;

drop trigger if exists tg_listas_estado_sync on public.listas;
create trigger tg_listas_estado_sync
  before insert or update on public.listas
  for each row execute function public.tg_listas_estado_sync();


-- ══════════════════════════════════════════════════════════════
-- ④ La emisión se marca sola
-- ══════════════════════════════════════════════════════════════
-- Cuando a un inscrito se le emite su cortesía, la lista recalcula su eje de
-- emisión. Así «18 de 20» es siempre verdad, sin que nadie lo mantenga.
create or replace function public.tg_lista_emision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista int; v_con int; v_tot int;
begin
  v_lista := coalesce(new.lista_id, old.lista_id);
  if v_lista is null then return coalesce(new, old); end if;

  select count(*) filter (where pedido_cortesia_id is not null), count(*)
    into v_con, v_tot
    from public.lista_inscritos where lista_id = v_lista;

  update public.listas set
    emitidas_n = coalesce(v_con,0),
    emision = case when coalesce(v_con,0) = 0 then 'sin_emitir'
                   when coalesce(v_con,0) >= coalesce(v_tot,0) then 'enviada'
                   else 'parcial' end,
    emision_at = case when coalesce(v_con,0) > 0 and emision_at is null then now() else emision_at end
  where id = v_lista;

  return coalesce(new, old);
end; $$;

drop trigger if exists tg_lista_emision on public.lista_inscritos;
create trigger tg_lista_emision
  after insert or update of pedido_cortesia_id or delete on public.lista_inscritos
  for each row execute function public.tg_lista_emision();


-- ══════════════════════════════════════════════════════════════
-- ⑤ El candado, ahora sí bien puesto
-- ══════════════════════════════════════════════════════════════
-- Mira SOLO la revisión. Cerrar una lista ya no la aprueba — ese era el hoyo.
create or replace function public.lista_puede_emitir(p_lista_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; l record;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select id, nombre, revision, inscripcion, emision, eliminada_at into l
    from public.listas where id = p_lista_id;
  if l.id is null then
    return jsonb_build_object('ok', false, 'error', 'La lista no existe');
  end if;
  if l.eliminada_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Esta lista está en la papelera');
  end if;

  -- La inscripción NO importa: una lista cerrada emite igual. Lo único que
  -- manda es si un admin la revisó.
  if l.revision = 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Esta lista fue rechazada');
  end if;
  if l.revision in ('borrador','pendiente') then
    return jsonb_build_object('ok', false, 'error',
      'La lista «' || coalesce(l.nombre,'') || '» todavía no está aprobada. Apruébala en el Resumen, en «listas esperando aprobación».');
  end if;

  return jsonb_build_object('ok', true, 'emision', l.emision);
end; $$;
grant execute on function public.lista_puede_emitir(int) to authenticated;


-- Aprobar / rechazar escribe el EJE de revisión, sin tocar la inscripción.
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

  select id, nombre, revision into l from public.listas where id = p_lista_id;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'No existe esa lista'); end if;

  if coalesce(p_aprobar, false) then
    update public.listas
       set revision='aprobada', aprobada_por=auth.uid(), aprobada_nombre=v_nom,
           aprobada_at=now(), rechazo_motivo=null
     where id = p_lista_id;
  else
    if coalesce(btrim(p_motivo),'') = '' then
      return jsonb_build_object('ok', false, 'error', 'Di por qué la rechazas');
    end if;
    update public.listas
       set revision='rechazada', aprobada_por=auth.uid(), aprobada_nombre=v_nom,
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


-- La bandeja: por revisión, sin filtro de fecha, y sin las de la papelera.
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
             'esperando_horas', round(extract(epoch from (now() - l.created_at))/3600),
             'vieja', (l.fecha is not null and l.fecha < current_date)
           ) order by l.created_at)
      from public.listas l
      left join public.clientes c on c.id = l.duenio_id
     where l.revision in ('pendiente','borrador') and l.eliminada_at is null
  ), '[]'::jsonb));
end; $$;
grant execute on function public.listas_por_aprobar() to authenticated;


-- ══════════════════════════════════════════════════════════════
-- ⑥ Papelera — borrar sin perder
-- ══════════════════════════════════════════════════════════════
create or replace function public.lista_papelera(p_lista_id int, p_borrar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; l record;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin puede borrar listas');
  end if;
  select id, nombre, emitidas_n into l from public.listas where id = p_lista_id;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'No existe esa lista'); end if;

  -- 🔒 Una lista con QR ya emitidos NO se borra: esa gente tiene su entrada en
  --    el teléfono y la puerta la tiene que reconocer.
  if coalesce(p_borrar,true) and coalesce(l.emitidas_n,0) > 0 then
    return jsonb_build_object('ok', false, 'error',
      'No se puede borrar: ya salieron ' || l.emitidas_n || ' QR de esta lista. Ciérrala en vez de borrarla.');
  end if;

  if coalesce(p_borrar, true) then
    update public.listas set eliminada_at = now(), eliminada_por = auth.uid() where id = p_lista_id;
  else
    update public.listas set eliminada_at = null, eliminada_por = null where id = p_lista_id;
  end if;

  begin perform public.bitacora_registrar(
    case when coalesce(p_borrar,true) then 'lista_papelera' else 'lista_recuperar' end,
    null, null, 0, jsonb_build_object('lista_id', p_lista_id, 'nombre', l.nombre));
  exception when others then null; end;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.lista_papelera(int,boolean) to authenticated;


-- ══════════════════════════════════════════════════════════════
-- ⑦ Cómo quedó
-- ══════════════════════════════════════════════════════════════
select
  coalesce(inscripcion,'?') as inscripcion,
  coalesce(revision,'?')    as revision,
  coalesce(emision,'?')     as emision,
  count(*)                  as listas,
  string_agg(distinct estado, ', ') as estado_derivado
from public.listas
where eliminada_at is null
group by 1,2,3
order by 4 desc;

select 'listas que YA NO pueden emitir (bien: están sin revisar)' as chequeo,
       count(*) as n
from public.listas where revision in ('pendiente','borrador','rechazada') and eliminada_at is null;

-- ============================================================
-- LO QUE CAMBIA DESDE AHORA
--
--   · Cerrar una lista YA NO la aprueba. Son campos distintos.
--   · Los QR salen SOLO si revision = 'aprobada'.
--   · «Enviada» existe y se marca sola: emitidas_n / emision.
--   · Borrar manda a la papelera, y no deja borrar si ya salieron QR.
--   · `estado` sigue existiendo y actualizándose solo: nada de lo viejo se rompe.
-- ============================================================
