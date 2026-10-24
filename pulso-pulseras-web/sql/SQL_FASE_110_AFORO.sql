-- ============================================================================
-- FASE 110 — Aforo + Pulseras en vivo (Pulso del evento)
-- ============================================================================
-- Contador global de aforo (+/-) + pulseras entregadas por tipo, EN VIVO,
-- sincronizado a la verdad (Supabase) y manejado por el staff de ingreso + admin.
-- Cotejo: pulseras entregadas vs personas contabilizadas (alerta si se entregan
-- pulseras de más). Incrementos ATÓMICOS vía RPC para que varios dispositivos no
-- pierdan cuentas (dato sensible = entradas = plata).
-- NO destructivo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS aforo_live (
  evento_id   UUID PRIMARY KEY,
  aforo       INTEGER DEFAULT 0,            -- personas dentro (contador +/-)
  pulseras    JSONB   DEFAULT '{}'::jsonb,  -- { "Roja": 12, "Azul": 5, ... } entregadas
  capacidad   INTEGER,                      -- capacidad máxima opcional
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE aforo_live ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON aforo_live;
CREATE POLICY allow_all ON aforo_live FOR ALL USING (true) WITH CHECK (true);

-- Incremento atómico: ajusta aforo y/o una pulsera por nombre. Crea la fila si falta.
-- Devuelve la fila actualizada. Nunca baja de 0.
CREATE OR REPLACE FUNCTION incrementar_aforo(
  p_evento  UUID,
  p_aforo   INTEGER DEFAULT 0,
  p_pulsera TEXT    DEFAULT NULL,
  p_delta   INTEGER DEFAULT 0
) RETURNS aforo_live AS $$
DECLARE r aforo_live;
BEGIN
  INSERT INTO aforo_live(evento_id) VALUES (p_evento)
    ON CONFLICT (evento_id) DO NOTHING;
  UPDATE aforo_live SET
    aforo = GREATEST(0, aforo + COALESCE(p_aforo, 0)),
    pulseras = CASE WHEN p_pulsera IS NULL OR p_pulsera = '' THEN pulseras
                    ELSE jsonb_set(pulseras, ARRAY[p_pulsera],
                          to_jsonb(GREATEST(0, COALESCE((pulseras->>p_pulsera)::int, 0) + COALESCE(p_delta, 0)))) END,
    updated_at = NOW()
  WHERE evento_id = p_evento
  RETURNING * INTO r;
  RETURN r;
END; $$ LANGUAGE plpgsql;

-- Set de capacidad máxima (no incremental).
CREATE OR REPLACE FUNCTION set_capacidad_aforo(p_evento UUID, p_cap INTEGER)
RETURNS aforo_live AS $$
DECLARE r aforo_live;
BEGIN
  INSERT INTO aforo_live(evento_id, capacidad) VALUES (p_evento, p_cap)
    ON CONFLICT (evento_id) DO UPDATE SET capacidad = p_cap, updated_at = NOW()
  RETURNING * INTO r;
  RETURN r;
END; $$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION incrementar_aforo(UUID, INTEGER, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_capacidad_aforo(UUID, INTEGER) TO anon, authenticated;

-- Realtime para el panel en vivo
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE aforo_live;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================================
-- FIN FASE 110
-- ============================================================================
