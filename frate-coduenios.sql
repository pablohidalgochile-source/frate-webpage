-- ============================================================
-- FRATE · Co-dueños de listas
-- Que varias personas (RRPP / anfitriones) puedan VER y REVISAR
-- la misma lista. Proyecto WEB · SQL Editor. Aditivo y seguro.
--
-- Cada lista sigue teniendo su dueño principal (duenio_id). Esta
-- columna guarda los IDs de las cuentas EXTRA que también la
-- administran (ej: Lina + Cotty sobre la misma lista).
--
-- El filtro en el panel ya reconoce dueño principal O co-dueño.
-- (El candado a nivel base de datos —RLS— queda para reforzar
--  aparte; por ahora el filtrado es a nivel de la app.)
-- ============================================================

alter table public.listas
  add column if not exists co_duenios uuid[] default '{}';
