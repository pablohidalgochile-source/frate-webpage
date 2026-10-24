-- ============================================================
-- 🚨 URGENTE · FRATE — el candado bloqueaba listas que SÍ pueden emitir
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · corre esto y listo
--
-- QUÉ PASÓ
-- `lista_puede_emitir` bloqueaba TODO lo que no fuera exactamente 'aprobada'.
-- Pero 'cerrada' NO significa «sin aprobar»: significa «ya no recibe más
-- inscritos». Es un estado normal y correcto — de hecho el propio panel dice
-- «Lista cerrada — sigues pudiendo enviar los QR a los inscritos».
-- Lo mismo con 'pausada'.
--
-- Resultado: una lista de cortesías cerrada normalmente quedó imposible de
-- emitir, con un mensaje que mandaba a aprobarla en una bandeja donde nunca
-- iba a aparecer, porque no estaba pendiente.
--
-- LA REGLA CORRECTA: solo se bloquea lo que de verdad está sin revisar.
-- Idempotente.
-- ============================================================

create or replace function public.lista_puede_emitir(p_lista_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; l record;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select id, estado, nombre, duenio_id, aprobada_at into l
    from public.listas where id = p_lista_id;
  if l.id is null then
    return jsonb_build_object('ok', false, 'error', 'La lista no existe');
  end if;

  -- ⚠️ SOLO estos tres significan «todavía nadie la revisó». Cualquier otro
  --    estado —aprobada, cerrada, pausada, o uno nuevo que se invente
  --    mañana— puede emitir. La lista blanca de antes dejaba fuera estados
  --    perfectamente válidos y frenaba la operación en plena noche.
  if coalesce(l.estado,'') = 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Esta lista fue rechazada');
  end if;
  if coalesce(l.estado,'') in ('pendiente','en_revision') then
    return jsonb_build_object('ok', false, 'error',
      'La lista «' || coalesce(l.nombre,'') || '» todavía no está aprobada. Un admin tiene que revisarla antes de que salgan los QR.');
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.lista_puede_emitir(int) to authenticated;


-- ── Segundo arreglo: las pendientes viejas eran invisibles ──
-- La bandeja solo mostraba las de fecha >= ayer. Una lista pendiente con
-- fecha vieja (o sin fecha) no aparecía en ninguna parte y no había forma
-- de aprobarla ni de rechazarla: quedaba atrapada para siempre.
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
             -- Marca las de fecha pasada: casi siempre son basura por limpiar.
             'vieja', (l.fecha is not null and l.fecha < current_date)
           ) order by l.created_at)
      from public.listas l
      left join public.clientes c on c.id = l.duenio_id
     where coalesce(l.estado,'') in ('pendiente','en_revision')
     -- Sin filtro de fecha: si está pendiente, se tiene que poder resolver.
  ), '[]'::jsonb));
end; $$;
grant execute on function public.listas_por_aprobar() to authenticated;


-- ── Verificación ──
select l.id, l.nombre, l.estado, l.fecha,
       (public.lista_puede_emitir(l.id) ->> 'ok')::boolean as puede_emitir_ahora
from public.listas l
where l.estado in ('cerrada','pausada','aprobada','pendiente')
order by l.created_at desc limit 12;

-- ============================================================
-- Después de correr esto, la lista «LISTA CORTESIA STAFF & AMIG@S» (#135,
-- estado 'cerrada') emite normalmente. El candado sigue puesto para las que
-- de verdad están pendientes de revisión.
-- ============================================================
