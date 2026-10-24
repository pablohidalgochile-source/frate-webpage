-- ============================================================
-- FRATE · TIPOS DE LISTA · SEGUNDA PASADA (corrige la primera)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- QUÉ PASÓ: `frate-listas-tipo.sql` solo tocaba las listas con `tipo` vacío o
-- 'guest_list'. Pero 155 ya traían el valor **'cortesia'** —de una versión
-- anterior— y las saltó. Entre ellas quedaron **76 listas de cumpleaños**
-- etiquetadas como cortesía.
--
-- El desglose del ERP igual sale bien, porque cuando el tipo no calza cae al
-- nombre. Pero el campo miente, y arreglar eso era justamente el punto.
--
-- ⚠️ IGUAL QUE ANTES: el paso 1 solo MUESTRA. Revísalo antes del paso 2.
-- Idempotente.
-- ============================================================

-- ── PASO 1 · QUÉ SE VA A MOVER ─────────────────────────────
select
  coalesce(tipo,'(vacío)') as tipo_ahora,
  case
    when upper(nombre) like '%CUMPLE%'    then 'birthday'
    when upper(nombre) like '%RESERVA%'   then 'reservation'
    when upper(nombre) like '%DESPEDIDA%' then 'reservation'
    when upper(nombre) like '%ARTISTA%'   then 'artist'
    when upper(nombre) like '%PRENSA%'    then 'production'
    else 'guest_list'
  end as tipo_nuevo,
  count(*) as listas,
  string_agg(distinct left(nombre, 32), ' | ') as ejemplos
from public.listas
where eliminada_at is null
group by 1, 2
having coalesce(tipo,'') is distinct from case
    when upper(nombre) like '%CUMPLE%'    then 'birthday'
    when upper(nombre) like '%RESERVA%'   then 'reservation'
    when upper(nombre) like '%DESPEDIDA%' then 'reservation'
    when upper(nombre) like '%ARTISTA%'   then 'artist'
    when upper(nombre) like '%PRENSA%'    then 'production'
    else 'guest_list' end
order by 3 desc;


-- ── PASO 2 · APLICAR ───────────────────────────────────────
-- Ahora SIN filtro por el valor viejo: se normalizan todas.
-- 'cortesia' desaparece como valor: lo que era cortesía queda 'guest_list',
-- que es el nombre correcto y el que usa el resto del sistema.
update public.listas set tipo = case
    when upper(nombre) like '%CUMPLE%'    then 'birthday'
    when upper(nombre) like '%RESERVA%'   then 'reservation'
    when upper(nombre) like '%DESPEDIDA%' then 'reservation'
    when upper(nombre) like '%ARTISTA%'   then 'artist'
    when upper(nombre) like '%PRENSA%'    then 'production'
    else 'guest_list'
  end
where eliminada_at is null;


-- ── PASO 3 · CÓMO QUEDÓ ────────────────────────────────────
select coalesce(tipo,'(sin tipo)') as tipo,
       count(*) as listas,
       sum((select count(*) from public.lista_inscritos li where li.lista_id = l.id)) as personas
from public.listas l
where eliminada_at is null
group by 1 order by 3 desc nulls last;

-- ¿Quedó alguna mal? Debería devolver 0 filas.
select id, nombre, tipo from public.listas
where eliminada_at is null
  and ((upper(nombre) like '%CUMPLE%'  and tipo <> 'birthday')
    or (upper(nombre) like '%RESERVA%' and tipo <> 'reservation'));

-- ============================================================
-- LECCIÓN, PARA NO REPETIRLA
-- Filtrar por «el campo está vacío» asume que vacío es el único estado malo.
-- Acá el estado malo era un valor viejo que nadie recordaba. Cuando se
-- normaliza un campo, se normaliza ENTERO — o se mira primero qué valores hay.
-- ============================================================
