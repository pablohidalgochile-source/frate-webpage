-- ============================================================================
-- FASE 86 — FRATE LINK: listas con fecha + link a evento operativo
-- ============================================================================
-- Se elimina la dependencia de la capa "eventos de organización" (link_eventos).
-- Cada lista (lista_links) lleva su propia fecha, cantidad de personas y un
-- enlace OPCIONAL a un evento operativo real del ERP (eventos_operativos).
--
-- NO destructivo: columnas nuevas + migración de la fecha existente.
-- ============================================================================

ALTER TABLE frate.lista_links
  ADD COLUMN IF NOT EXISTS fecha               date,
  ADD COLUMN IF NOT EXISTS evento_operativo_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad_personas   integer;

-- Migrar la fecha del "evento de organización" a cada lista existente
UPDATE frate.lista_links ll
SET fecha = le.fecha_estimada
FROM frate.link_eventos le
WHERE ll.link_evento_id = le.link_evento_id
  AND ll.fecha IS NULL
  AND le.fecha_estimada IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lista_links_fecha    ON frate.lista_links(fecha);
CREATE INDEX IF NOT EXISTS idx_lista_links_evento_op ON frate.lista_links(evento_operativo_id);

-- ============================================================================
-- FIN FASE 86
-- ============================================================================
