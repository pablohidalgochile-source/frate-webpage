-- 🚪 ASISTENCIA REAL POR NOCHE — el cálculo bien hecho
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- POR QUÉ ESTO REEMPLAZA AL NÚMERO ANTERIOR:
--   Te dije que en varias noches el 45-73% de las entradas nunca pasó por
--   la puerta, y que quizás la puerta no estaba escaneando. Estaba mal.
--
--   `crear-pago` genera los QR al ARMAR EL CARRITO, antes de pagar. O sea
--   cada carrito abandonado deja QR en la base que nadie va a escanear
--   nunca, porque esa compra jamás existió. Yo los estaba contando como
--   «entradas que nadie usó».
--
--   Acá se cuentan SOLO los pedidos pagados. Y las cortesías van aparte,
--   como corresponde: son gratis y no se mezclan con la venta.
--
-- LA COLUMNA QUE IMPORTA:
--   `carritos_abandonados` es exactamente el número que me hizo
--   equivocarme. Si es grande, no es un problema de la puerta: es gente
--   que llegó al checkout y no pagó.
--
--   `primer_escaneo` y `ultimo_escaneo` responden la otra pregunta: una
--   noche con la puerta andando bien tiene escaneos repartidos desde que
--   abre hasta la madrugada. Si se corta temprano, ahí sí hay que mirar.

with qr as (
  select ip.evento_id,
         (p.estado = 'pagado')                      as pagado,
         (coalesce(ip.precio_unitario, 0) > 0)      as es_venta,
         (ent.created_at is not null)               as entro,
         ent.created_at                             as escaneo
  from public.items_pedido ip
  join public.pedidos p on p.id = ip.pedido_id
  cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids, '[]'::jsonb)) q(qr)
  -- Un mismo QR puede tener varias filas en qr_usados (una real y otra de
  -- devolución o cambio de día). Solo cuenta la que es entrada de verdad.
  left join lateral (
    select u.created_at from public.qr_usados u
     where u.qr_id = q.qr and u.incidencia is null
     order by u.created_at limit 1
  ) ent on true
  where ip.evento_id is not null
)
select
  e.fecha,
  e.nombre,

  count(*) filter (where qr.pagado and qr.es_venta)                    as vendidas,
  count(*) filter (where qr.pagado and qr.es_venta and qr.entro)       as entraron,
  count(*) filter (where qr.pagado and qr.es_venta and not qr.entro)   as no_llegaron,
  round(100.0 * count(*) filter (where qr.pagado and qr.es_venta and not qr.entro)
        / nullif(count(*) filter (where qr.pagado and qr.es_venta), 0))
                                                                       as pct_no_llego,

  count(*) filter (where qr.pagado and not qr.es_venta)                as cortesias,
  count(*) filter (where qr.pagado and not qr.es_venta and qr.entro)   as cortesias_entraron,

  count(*) filter (where not qr.pagado)                                as carritos_abandonados,

  to_char(min(qr.escaneo) at time zone 'America/Santiago', 'HH24:MI')  as primer_escaneo,
  to_char(max(qr.escaneo) at time zone 'America/Santiago', 'HH24:MI')  as ultimo_escaneo

from public.eventos e
join qr on qr.evento_id = e.id
group by e.id, e.fecha, e.nombre
order by e.fecha desc;
