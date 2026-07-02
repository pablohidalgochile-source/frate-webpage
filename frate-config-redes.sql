-- ============================================================
-- FRATE — Redes de Fraternidad en Configuración (globales)
-- Se editan en Admin → Configuración → Valores configurables.
-- El sitio las lee de aquí (ya no van por evento).
-- Correr en Supabase SQL Editor.
-- ============================================================

insert into public.config_valores (clave, valor, label) values
  ('red_instagram', 'https://www.instagram.com/fraternidadcampuscentral/', 'Red — Instagram (URL)'),
  ('red_tiktok',    'https://www.tiktok.com/@fraternidadcampuscentral',    'Red — TikTok (URL)'),
  ('red_facebook',  'https://www.facebook.com/fraternidadclub',            'Red — Facebook (URL)'),
  ('red_youtube',   'https://www.youtube.com/@fraternidadcampuscentral',   'Red — YouTube (URL)'),
  ('contacto_whatsapp', '56926104782', 'Contacto — WhatsApp (solo números)'),
  ('contacto_email',    'hola@frate.cl', 'Contacto — Email público')
on conflict (clave) do nothing;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
