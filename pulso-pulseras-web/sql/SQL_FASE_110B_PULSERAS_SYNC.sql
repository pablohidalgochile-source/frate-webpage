-- ============================================================================
-- FASE 110-B — Sincronizar pulseras del día a Supabase (fuente única)
-- ============================================================================
-- Hoy colores_pulsera / tipos_pulsera viven solo en localStorage → el celular
-- del guardia o del staff de ingreso puede no tenerlos. Los movemos a app_config
-- para que TODOS los dispositivos lean lo mismo (ficha de incidentes + aforo).
-- NO destructivo.
-- ============================================================================

ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS colores_pulsera JSONB,
  ADD COLUMN IF NOT EXISTS tipos_pulsera   JSONB;

-- ============================================================================
-- FIN FASE 110-B
-- ============================================================================
