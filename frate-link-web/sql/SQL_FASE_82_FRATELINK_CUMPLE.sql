-- ============================================================================
-- FASE 82 — FRATE LINK: Cumpleaños (Fase 3)
-- ============================================================================
-- Un cumpleaños es un lista_links con link_type='birthday' + una fila de
-- coordinación en frate.birthday_requests (decoración, botellas, mesa, covers,
-- estado de coordinación). Los invitados del cumple se agregan como entries
-- normales (frate.invitaciones con el lista_link_id del cumple).
--
-- NO destructivo: tabla nueva.
-- ============================================================================

CREATE TABLE IF NOT EXISTS frate.birthday_requests (
  birthday_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_link_id       uuid REFERENCES frate.lista_links(lista_link_id) ON DELETE CASCADE,
  link_evento_id      uuid REFERENCES frate.link_eventos(link_evento_id) ON DELETE SET NULL,
  birthday_name       text,
  birthday_date       date,
  phone               text,
  instagram           text,
  estimated_guests    integer,
  cover_birthday      integer,
  cover_guests        integer,
  wants_decoration    boolean DEFAULT false,
  decoration_notes    text,
  wants_bottles       boolean DEFAULT false,
  bottle_notes        text,
  presupuesto         integer,
  wants_table         boolean DEFAULT false,
  preferred_zone      text,
  payment_status      text DEFAULT 'sin_pago',     -- sin_pago/parcial/pagado
  coordination_status text DEFAULT 'nuevo',         -- nuevo/contactado/confirmado/pagado/cancelado/asistio/no_asistio
  responsible         text,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_birthday_lista_link ON frate.birthday_requests(lista_link_id);

ALTER TABLE frate.birthday_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS birthday_requests_all ON frate.birthday_requests;
CREATE POLICY birthday_requests_all ON frate.birthday_requests FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- FIN FASE 82
-- ============================================================================
