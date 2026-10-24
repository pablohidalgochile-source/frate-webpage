-- 🌙 CERRAR SOLOS LOS EVENTOS · PARTE 1 de 2 — la regla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- LA REGLA (Pablo, 2026-08-11):
--   Un jueves 13 empieza 23:00 y termina el viernes a las 05:00.
--   24 horas después de eso — o sea el sábado a las 05:00 — se cierra solo.
--
-- QUÉ PASA CON LAS LISTAS DE ESE EVENTO:
--   Dejan de recibir gente, pero NO se les toca el `estado`. Si una estaba
--   en borrador sigue en borrador. Se cierran poniéndoles `valido_hasta`,
--   que es el campo que `inscribir_lista` ya respeta hace rato.
--
--   🔒 EL CANDADO QUE PEDISTE: solo se tocan las listas que tienen el
--      `evento_id` de ese evento. Una lista que estés preparando para otra
--      cosa no tiene evento asociado, así que esto nunca la alcanza.
--
--   Para reabrir una: le borras el `valido_hasta` y vuelve a recibir.
--
-- ⚠️ NO cierra un evento que todavía tenga devoluciones sin responder.
--    Si le debes plata a alguien de esa noche, el evento se queda abierto
--    hasta que resuelvas.

-- `p_ensayo => true` NO cierra nada: solo dice a quiénes cerraría. Es lo
-- que corres tú primero. El trabajo automático lo llama sin ensayo.
create or replace function public.eventos_cerrar_vencidos(p_ensayo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids int[]; v_ev int; v_li int;
begin
  -- El fin REAL de la noche. Si la hora de término es menor que la de
  -- inicio (05:00 < 23:00), la noche cruza la medianoche y termina al
  -- día siguiente. Sin esto, un evento de las 23:00 se habría dado por
  -- terminado a las 05:00 del MISMO día, o sea 18 horas antes de empezar.
  with fin as (
    select e.id,
           ((e.fecha
             + coalesce(nullif(e.hora_termino::text,''),'05:00')::time
             + case when coalesce(nullif(e.hora_termino::text,''),'05:00')::time
                       < coalesce(nullif(e.hora::text,''),'23:00')::time
                    then interval '1 day' else interval '0 day' end)
            at time zone 'America/Santiago') as termina
    from public.eventos e
    where coalesce(e.estado,'') not in ('cerrado','postedicion')
      and not coalesce(e.archivado, false)
      and e.fecha is not null
  )
  select array_agg(f.id) into v_ids
  from fin f
  where f.termina < now() - interval '24 hours'
    -- Nadie esperando respuesta de una devolución en esa noche.
    and not exists (
      select 1 from public.pedidos p
      join public.items_pedido ip on ip.pedido_id = p.id
      where ip.evento_id = f.id and p.dev_estado = 'pendiente');

  if v_ids is null then
    return jsonb_build_object('ok', true, 'eventos', 0, 'listas', 0);
  end if;

  if p_ensayo then
    return jsonb_build_object('ok', true, 'ensayo', true,
      'cerraria', (select jsonb_agg(jsonb_build_object(
                     'id', e.id, 'nombre', e.nombre, 'fecha', e.fecha,
                     'listas', (select count(*) from public.listas l
                                 where l.evento_id = e.id and l.valido_hasta is null)))
                   from public.eventos e where e.id = any(v_ids)));
  end if;

  update public.eventos set estado = 'cerrado' where id = any(v_ids);
  get diagnostics v_ev = row_count;

  update public.listas set valido_hasta = now()
   where evento_id = any(v_ids) and valido_hasta is null;
  get diagnostics v_li = row_count;

  return jsonb_build_object('ok', true, 'eventos', v_ev, 'listas', v_li, 'ids', v_ids);
end $$;

revoke execute on function public.eventos_cerrar_vencidos(boolean) from anon, public;
grant  execute on function public.eventos_cerrar_vencidos(boolean) to authenticated, service_role;
