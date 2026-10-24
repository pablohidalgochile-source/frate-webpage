-- ============================================================
-- FRATE · Bandeja unificada — las solicitudes web caen en el inbox
-- Proyecto WEB · SQL Editor. Additivo y seguro (no borra nada).
--
-- Agrega la columna `origen` a wsp_conversaciones para distinguir
-- de dónde llegó la conversación:
--   'whatsapp'   → el cliente escribió al número business
--   'formulario' → llegó por un formulario de la web (reserva/cumple/etc.)
--
-- El código ya funciona sin esto (usa fallback), pero con la columna
-- el inbox muestra el 📝 en las que vienen de formularios.
-- ============================================================

alter table public.wsp_conversaciones
  add column if not exists origen text default 'whatsapp';

-- Las conversaciones que ya existían quedan marcadas como 'whatsapp'
update public.wsp_conversaciones set origen = 'whatsapp' where origen is null;
