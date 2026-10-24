-- ============================================================
-- FRATE · ¿POR QUÉ "COMPRADORES = 0"?
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- SOLO LEE. No cambia absolutamente nada. Córrelo entero y mándame la salida.
--
-- SOSPECHA: la pantalla de Usuarios cuenta las compras cruzando
-- `pedidos.cliente_id` con `clientes.id`. Esa columna se llena SOLO cuando
-- la persona compró con la sesión iniciada. El que compra como invitado
-- —que en el checkout de un evento es casi todo el mundo— queda sin enlazar,
-- aunque después se haya registrado con el mismo correo.
--
-- Estos 5 bloques dicen si eso es cierto y cuánto se recupera por correo.
-- ============================================================

-- ── 1) El panorama: ¿cuántos pedidos pagados están enlazados a una cuenta? ──
select 'pedidos pagados'            as dato, count(*)::text as valor from pedidos where estado='pagado'
union all
select 'con cliente_id (enlazados)', count(*)::text from pedidos where estado='pagado' and cliente_id is not null
union all
select 'SIN cliente_id (huérfanos)', count(*)::text from pedidos where estado='pagado' and cliente_id is null
union all
select 'cuentas en clientes',        count(*)::text from clientes
union all
select 'cuentas que aparecen como compradoras HOY',
       count(distinct cliente_id)::text from pedidos where estado='pagado' and cliente_id is not null;


-- ── 2) ¿Se recupera cruzando por CORREO? ──
-- Cuántas de las cuentas existentes tienen al menos un pedido pagado a su correo,
-- aunque el pedido no tenga cliente_id.
select 'cuentas con compra si cruzamos por correo' as dato,
       count(*)::text as valor
from clientes c
where exists (
  select 1 from pedidos p
  where p.estado='pagado'
    and lower(btrim(p.email_cliente)) = lower(btrim(c.email))
);


-- ── 3) ¿Y cuánta plata está quedando sin atribuir? ──
select 'pedidos pagados sin cliente_id PERO con correo de una cuenta' as dato,
       count(*)::text as pedidos,
       to_char(coalesce(sum(coalesce(p.total_pagado, p.total, 0)), 0), 'FM$999G999G999') as monto
from pedidos p
where p.estado='pagado' and p.cliente_id is null
  and exists (select 1 from clientes c
              where lower(btrim(c.email)) = lower(btrim(p.email_cliente)));


-- ── 4) ¿Desde cuándo pasa? (por si fue un cambio reciente) ──
-- Si las columnas de fecha se llaman distinto, cambia `created_at`.
select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as mes,
       count(*)                                              as pagados,
       count(p.cliente_id)                                   as con_cuenta,
       count(*) - count(p.cliente_id)                        as sin_cuenta
from pedidos p
where p.estado='pagado'
group by 1
order by 1 desc
limit 12;


-- ── 5) Diez ejemplos concretos, para mirarlos con ojo humano ──
-- Pedidos pagados cuyo correo SÍ corresponde a una cuenta registrada,
-- pero que no quedaron enlazados.
select p.id                         as pedido,
       p.email_cliente,
       c.username,
       coalesce(p.total_pagado, p.total, 0) as monto,
       p.created_at::date           as fecha
from pedidos p
join clientes c on lower(btrim(c.email)) = lower(btrim(p.email_cliente))
where p.estado='pagado' and p.cliente_id is null
order by p.created_at desc
limit 10;

-- ============================================================
-- CÓMO LEER EL RESULTADO
--
-- · Bloque 1 con "SIN cliente_id" alto y "con cliente_id" en 0 →
--   confirma la sospecha: nadie compró con la sesión iniciada, o el enlace
--   nunca se guardó. El contador de la pantalla no está roto: está mirando
--   una columna que viene vacía.
--
-- · Bloque 2 alto → cruzando por correo recuperamos la relación real, y el
--   arreglo es de una tarde.
--
-- · Bloque 2 en 0 también → la gente compra con un correo distinto del de su
--   cuenta, y ahí el arreglo es otro (pedir el RUT en el checkout).
--
-- · Bloque 4 muestra si esto empezó en algún mes puntual (sería una regresión)
--   o si viene así desde siempre (sería un enlace que nunca existió).
-- ============================================================
