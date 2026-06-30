-- ============================================================
-- FRATE — CMS de textos v2: TÍTULOS de todas las secciones
-- Agrega los títulos grandes (antes no editables) al catálogo.
-- Correr en Supabase SQL Editor (es idempotente).
-- ============================================================

insert into public.textos (clave, valor, label, grupo, orden) values
  -- Próximos eventos
  ('eventos_t1',     'PRÓXIMOS',        'Eventos — título línea 1',   'Secciones', 14),
  ('eventos_t2',     'EVENTOS',         'Eventos — título línea 2',   'Secciones', 15),
  -- Ambientes
  ('ambientes_t1',   'TRES MUNDOS.',    'Ambientes — título línea 1', 'Secciones', 16),
  ('ambientes_t2',   'UNA NOCHE.',      'Ambientes — título línea 2', 'Secciones', 17),
  -- Ranking
  ('ranking_label',  'El ranking del pueblo', 'Ranking — etiqueta',   'Ranking', 18),
  ('ranking_t1',     'RANKING MUSICAL', 'Ranking — título línea 1',   'Ranking', 19),
  ('ranking_t2',     'DEL PUEBLO',      'Ranking — título línea 2',   'Ranking', 20),
  -- Reservas
  ('reservas_t1',    'RESERVA',         'Reservas — título línea 1',  'Secciones', 21),
  ('reservas_t2',    'TU NOCHE',        'Reservas — título línea 2',  'Secciones', 22),
  -- Galería
  ('galeria_label',  'Momentos que no se olvidan', 'Galería — etiqueta', 'Galería', 23),
  ('galeria_t1',     'ASÍ SE',          'Galería — título línea 1',   'Galería', 24),
  ('galeria_t2',     'VIVE EN',         'Galería — título línea 2',   'Galería', 25),
  ('galeria_t3',     'FRATE',           'Galería — título línea 3',   'Galería', 26),
  -- WEBEUM
  ('webeum_label',   'Serie documental','WEBEUM — etiqueta',          'WEBEUM', 27),
  ('webeum_t1',      'WEBEUM',          'WEBEUM — título línea 1',     'WEBEUM', 28),
  ('webeum_t2',      'HUMANUM EST',     'WEBEUM — título línea 2',     'WEBEUM', 29),
  -- Tiendita
  ('tiendita_label', 'Merch oficial',   'Tiendita — etiqueta',        'Tiendita', 30),
  ('tiendita_t1',    'LA',              'Tiendita — título línea 1',  'Tiendita', 31),
  ('tiendita_t2',    'TIENDITA',        'Tiendita — título línea 2',  'Tiendita', 32),
  -- Carta
  ('carta_label',    'Pre-compra en barra', 'Carta — etiqueta',       'Carta', 33),
  ('carta_t1',       'CARTA',           'Carta — título línea 1',     'Carta', 34),
  ('carta_t2',       'DE TRAGOS',       'Carta — título línea 2',     'Carta', 35),
  -- Cómo llegar
  ('llegar_label',   'Estamos en Bellavista', 'Cómo llegar — etiqueta', 'Cómo llegar', 36),
  ('llegar_t1',      'CÓMO',            'Cómo llegar — título línea 1', 'Cómo llegar', 37),
  ('llegar_t2',      'LLEGAR',          'Cómo llegar — título línea 2', 'Cómo llegar', 38),
  -- Historia (título)
  ('sobre_t1',       'DESDE 2013,',     'Historia — título línea 1',  'Historia', 39),
  ('sobre_t2',       'HACEMOS',         'Historia — título línea 2',  'Historia', 40),
  ('sobre_t3',       'HISTORIA',        'Historia — título línea 3',  'Historia', 41)
on conflict (clave) do nothing;

-- ============================================================
-- LISTO. Ahora TODOS los títulos de sección son editables en
-- Admin → Configuración → Textos del sitio.
-- ============================================================
