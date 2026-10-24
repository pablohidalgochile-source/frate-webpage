-- ============================================================
-- FRATE · ETIQUETAR LAS LISTAS — cumpleaños, reserva, cortesía
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- POR QUÉ: hoy el panel adivina qué es cada lista LEYENDO SU NOMBRE. Si dice
-- «CUMPLE» la cuenta como cumpleaños. Funciona porque las nombras bien, pero
-- una lista llamada «Fiesta de Camila» cae en el cajón equivocado y el conteo
-- sale mal sin que nadie lo note.
--
-- La columna `listas.tipo` existe y guarda esto de verdad, pero solo se llena
-- cuando la lista se crea desde el FRATE LINK eligiendo el tipo — o sea, casi
-- nunca. Esto la llena hacia atrás, UNA vez.
--
-- ⚠️ Igual que con las zonas: es una DEDUCCIÓN. Por eso el paso 1 solo te
--    MUESTRA qué le tocaría a cada una. Revísalo antes de correr el paso 2.
--
-- Idempotente: solo toca las que están en null o vacías.
-- ============================================================

-- ── PASO 1 · MIRA ANTES DE ACEPTAR ─────────────────────────
select
  case
    when upper(nombre) like '%CUMPLE%'                          then 'birthday · cumpleaños'
    when upper(nombre) like '%RESERVA%'                         then 'reservation · reserva'
    when upper(nombre) like '%CONCURSO%'
      or upper(nombre) like '%GANADOR%'                         then 'concurso'
    when upper(nombre) like '%DESPEDIDA%'                       then 'reservation · despedida'
    when upper(nombre) like '%ARTISTA%' or upper(nombre) like '%DJ %' then 'artist'
    when upper(nombre) like '%PRENSA%' or upper(nombre) like '%PRODUC%' then 'production'
    else 'guest_list · cortesía'
  end as tipo_deducido,
  count(*) as listas,
  sum((select count(*) from public.lista_inscritos li where li.lista_id = l.id)) as personas,
  string_agg(distinct left(nombre, 34), ' | ' order by left(nombre, 34)) filter (where true) as ejemplos
from public.listas l
where coalesce(tipo,'') in ('','guest_list')
  and eliminada_at is null
group by 1
order by 2 desc;


-- ── PASO 2 · APLICAR (corre esto solo si el paso 1 te cuadró) ──
-- Los concursos quedan como `guest_list`: son cortesías, no otra especie.
-- Lo que importa separar es cumpleaños y reservas, que es lo que preguntas.
update public.listas set tipo = case
    when upper(nombre) like '%CUMPLE%'    then 'birthday'
    when upper(nombre) like '%RESERVA%'   then 'reservation'
    when upper(nombre) like '%DESPEDIDA%' then 'reservation'
    when upper(nombre) like '%ARTISTA%'   then 'artist'
    when upper(nombre) like '%PRENSA%'    then 'production'
    else 'guest_list'
  end
where coalesce(tipo,'') in ('','guest_list')
  and eliminada_at is null;


-- ── PASO 3 · CÓMO QUEDÓ ────────────────────────────────────
select coalesce(tipo,'(sin tipo)') as tipo,
       count(*) as listas,
       sum((select count(*) from public.lista_inscritos li where li.lista_id = l.id)) as personas
from public.listas l
where eliminada_at is null
group by 1 order by 3 desc nulls last;

-- Y la noche en curso, que es lo que miras:
select coalesce(l.tipo,'(sin tipo)') as tipo,
       count(*) as listas,
       sum((select count(*) from public.lista_inscritos li where li.lista_id = l.id)) as personas
from public.listas l
where l.eliminada_at is null and l.fecha = current_date
group by 1 order by 3 desc nulls last;

-- ============================================================
-- DESPUÉS DE ESTO
-- El panel deja de adivinar por el nombre: lee `tipo` primero y solo cae al
-- nombre si está vacío. Las reservas van a dejar de marcar 0, porque hoy las
-- que existen no dicen «RESERVA» en el título y no se estaban pillando.
-- ============================================================
