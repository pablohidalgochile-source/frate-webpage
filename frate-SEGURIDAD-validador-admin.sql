-- 🚨 @validadorfrate TIENE ROL ADMIN
--
-- Salió al revisar quién aparece en el informe de RRPP. La cuenta que se usa
-- en la puerta —un teléfono que anda toda la noche entre gente— tiene el
-- mismo rol que tú.
--
-- QUÉ SIGNIFICA EN CONCRETO
-- El validador solo necesita escanear y registrar entradas. Con rol `admin`
-- puede llamar a las 108 funciones de la base que exigen admin: anular
-- pedidos, marcar devoluciones, liquidar pagos de rrpp, ver toda la venta.
-- Y en el panel ve todos los módulos, no solo la puerta.
--
-- Con rol `portero` el validador SIGUE FUNCIONANDO IGUAL: validacion.html
-- acepta 'admin' y 'portero' por igual, y el admin lo manda directo a la
-- pantalla de escanear.
--
-- ⚠️ ESTO NO SE CORRE SOLO. Es tu decisión, y hay que hacerlo con la casa
-- cerrada: si esa cuenta hace algo más que escanear, se entera esa noche.

-- ① Mirar antes de tocar (solo lee)
select c.username, c.email, c.rol,
       (select count(*) from public.qr_usados q where q.escaneado_por = c.id) as qr_escaneados,
       (select count(*) from public.pedidos p where p.anulada_por_id = c.id)  as pedidos_anulados,
       c.created_at
  from public.clientes c
 where public.rrpp_norm(c.username) = 'VALIDADORFRATE';

-- ② El cambio (descomenta cuando quieras aplicarlo)
-- update public.clientes
--    set rol = 'portero'
--  where public.rrpp_norm(username) = 'VALIDADORFRATE'
--    and rol = 'admin';

-- ③ Quién más tiene admin, para que lo mires de una vez
select c.username, c.email, c.rol, c.created_at
  from public.clientes c
 where c.rol in ('admin','portero','rrpp')
 order by c.rol, c.username;
