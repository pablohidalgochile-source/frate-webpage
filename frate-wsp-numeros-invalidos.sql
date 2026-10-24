-- ============================================================
-- FRATE · Conversaciones de WhatsApp con número INVÁLIDO
-- Proyecto WEB · SQL Editor.
--
-- Qué pasó: los formularios web guardaban en el inbox cualquier
-- número ('000', un fijo, un número a medias). Todas las fichas
-- que traían el MISMO número inválido cayeron en UNA conversación,
-- aunque fueran de personas distintas, y Meta rechaza responderles
-- (error 131009). form-submit y crm-solicitud ya no lo hacen; esto
-- es para revisar y cerrar lo que quedó de antes.
--
-- Regla para el número YA GUARDADO (la misma del botón Enviar del admin):
--   · Chile celular → 569 + 8 dígitos (o 9 dígitos que parten en 9)
--   · Extranjero    → 10 a 15 dígitos, no parten en 0 ni en 56,
--                     y no son todos el mismo dígito
--   (8 dígitos sueltos NO: un '56123456' guardado se envía tal cual
--    y Meta lo rechaza.)
-- ============================================================

-- ─────────── PARTE A · SOLO LECTURA (no cambia nada) ───────────
-- entrantes_reales: mensajes que el cliente mandó DE VERDAD por
-- WhatsApp (traen wa_message_id; los formularios no). Si es > 0,
-- Meta conoce ese número (ej: un fijo con WhatsApp Business):
-- NO es de formulario y la parte B no la toca.
with conv as (
  select c.id, c.telefono, c.nombre, c.etapa,
         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') as d
  from public.wsp_conversaciones c
),
invalidas as (
  select * from conv
  where not (
       d ~ '^9[0-9]{8}$'
    or d ~ '^569[0-9]{8}$'
    or (d ~ '^[0-9]{10,15}$' and d !~ '^(0|56)' and d !~ '^([0-9])\1+$')
  )
),
msgs as (
  select m.conversacion_id,
         m.id,
         m.rol,
         m.wa_message_id,
         nullif(trim(substring(m.texto from '\(web\) — ([^·]*)')), '') as nombre_form
  from public.wsp_mensajes m
  where m.conversacion_id in (select id from invalidas)
)
select i.id,
       i.telefono,
       i.nombre,
       i.etapa,
       count(m.id) as mensajes,
       count(m.id) filter (where m.rol = 'cliente' and m.wa_message_id is not null) as entrantes_reales,
       count(distinct m.nombre_form) as nombres_distintos,
       string_agg(distinct m.nombre_form, ' | ') as nombres_en_mensajes
from invalidas i
left join msgs m on m.conversacion_id = i.id
group by i.id, i.telefono, i.nombre, i.etapa
order by count(distinct m.nombre_form) desc, count(m.id) desc;


-- ⚠️ solo si revisaste la parte A
-- ─────────── PARTE B · CIERRA (etapa = 'cerrada') ───────────
-- Igual que el botón «✓ Cerrar» del inbox: NO borra conversaciones
-- ni mensajes, solo las manda a «Cerradas» (se pueden reabrir).
-- Deja fuera las que tienen entrantes_reales > 0 (escribió alguien).
-- Está comentada a propósito: quita los "-- " de las 14 líneas de
-- abajo y córrela SOLA, después de mirar el resultado de la parte A.
-- update public.wsp_conversaciones c
--    set etapa = 'cerrada'
--  where coalesce(c.etapa, '') <> 'cerrada'
--    and not (
--         regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') ~ '^9[0-9]{8}$'
--      or regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') ~ '^569[0-9]{8}$'
--      or (regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10,15}$'
--          and regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') !~ '^(0|56)'
--          and regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g') !~ '^([0-9])\1+$')
--    )
--    and not exists (select 1 from public.wsp_mensajes m
--                     where m.conversacion_id = c.id and m.rol = 'cliente'
--                       and m.wa_message_id is not null)
-- returning c.id, c.telefono, c.nombre, c.etapa;
