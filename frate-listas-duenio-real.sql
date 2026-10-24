-- 👤 DEVOLVERLE CADA LISTA A SU DUEÑA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente · NO borra nada
--
-- EL PROBLEMA (lo que ves en pantalla: #311 y #312 dicen @nanook):
--   Al armar el día, el servidor guardaba `duenio_id = quien apretó el
--   botón`. Como el que arma eres tú, TODAS las listas nacían tuyas,
--   aunque la plantilla dijera "EMBAJADORA COTTY" en el texto.
--
-- POR QUÉ IMPORTA MÁS DE LO QUE PARECE:
--   El pago por RRPP resuelve al dueño así:
--       coalesce(duenio_id, rrpp_cuenta_de_texto(duenio_nombre))
--   Con `duenio_id` lleno con tu cuenta, el coalesce NUNCA llega al texto.
--   O sea: los $500 por persona escaneada de esas listas se te estaban
--   contando a TI y no a la embajadora que las trabajó.
--
--   El código ya está arreglado (las listas nuevas nacen bien). Esto
--   repara las que ya existen.
--
-- ⚠️ El paso 1 solo MIRA. Corre el 1, revisa que los nombres calcen con
--    quien tú tienes en la cabeza, y recién ahí corre el 2.


-- ── 1) MIRAR · qué listas están a nombre equivocado ───────────────
-- «dice_ahora» es de quién figura hoy · «deberia_ser» es a quién apunta
-- el texto de la lista. Si las dos columnas son iguales, está bien.
select l.id,
       l.fecha,
       l.nombre,
       l.duenio_nombre                              as texto_de_la_lista,
       coalesce('@'||da.username, '—')              as dice_ahora,
       coalesce('@'||dr.username, '⚠️ sin cuenta')  as deberia_ser
from public.listas l
left join public.clientes da on da.id = l.duenio_id
left join public.clientes dr on dr.id = public.rrpp_cuenta_de_texto(l.duenio_nombre)
where coalesce(btrim(l.duenio_nombre), '') <> ''
  and public.rrpp_cuenta_de_texto(l.duenio_nombre) is not null
  and l.duenio_id is distinct from public.rrpp_cuenta_de_texto(l.duenio_nombre)
order by l.fecha desc, l.id desc;


-- ── 2) REPARAR · solo las que el texto resuelve sin dudas ─────────
-- Idempotente: corriéndolo dos veces la segunda no cambia nada.
-- Deja fuera a propósito las listas cuyo texto NO calza con ninguna
-- cuenta: esas no se tocan, siguen como están y las arreglas a mano.
update public.listas l
   set duenio_id = public.rrpp_cuenta_de_texto(l.duenio_nombre)
 where coalesce(btrim(l.duenio_nombre), '') <> ''
   and public.rrpp_cuenta_de_texto(l.duenio_nombre) is not null
   and l.duenio_id is distinct from public.rrpp_cuenta_de_texto(l.duenio_nombre);


-- ── 3) LAS QUE QUEDAN SIN CUENTA · para crearles login ────────────
-- Estas tienen un nombre escrito que no es ninguna cuenta. Funcionan
-- igual en la puerta, pero a esa persona no se le puede pagar automático
-- hasta que tenga cuenta (Configuración → Cuentas & Roles).
select l.duenio_nombre                as nombre_escrito,
       count(*)                       as listas,
       min(l.fecha)                   as desde,
       max(l.fecha)                   as hasta
from public.listas l
where coalesce(btrim(l.duenio_nombre), '') <> ''
  and public.rrpp_cuenta_de_texto(l.duenio_nombre) is null
group by l.duenio_nombre
order by count(*) desc;


-- ── 4) CHEQUEO · cómo quedó el reparto ────────────────────────────
select coalesce('@'||c.username, '⚠️ sin cuenta') as duenia,
       count(*)                                   as listas
from public.listas l
left join public.clientes c on c.id = l.duenio_id
group by c.username
order by count(*) desc;
