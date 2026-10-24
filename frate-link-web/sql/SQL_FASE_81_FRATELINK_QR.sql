-- ============================================================================
-- FASE 81 — FRATE LINK: campos configurables (Fase 2) + QR y puerta (Fase 6)
-- ============================================================================
-- NO destructivo: solo columnas nuevas nullable.
-- ============================================================================

-- Fase 2 — configuración de campos del formulario por link -------------------
-- form_config: { rut, email, telefono, instagram, apodo } con valores
-- 'oculto' | 'opcional' | 'obligatorio'. El nombre siempre es obligatorio.
ALTER TABLE frate.lista_links
  ADD COLUMN IF NOT EXISTS form_config jsonb;

-- Fase 6 — QR único por entry + datos de puerta ------------------------------
ALTER TABLE frate.invitaciones
  ADD COLUMN IF NOT EXISTS telefono_en_lista  text,
  ADD COLUMN IF NOT EXISTS instagram_en_lista text,
  ADD COLUMN IF NOT EXISTS qr_token           text,
  ADD COLUMN IF NOT EXISTS qr_used_at         timestamptz,
  ADD COLUMN IF NOT EXISTS qr_used_by         text;

CREATE INDEX IF NOT EXISTS idx_invitaciones_qr_token ON frate.invitaciones(qr_token);

-- ============================================================================
-- FIN FASE 81
-- ============================================================================
