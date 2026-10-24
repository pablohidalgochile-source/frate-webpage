-- ============================================================
-- FRATE · ENLAZAR LAS COMPRAS CON LA CUENTA DE QUIEN LAS HIZO
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- POR QUÉ: el panel decía "COMPRADORES 0" con 222 cuentas registradas.
-- No estaba roto el contador: estaba mirando `pedidos.cliente_id`, que solo
-- se llena si la persona compró CON LA SESIÓN INICIADA. El checkout de un
-- evento —el del link que se comparte en Instagram— no pide cuenta, así que
-- casi todas las órdenes quedaron sueltas.
--
-- La pantalla ya cruza por correo (arreglado en el panel). Esto además deja
-- la BASE sana, que es lo que usan el crédito, las membresías y el CRM.
--
-- ⚠️ CORRE LOS BLOQUES 1 y 2 PRIMERO Y MÍRALOS. El bloque 3 escribe.
-- ============================================================

-- ── 1) ¿Cuánto hay suelto? ──
select 'pedidos pagados'                as dato, count(*)::text as valor from pedidos where estado='pagado'
union all
select 'ya enlazados a una cuenta',     count(*)::text from pedidos where estado='pagado' and cliente_id is not null
union all
select 'sueltos, PERO su correo es de una cuenta',
       count(*)::text from pedidos p where p.estado='pagado' and p.cliente_id is null
         and exists (select 1 from clientes c where lower(btrim(c.email)) = lower(btrim(p.email_cliente)))
union all
select 'sueltos y sin cuenta que calce (compraron de invitado)',
       count(*)::text from pedidos p where p.estado='pagado' and p.cliente_id is null
         and not exists (select 1 from clientes c where lower(btrim(c.email)) = lower(btrim(p.email_cliente)));


-- ── 2) ¿Hay correos ambiguos? (dos cuentas con el mismo correo) ──
-- Si esto devuelve filas, NO corras el bloque 3 sin mirarlas: enlazaríamos
-- la compra a una cuenta al azar entre las dos.
select lower(btrim(email)) as correo, count(*) as cuentas,
       string_agg(coalesce(username, id::text), ', ') as quienes
from clientes
where coalesce(btrim(email),'') <> ''
group by 1 having count(*) > 1
order by 2 desc;


-- ── 3) EL ARREGLO (escribe) ──
-- Solo toca pedidos SIN cliente_id cuyo correo calce con UNA sola cuenta.
-- No pisa nada que ya estuviera enlazado.
with unicos as (
  -- `min()` no existe para uuid. Como el `having` deja solo los correos con UNA
  -- cuenta, basta con tomar el primer (y único) id del grupo.
  select lower(btrim(email)) as correo, (array_agg(id))[1] as cliente_id
  from clientes
  where coalesce(btrim(email),'') <> ''
  group by 1
  having count(*) = 1                      -- 🔒 los correos ambiguos se saltan
)
update pedidos p
   set cliente_id = u.cliente_id
  from unicos u
 where p.cliente_id is null
   and lower(btrim(p.email_cliente)) = u.correo;


-- ── 4) Cómo quedó ──
select 'pedidos pagados'            as dato, count(*)::text as valor from pedidos where estado='pagado'
union all
select 'enlazados ahora',           count(*)::text from pedidos where estado='pagado' and cliente_id is not null
union all
select 'cuentas que aparecen como compradoras',
       count(distinct cliente_id)::text from pedidos where estado='pagado' and cliente_id is not null;

-- ============================================================
-- LO QUE ESTO NO ARREGLA, Y HAY QUE SABERLO:
--
-- El que compró con un correo distinto al de su cuenta sigue suelto. Con
-- correo el enlace es bueno; con RUT sería seguro. Hoy el checkout NO pide
-- RUT — ese es el cambio que de verdad cierra el tema, y es aparte.
-- ============================================================
