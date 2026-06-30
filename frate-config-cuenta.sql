-- ============================================================
-- FRATE — Toggles de las pestañas de la cuenta (Puntos/Promos/Membresía)
-- Puntos y Membresía ocultos por defecto (aún no se usan).
-- Promos visible (estrena el crédito de $1.000).
-- Se gestionan desde Admin → Configuración.
-- ============================================================

insert into public.config_sitio (clave, visible, label) values
  ('cuenta_puntos',    false, 'Pestaña "Puntos" en la cuenta del usuario'),
  ('cuenta_promos',    true,  'Pestaña "Promos" en la cuenta (muestra el crédito)'),
  ('cuenta_membresia', false, 'Pestaña "Membresía" en la cuenta del usuario')
on conflict (clave) do nothing;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
