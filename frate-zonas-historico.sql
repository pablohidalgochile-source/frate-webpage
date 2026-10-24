-- ============================================================
-- FRATE · ZONA DE LOS TICKETS — solo hacia ATRÁS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- QUÉ HACE: llena `tipos_ticket.zona_id` deduciéndola del NOMBRE del ticket.
-- Hoy los 77 están vacíos y por eso ninguna entrada emitida sabe a dónde entra.
--
-- ⚠️ ESTO ES UNA DEDUCCIÓN, NO UN DATO. El ERP pidió expresamente que el
--    sistema NO adivine zona por el nombre. Tienen razón. La diferencia es que
--    acá lo corre una PERSONA que mira el resultado antes de aceptarlo, una
--    sola vez, para lo viejo. El sistema no vuelve a adivinar nunca.
--
-- ⚠️ Y ES SOLO LA ZONA PREVISTA — de dónde VIENE la persona.
--    La zona REAL se decide en la puerta, y eso va aparte
--    (ver frate-zona-puerta.sql). Los datos de CELOSA lo demuestran:
--    127 cumpleaños escanearon y solo 92 recibieron pulsera roja — 35 entraron
--    a otra zona de la que decía su ticket.
--
-- Idempotente: solo toca los que están en NULL.
-- ============================================================

-- ── PASO 1 · MIRA ANTES DE ACEPTAR ─────────────────────────
-- Corre SOLO esto primero. Revisa que cada nombre calce con su zona.
-- Si algo no te cuadra, no corras el paso 2 y avísame.
select
  t.nombre,
  count(*) as tickets,
  case
    when upper(t.nombre) like '%VIP FUEGO%'                     then '🔥 VIP Fuego'
    when upper(t.nombre) like '%VIP AIRE%'                      then '💨 VIP Aire'
    when upper(t.nombre) like '%VIP%' and upper(t.nombre) like '%DISPONIB%' then '⏳ VIP a disponibilidad'
    when upper(t.nombre) like '%VIP%'                           then '❓ dice VIP pero no cuál — REVISAR'
    else '🟦 General'
  end as zona_deducida
from public.tipos_ticket t
where t.zona_id is null
group by t.nombre
order by zona_deducida, tickets desc;


-- ── PASO 2 · APLICAR (corre esto solo si el paso 1 te cuadró) ──
-- Los que dicen VIP sin decir cuál NO se tocan: quedan en null a propósito.
-- Prefiero dejarlos sin zona que ponerles una inventada.
update public.tipos_ticket t set zona_id = z.id
from public.zonas z
where t.zona_id is null
  and z.activa
  and (
        (upper(t.nombre) like '%VIP FUEGO%' and z.clave = 'vip_fuego')
     or (upper(t.nombre) like '%VIP AIRE%'  and z.clave = 'vip_aire')
     or (upper(t.nombre) like '%VIP%' and upper(t.nombre) like '%DISPONIB%' and z.clave = 'vip_disp')
     or (upper(t.nombre) not like '%VIP%'   and z.clave = 'general')
  );


-- ── PASO 3 · LO YA EMITIDO (los eventos que ya pasaron) ────
-- Copia la zona a las entradas que ya salieron, para poder mirar el histórico.
-- No toca nada de lo que ya tenga zona.
update public.items_pedido ip set zona_id = tt.zona_id
from public.tipos_ticket tt
where ip.tipo_ticket_id = tt.id
  and ip.zona_id is null
  and tt.zona_id is not null;

-- Y las cortesías, que no tienen tipo_ticket pero sí lista de origen.
update public.items_pedido ip set zona_id = l.zona_id
from public.lista_inscritos li
join public.listas l on l.id = li.lista_id
where li.pedido_cortesia_id = ip.pedido_id
  and ip.zona_id is null
  and l.zona_id is not null;


-- ── PASO 4 · CÓMO QUEDÓ ────────────────────────────────────
select coalesce(z.emoji || ' ' || z.nombre, '(sin zona)') as zona,
       count(*) as tipos_de_ticket
from public.tipos_ticket t
left join public.zonas z on z.id = t.zona_id
group by 1 order by 2 desc;

select coalesce(z.emoji || ' ' || z.nombre, '(sin zona)') as zona,
       count(*) as entradas_emitidas
from public.items_pedido ip
left join public.zonas z on z.id = ip.zona_id
where ip.evento_id is not null
group by 1 order by 2 desc;

-- ============================================================
-- LO QUE ESTO NO RESUELVE, A PROPÓSITO
--
-- Esta es la zona PREVISTA. La zona REAL —dónde terminó la persona— se decide
-- en la puerta y todavía no se guarda en ninguna parte. Eso es lo siguiente.
-- ============================================================
