-- ============================================================
-- FRATE · PERITAJE DE UN QR — ¿cuándo, quién y cómo se usó?
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · SOLO LEE
--
-- Para responder un reclamo de devolución cuando el ticket dice USADO.
-- Cambia el 3646 por el número de la orden (FCC-003646 → 3646).
-- ============================================================

-- ── 1) LA PRUEBA: cada QR, con hora, quién lo escaneó y desde dónde ──
select
  ip.nombre_ticket,
  q.qr_id,
  -- El nombre del asistente que iba en ESE QR
  -- `with ordinality` devuelve bigint y el operador `->` pide int: de ahí el cast.
  (ip.personas -> ((
     select (ord - 1)::int from jsonb_array_elements_text(ip.qr_ids) with ordinality e(v, ord)
      where e.v = q.qr_id limit 1
   )) ->> 'nombre')                                   as asistente,
  q.created_at::timestamp(0)                          as hora_servidor,
  q.ts_dispositivo::timestamp(0)                      as hora_del_aparato,
  case
    when q.ts_dispositivo is null then 'en línea'
    when abs(extract(epoch from (q.created_at - q.ts_dispositivo))) > 120
      then '📴 se escaneó OFFLINE y se sincronizó ' ||
           round(extract(epoch from (q.created_at - q.ts_dispositivo))/60) || ' min después'
    else 'en línea'
  end                                                 as como_se_uso,
  coalesce(q.gate_id, '—')                            as aparato,
  coalesce(c.username, c.nombres, c.email, '—')       as lo_escaneo,
  coalesce(q.incidencia, '—')                         as incidencia,
  coalesce(q.incidencia_nota, q.notas, '—')           as nota
from public.items_pedido ip
join public.qr_usados q
  on q.qr_id in (select jsonb_array_elements_text(ip.qr_ids))
left join public.clientes c on c.id = q.escaneado_por
where ip.pedido_id = 3646            -- ⬅️ CAMBIA ESTE NÚMERO
order by q.created_at;


-- ── 2) Contexto: ¿a qué evento era y calza la hora con esa noche? ──
select p.id                          as pedido,
       p.nombre_cliente,
       p.email_cliente,
       p.created_at::timestamp(0)    as compro,
       ip.nombre_evento,
       e.fecha                       as fecha_evento,
       e.hora                        as abre,
       e.hora_termino                as cierra
from public.pedidos p
join public.items_pedido ip on ip.pedido_id = p.id
left join public.eventos e on e.id = ip.evento_id
where p.id = 3646;                   -- ⬅️ CAMBIA ESTE NÚMERO


-- ── 3) ¿Esa persona entró más veces esa noche con otros QR? ──
-- Útil si dice "yo no fui": si aparece en otras órdenes de la misma noche,
-- la conversación cambia.
with orden as (
  select ip.evento_id, p.nombre_cliente, p.email_cliente
  from public.pedidos p join public.items_pedido ip on ip.pedido_id = p.id
  where p.id = 3646 limit 1           -- ⬅️ CAMBIA ESTE NÚMERO
)
select p2.id                        as otra_orden,
       p2.nombre_cliente,
       ip2.nombre_ticket,
       q2.created_at::timestamp(0)  as hora,
       coalesce(q2.gate_id,'—')     as aparato
from orden o
join public.items_pedido ip2 on ip2.evento_id = o.evento_id
join public.pedidos p2 on p2.id = ip2.pedido_id
join public.qr_usados q2 on q2.qr_id in (select jsonb_array_elements_text(ip2.qr_ids))
where lower(btrim(p2.email_cliente)) = lower(btrim(o.email_cliente))
order by q2.created_at;


-- ── 4) ¿Alguien intentó usar ese QR DOS veces? ──
-- Si el QR aparece acá, hubo un segundo intento (rechazado o en otra puerta
-- sin internet). Eso explica un "a mí no me dejaron entrar".
select qr_id, gate_id, detectado_at::timestamp(0) as intento, primera_vez::timestamp(0) as ya_usado_desde, nota
from public.puerta_conflictos
where qr_id in (
  select jsonb_array_elements_text(ip.qr_ids)
  from public.items_pedido ip where ip.pedido_id = 3646   -- ⬅️ CAMBIA ESTE NÚMERO
)
order by detectado_at;

-- ============================================================
-- CÓMO LEER EL BLOQUE 1
--
--   hora_servidor    = cuándo quedó registrado en la base
--   hora_del_aparato = cuándo lo marcó el teléfono de la puerta
--   como_se_uso      = si dice "OFFLINE", el teléfono estaba sin señal y
--                      sincronizó después. La hora real es la del aparato.
--   aparato          = de qué dispositivo/puerta salió
--   lo_escaneo       = qué persona del equipo lo pasó
--
-- Si la hora cae DENTRO del horario del evento (bloque 2) y hay un portero
-- identificado, la entrada se usó. Es prueba suficiente para responder.
--
-- Si NO hay portero (`lo_escaneo` = —) y el aparato dice PUERTA-VIP, no fue
-- un escaneo: fue un ingreso registrado a mano en la puerta.
-- ============================================================
