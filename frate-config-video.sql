-- ============================================================
-- FRATE — Toggle de video de fondo en el admin
-- Agrega la opción a config_sitio. En el admin (Configuración):
--   VISIBLE = video detrás de TODO el sitio
--   OCULTO  = video solo en la portada (hero)
-- ============================================================

insert into public.config_sitio (clave, visible, label) values
  ('video_global', true, 'Video de fondo en TODO el sitio (apagado = solo portada)')
on conflict (clave) do nothing;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
