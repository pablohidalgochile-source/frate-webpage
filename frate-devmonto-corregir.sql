-- frate-devmonto-corregir.sql   ·   12-oct-2026
--
-- `devolver-pago` suma dev_monto DOS veces: _anotarDevuelto() (index.ts:162) y
-- registrarNC() (index.ts:262) escriben las dos en la misma columna, y se llaman
-- en pareja en los tres modos (:287, :436, :504).
--
-- La plata salio UNA sola vez: cada pedido tiene UNA nota de credito por el monto
-- correcto, y dev_neto + dev_iva cuadran con esa nota. Lo que quedo al doble es el
-- contador, y ese contador ES EL TOPE de futuras devoluciones: inflado, recorta en
-- silencio la segunda parcial (Math.min en :326), quema el QR y manda el correo por
-- la cifra chica, sin error.
--
-- Esto corrige SOLO el dato. El arreglo del codigo va aparte.
-- Toca unicamente las filas donde dev_monto es EXACTAMENTE el doble de sus notas
-- de credito; cualquier otra se deja quieta.

update public.pedidos p
   set dev_monto = nc.real
  from (select pedido_id, sum(monto) as real
          from public.notas_credito group by pedido_id) nc
 where nc.pedido_id = p.id
   and nc.real > 0
   and p.dev_monto = nc.real * 2
returning p.id, p.dev_monto as ahora, nc.real as deberia_ser;
