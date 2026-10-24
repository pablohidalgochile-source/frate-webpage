-- 🚨 ¿POR QUÉ NO LLEGÓ EL MENSAJE?  (SOLO LECTURA — no cambia nada)
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- El "⚠️ no llegó" del inbox NO lo decide la web: lo manda Meta por su
-- webhook con estado `failed`, y el motivo textual queda guardado en
-- wsp_mensajes.estado_error (supabase/functions/whatsapp/index.ts:66).
--
-- Esta consulta muestra los mensajes que Meta rechazó en los últimos 3 días,
-- agrupados por motivo. El motivo es la respuesta: casi siempre es una de
-- estas tres cosas y cada una se arregla distinto.
--
--   · "Re-engagement message" / 24 horas  → la ventana se cerró: solo se
--     puede responder con una PLANTILLA aprobada, no con texto libre.
--   · "Message undeliverable" / 131026    → ese número no tiene WhatsApp
--     o nunca escribió al número de FRATE.
--   · Token / permisos                    → la app de Meta no está publicada
--     o el WHATSAPP_TOKEN venció.

select
  coalesce(m.estado_error, '(sin motivo guardado)') as motivo_de_meta,
  count(*)                                          as mensajes,
  count(distinct m.telefono)                        as personas,
  min(m.ts)::timestamptz(0)                         as primero,
  max(m.ts)::timestamptz(0)                         as ultimo,
  -- Cuánto pasó entre lo último que escribió esa persona y nuestra respuesta.
  -- Si supera 24 h, el motivo es la ventana y no hay nada roto en el código.
  round(avg(extract(epoch from (m.ts - (
    select max(e.ts) from public.wsp_mensajes e
    where e.telefono = m.telefono and e.rol = 'cliente' and e.ts < m.ts
  ))) / 3600.0)::numeric, 1)                        as horas_desde_que_escribio
from public.wsp_mensajes m
where m.estado = 'fallido'
  and m.ts > now() - interval '3 days'
group by 1
order by 2 desc
limit 20;
