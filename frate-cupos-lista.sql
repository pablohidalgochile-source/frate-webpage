-- 🎟️ EL CONTADOR DE CUPOS DEL LINK  ·  proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- EL PROBLEMA:
--   lista.html contaba `lista_inscritos` DESDE EL NAVEGADOR de la invitada.
--   Esa tabla tiene RLS y solo la leen admin y el dueño de la lista, así que
--   una visitante anónima recibía `count = null` —no un error— y el código
--   hacía `count || 0`. Resultado: TODA lista decía "Cupos: 100/100".
--
--   No hubo sobrecupo: crm-solicitud sí cuenta bien y corta con 409. Pero la
--   pantalla de "se agotaron los cupos" nunca aparecía, y la persona llenaba
--   el formulario entero para recibir el error al final.
--
-- LA REGLA NUEVA (pedida por Pablo):
--   Cada lista decide si muestra su contador. Nace APAGADO: las cortesías y
--   las listas de RRPP no deben mostrar cuánto queda. Los cumpleaños y las
--   reservas se prenden a mano.
--
--   Cuando está apagado la función NO DEVUELVE EL NÚMERO — no lo esconde en
--   pantalla. Esconderlo con CSS deja el dato viajando por la red.
--   Lo que sí devuelve siempre es `lleno`, para poder cortar a tiempo.


alter table public.listas
  add column if not exists mostrar_cupos boolean not null default false;


create or replace function public.lista_cupos(p_codigo text)
returns table (tomados int, cupos int, lleno boolean, mostrar boolean)
language sql stable security definer set search_path = public as $$
  select
    case when l.mostrar_cupos then c.n::int end,
    case when l.mostrar_cupos then coalesce(l.cupos, 0)::int end,
    (coalesce(l.cupos, 0) > 0 and c.n >= l.cupos),
    coalesce(l.mostrar_cupos, false)
  from public.listas l
  cross join lateral (
    select count(*) as n from public.lista_inscritos li where li.lista_id = l.id
  ) c
  where l.codigo = p_codigo
$$;

-- La abre el link público, que va sin sesión.
grant execute on function public.lista_cupos(text) to anon, authenticated;


-- ── Chequeo · cómo queda cada lista con evento abierto ────────────
select l.codigo,
       l.nombre,
       l.cupos                        as tope,
       (select count(*) from public.lista_inscritos li
         where li.lista_id = l.id)    as inscritos,
       l.mostrar_cupos                as muestra_el_contador
from public.listas l
where l.estado = 'aprobada'
order by l.id desc
limit 15;
