-- ============================================================================
-- FASE 84 — FRATE LINK: Croquis visual del local (Fase 4)
-- ============================================================================
-- Mapa visual del local con zonas/mesas posicionables (x,y,w,h) + capacidad,
-- precio, color y estado. Un link puede habilitar selección de espacio; la
-- elección del invitado queda en su entry (invitaciones).
--
-- NO destructivo: tablas nuevas + columnas nullable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS frate.floorplans (
  floorplan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL DEFAULT 'Croquis principal',
  is_default   boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frate.floorplan_spaces (
  space_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floorplan_id uuid REFERENCES frate.floorplans(floorplan_id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  tipo         text DEFAULT 'mesa',          -- mesa/zona/vip/barra/backstage/pista/bloqueado
  x integer DEFAULT 20, y integer DEFAULT 20,
  w integer DEFAULT 90, h integer DEFAULT 60,
  color        text DEFAULT '#3b8bd4',
  capacidad    integer,
  precio       integer,
  estado       text DEFAULT 'disponible',    -- disponible/bloqueado
  orden        integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floorplan_spaces_fp ON frate.floorplan_spaces(floorplan_id);

ALTER TABLE frate.lista_links
  ADD COLUMN IF NOT EXISTS floorplan_id          uuid,
  ADD COLUMN IF NOT EXISTS allow_space_selection boolean DEFAULT false;

ALTER TABLE frate.invitaciones
  ADD COLUMN IF NOT EXISTS espacio_id     uuid,
  ADD COLUMN IF NOT EXISTS espacio_nombre text;

ALTER TABLE frate.floorplans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS floorplans_all ON frate.floorplans;
CREATE POLICY floorplans_all ON frate.floorplans FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE frate.floorplan_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS floorplan_spaces_all ON frate.floorplan_spaces;
CREATE POLICY floorplan_spaces_all ON frate.floorplan_spaces FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- FIN FASE 84
-- ============================================================================
