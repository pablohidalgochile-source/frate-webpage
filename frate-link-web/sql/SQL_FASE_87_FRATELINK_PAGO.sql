-- ============================================================================
-- FASE 87 — FRATE LINK: cobro al cliente (WebPay form-pay)
-- ============================================================================
-- Cada lista puede tener un monto a cobrar y un estado de pago. El botón de
-- pago abre el form-pay hospedado de WebPay. La confirmación es MANUAL en el
-- MVP (el form-pay no entrega webhook); el admin marca "pagado".
--
-- NO destructivo: solo columnas nuevas nullable.
-- ============================================================================

ALTER TABLE frate.lista_links
  ADD COLUMN IF NOT EXISTS monto_servicio integer,
  ADD COLUMN IF NOT EXISTS estado_pago    text DEFAULT 'sin_cobro',   -- sin_cobro/pendiente/pagado
  ADD COLUMN IF NOT EXISTS webpay_url     text;

-- ============================================================================
-- FIN FASE 87
-- ============================================================================
