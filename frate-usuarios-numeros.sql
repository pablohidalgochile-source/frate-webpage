-- 🔢 ¿POR QUÉ 35 CON COMPRAS Y 0 COMPRADORES REALES?  (SOLO LECTURA)
-- Proyecto WEB · un solo select, no cambia nada.
--
-- SOSPECHA 1 (confirmada leyendo el código): la pantalla pide los pedidos
--   SIN `.limit()`, y PostgREST corta en 1.000 filas por defecto. Con miles
--   de órdenes pagadas, el «35 con compras» se calcula sobre un pedazo.
--
-- SOSPECHA 2 (esto lo responde la consulta): «compradores reales» cuenta
--   SOLO por `email_cliente`. Si esa columna está vacía en las órdenes que
--   sí tienen `cliente_id`, el contador da 0 aunque haya miles de compras.
--   Los dos números salen de la misma consulta y la leen distinto.

select
  count(*)                                                     as pedidos_pagados,
  count(*) filter (where coalesce(total_pagado, total, 0) > 0)  as con_plata,
  count(distinct cliente_id)
    filter (where cliente_id is not null)                       as cuentas_distintas,
  count(distinct lower(btrim(email_cliente)))
    filter (where coalesce(email_cliente,'') <> '')             as correos_distintos,
  count(*) filter (where coalesce(email_cliente,'') = '')        as sin_correo,
  count(*) filter (where cliente_id is null)                     as sin_cuenta,
  -- lo que DEBERÍA decir «compradores reales»: personas distintas que pagaron,
  -- juntando las que tienen cuenta y las que solo dejaron correo
  (select count(*) from (
     select distinct coalesce(cliente_id::text, lower(btrim(email_cliente)))
     from public.pedidos
     where estado = 'pagado' and coalesce(total_pagado, total, 0) > 0
       and (cliente_id is not null or coalesce(email_cliente,'') <> '')
   ) z)                                                          as compradores_de_verdad
from public.pedidos
where estado = 'pagado';
