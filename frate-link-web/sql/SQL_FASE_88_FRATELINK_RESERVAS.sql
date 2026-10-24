-- ============================================================================
-- FASE 88 — FRATE LINK: Reservas (tipo separado especializado)
-- ============================================================================
-- Una reserva es un lista_links con link_type='reservation' + una fila de
-- coordinación en frate.reservation_requests (mesa/zona, consumo mínimo, abono,
-- botellas, estado). Los invitados se agregan como entries normales.
--
-- NO destructivo: tabla nueva.
-- ============================================================================

CREATE TABLE IF NOT EXISTS frate.reservation_requests (
  reservation_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_link_id       uuid REFERENCES frate.lista_links(lista_link_id) ON DELETE CASCADE,
  responsable         text,
  party_size          integer,
  zona                text,
  consumo_minimo      integer,
  abono               integer,
  wants_bottles       boolean DEFAULT false,
  bottle_notes        text,
  presupuesto         integer,
  payment_status      text DEFAULT 'sin_pago',     -- sin_pago/parcial/pagado
  coordination_status text DEFAULT 'nuevo',         -- nuevo/contactado/confirmado/pagado/cancelado/asistio/no_asistio
  responsible_admin   text,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_lista_link ON frate.reservation_requests(lista_link_id);

ALTER TABLE frate.reservation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reservation_requests_all ON frate.reservation_requests;
CREATE POLICY reservation_requests_all ON frate.reservation_requests FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- FIN FASE 88
-- ============================================================================
