-- ============================================================================
-- FASE 85 — FRATE LINK: Artistas / Producción / Internacional (Fase 5)
-- ============================================================================
-- Links con datos flexibles (sin RUT obligatorio): nombre artístico como
-- identificador, rol, productor asociado, nacionalidad y documento opcional.
-- El número de documento se guarda en rut_en_lista; documento_tipo indica qué es.
--
-- NO destructivo: solo columnas nuevas nullable.
-- ============================================================================

ALTER TABLE frate.invitaciones
  ADD COLUMN IF NOT EXISTS rol_lista          text,   -- DJ, Manager, Técnico, etc.
  ADD COLUMN IF NOT EXISTS productor_asociado text,
  ADD COLUMN IF NOT EXISTS nacionalidad       text,
  ADD COLUMN IF NOT EXISTS documento_tipo     text;   -- rut/pasaporte/dni/otro

-- ============================================================================
-- FIN FASE 85
-- ============================================================================
