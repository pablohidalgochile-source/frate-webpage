-- ============================================================
-- FRATE · DESGLOSE DE LA NOCHE PARA EL ERP
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Acordado con el ERP el 2026-08-01: cuántas listas y cuánta GENTE hay de cada
-- tipo (cumpleaños, reservas, cortesías) y de cada SECTOR (vip aire, vip fuego,
-- general), más cuántas personas están anotadas y todavía sin QR.
--
-- ⚠️ «Sector» son las áreas grandes —vip aire, vip fuego, general— NO la mesa
--    específica. Es el nivel que se puede cruzar contra el color de pulsera,
--    que es justo lo que al ERP le faltaba para el conteo de vip.
--
-- Se hace en la base, en una consulta agregada, porque la piden en cada
-- sincronización. Traerse el evento entero a memoria cada vez, no.
--
-- Idempotente.
-- ============================================================

create or replace function public.evento_desglose_listas(p_evento_id int)
returns jsonb language sql stable security definer set search_path = public as $$
  with l as (
    select
      li.id,
      -- El tipo sale de `listas.tipo` cuando está; del nombre cuando no.
      -- Correr frate-listas-tipo.sql lo deja exacto y esto deja de adivinar.
      case
        when li.tipo in ('birthday','cumpleanos')      then 'cumpleanos'
        when li.tipo in ('reservation','reserva')      then 'reservas'
        when upper(li.nombre) like '%CUMPLE%'          then 'cumpleanos'
        when upper(li.nombre) like '%RESERVA%'         then 'reservas'
        when upper(li.nombre) like '%CONCURSO%'
          or upper(li.nombre) like '%GANADOR%'         then 'concursos'
        else 'cortesias'
      end as tipo,
      -- Sector: la zona asignada manda; si no hay, se deduce del nombre.
      coalesce(
        (select z.clave from public.zonas z where z.id = li.zona_id),
        case when upper(li.nombre) like '%VIP FUEGO%' then 'vip_fuego'
             when upper(li.nombre) like '%VIP AIRE%'  then 'vip_aire'
             when upper(li.nombre) like '%VIP%'       then 'vip_sin_definir'
             else 'general' end
      ) as sector,
      (select count(*) from public.lista_inscritos x where x.lista_id = li.id) as personas,
      coalesce(li.emitidas_n, 0) as con_qr
    from public.listas li
    where li.evento_id = p_evento_id
      and li.eliminada_at is null
  )
  select jsonb_build_object(
    'listas_por_tipo', coalesce((
      select jsonb_object_agg(tipo, jsonb_build_object(
               'listas', n, 'personas', p, 'con_qr', q))
        from (select tipo, count(*) n, sum(personas) p, sum(con_qr) q
                from l group by tipo) t
    ), '{}'::jsonb),
    'listas_por_sector', coalesce((
      select jsonb_object_agg(sector, jsonb_build_object(
               'listas', n, 'personas', p))
        from (select sector, count(*) n, sum(personas) p
                from l group by sector) s
    ), '{}'::jsonb),
    -- Lo que más le sirve al ERP: gente anotada y aprobada que todavía no
    -- tiene su QR. Es quien llega a la puerta y no puede entrar.
    'sin_emitir', coalesce((select sum(greatest(0, personas - con_qr)) from l), 0),
    'listas',     (select count(*) from l),
    'personas',   coalesce((select sum(personas) from l), 0),
    'con_qr',     coalesce((select sum(con_qr) from l), 0)
  );
$$;
grant execute on function public.evento_desglose_listas(int) to authenticated, service_role;


-- ── Verificación con la noche en curso ──
select e.id, e.nombre, e.fecha, public.evento_desglose_listas(e.id) as desglose
from public.eventos e
where e.fecha >= current_date - 1 and e.archivado = false
order by e.fecha desc limit 3;

-- ============================================================
-- LO QUE RECIBE EL ERP
--   totales.listas_por_tipo   · totales.listas_por_sector · totales.sin_emitir
--   resumen.listas_por_tipo   · resumen.listas_por_sector · resumen.sin_emitir
-- En los DOS lugares: el webhook que empujamos y el endpoint que consultan.
-- La vez pasada lo pusimos en uno solo y leían el otro.
-- ============================================================
