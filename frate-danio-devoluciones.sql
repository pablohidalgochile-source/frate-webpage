-- 🔍 ¿A QUIÉN LE DEVOLVIMOS DE MENOS?  (SOLO LECTURA — no cambia nada)
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- POR QUÉ:
--   Cuando el cliente pide su devolución en frate.cl, la función
--   `devolucion-solicitar` ya le descuenta la retención y GUARDA el neto
--   en solicitudes_devolucion.monto_devolver. La pantalla le promete
--   ESE número (devolucion.html:206).
--
--   Después, en el panel, "💸 Revisar" toma ese neto como base y le
--   vuelve a aplicar la retención (_devRetener). Con 8% el cliente
--   recibe 84,6% en vez de 92%.
--
--   Solo ocurre en órdenes de 2 o más entradas: con una sola, el panel
--   sale antes y no re-aplica nada.
--
-- QUÉ HACE ESTA CONSULTA: lista las solicitudes ya aprobadas donde lo
--   devuelto quedó por debajo de lo prometido. Es un solo SELECT.

with ret as (
  -- Si la llave no está seteada, el código usa 8 por defecto.
  select coalesce((select nullif(valor,'')::numeric
                     from public.config_valores
                    where clave = 'devolucion_retencion_pct'
                    limit 1), 8) as pct
),
sol as (
  select s.id, s.folio, s.pedido_id, s.email, s.nombre,
         s.preferencia, s.monto_total, s.monto_devolver, s.estado,
         s.created_at,
         (select count(*) from public.items_pedido ip
           where ip.pedido_id = s.pedido_id) as lineas
  from public.solicitudes_devolucion s
  where s.estado in ('aprobada','aprobado','pagada','cerrada')
)
select
  sol.folio,
  sol.created_at::date              as fecha,
  sol.nombre,
  sol.email,
  sol.preferencia,
  sol.lineas                        as entradas_en_la_orden,
  sol.monto_devolver                as se_le_prometio,
  p.dev_monto                       as se_le_devolvio,
  (sol.monto_devolver - coalesce(p.dev_monto,0)) as diferencia_a_favor_del_cliente,
  round(sol.monto_devolver * (1 - (select pct from ret)/100))
                                    as lo_que_da_la_doble_retencion
from sol
join public.pedidos p on p.id = sol.pedido_id
where sol.lineas >= 2
  and coalesce(p.dev_monto,0) > 0
  and coalesce(p.dev_monto,0) < sol.monto_devolver
order by (sol.monto_devolver - coalesce(p.dev_monto,0)) desc
limit 50;
