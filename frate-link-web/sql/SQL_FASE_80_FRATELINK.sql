-- ============================================================================
-- FASE 80 — FRATE LINK (Fase 1 MVP): links auto-servicio de listas
-- ============================================================================
-- Tres piezas:
--  1) frate.link_eventos  — capa ORGANIZACIONAL/planificación (eventos futuros
--     aún no operativos). Se enlaza al evento operativo cuando llega la fecha.
--  2) frate.lista_links   — los links con token, cupos, categoría, beneficio.
--  3) extiende frate.invitaciones con columnas de link (las "entries" de cada
--     lista viven en invitaciones → alimentan el CRM existente, sin base paralela).
--
-- NO destructivo: tablas nuevas + columnas nullable.
-- ============================================================================

-- 1) Eventos de planificación -----------------------------------------------
CREATE TABLE IF NOT EXISTS frate.link_eventos (
  link_evento_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL,
  fecha_estimada      date,
  tipo                text DEFAULT 'fiesta',
  estado              text DEFAULT 'planificado',   -- planificado/abierto/cerrado/realizado
  evento_operativo_id uuid,                         -- puente al evento operativo (cuando exista)
  notas               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 2) Links de lista ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS frate.lista_links (
  lista_link_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                    text UNIQUE NOT NULL,
  slug                     text,
  link_evento_id           uuid REFERENCES frate.link_eventos(link_evento_id) ON DELETE CASCADE,
  link_type                text DEFAULT 'guest_list',
  categoria_id             uuid REFERENCES frate.categorias_acceso(categoria_id) ON DELETE SET NULL,
  inviter_nombre           text,
  benefit_text             text,
  cover_amount             integer,
  max_cupos                integer NOT NULL DEFAULT 50,
  requires_manual_approval boolean DEFAULT true,
  allow_incomplete_data    boolean DEFAULT false,
  closes_at                timestamptz,
  status                   text DEFAULT 'abierto',  -- abierto/pausado/cerrado
  notes                    text,
  created_by               text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_links_evento ON frate.lista_links(link_evento_id);
CREATE INDEX IF NOT EXISTS idx_lista_links_token  ON frate.lista_links(token);

-- 3) Columnas de link en invitaciones (cada "entry" de una lista) ------------
ALTER TABLE frate.invitaciones
  ADD COLUMN IF NOT EXISTS lista_link_id uuid REFERENCES frate.lista_links(lista_link_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_mode   text,
  ADD COLUMN IF NOT EXISTS data_quality  text,
  ADD COLUMN IF NOT EXISTS estado_lista  text;   -- pendiente_revision/aprobado/rechazado
CREATE INDEX IF NOT EXISTS idx_invitaciones_lista_link ON frate.invitaciones(lista_link_id);

-- RLS (los default privileges del schema frate ya otorgan grants a anon/auth) -
ALTER TABLE frate.link_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_eventos_all ON frate.link_eventos;
CREATE POLICY link_eventos_all ON frate.link_eventos FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE frate.lista_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lista_links_all ON frate.lista_links;
CREATE POLICY lista_links_all ON frate.lista_links FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- FIN FASE 80
-- ============================================================================
