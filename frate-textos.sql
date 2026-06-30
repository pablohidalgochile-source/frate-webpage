-- ============================================================
-- FRATE — CMS de textos: edita los textos del sitio desde el admin
-- Cada texto tiene una clave; el frontend los inyecta por data-txt.
-- Correr en Supabase SQL Editor.
-- ============================================================

create table if not exists public.textos (
  clave  text primary key,
  valor  text,
  label  text,
  grupo  text default 'General',
  orden  integer default 0
);
alter table public.textos enable row level security;

drop policy if exists "textos_public_read" on public.textos;
create policy "textos_public_read" on public.textos for select using (true);

drop policy if exists "textos_admin_write" on public.textos;
create policy "textos_admin_write" on public.textos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

insert into public.textos (clave, valor, label, grupo, orden) values
  ('hero_pill',         'Santiago de Chile · Desde 2013',                                'Etiqueta superior',      'Hero', 1),
  ('hero_titulo1',      'TU CAMPUS',                                                     'Título — línea 1',       'Hero', 2),
  ('hero_titulo2',      'CENTRAL',                                                       'Título — línea 2 (roja)','Hero', 3),
  ('hero_titulo3',      'DEL CARRETE',                                                   'Título — línea 3',       'Hero', 4),
  ('hero_subtitulo',    'Reggaeton · Afrobeats · Urban Hits · Trap · Guaracha · Dembow', 'Estilos musicales',      'Hero', 5),
  ('hero_cta1',         '🎟️ COMPRAR TICKETS',                                            'Botón principal',        'Hero', 6),
  ('hero_cta2',         'PRÓXIMOS EVENTOS',                                              'Botón secundario',       'Hero', 7),
  ('eventos_label',     'Esta semana en Frate',                                          'Eventos — etiqueta',     'Secciones', 10),
  ('ambientes_label',   'El venue',                                                      'Ambientes — etiqueta',   'Secciones', 11),
  ('reservas_label',    'Servicios especiales',                                          'Reservas — etiqueta',    'Secciones', 12),
  ('ranking_subtitulo', 'El Top 10 lo elige la gente. Vota tu canción y gánate $1.000 para tu próxima entrada, solo por registrarte.', 'Ranking — bajada', 'Secciones', 13),
  ('sobre_label',       'Quiénes somos',                                                 'Historia — etiqueta',    'Historia', 20),
  ('sobre_p1',          'Fraternidad Campus Central es la discoteca de música urbana más antigua de Chile. Nacimos en el corazón del Barrio Bellavista, el barrio bohemio más antiguo de Santiago, a pasos del Cerro San Cristóbal, el funicular y el Zoológico Metropolitano.', 'Historia — párrafo 1', 'Historia', 21),
  ('sobre_p2',          'Cada fin de semana, de jueves a sábado, recibimos entre 2.500 y 3.000 personas. Artistas internacionales como Jason Derulo, Jowell & Randy, Bad Gyal, Álvaro Díaz y más de 40 artistas extranjeros han pisado esta pista. Sellos como Sony y Rimas confían en nosotros para lanzar productos y traer artistas.', 'Historia — párrafo 2', 'Historia', 22),
  ('sobre_p3',          'Somos el punto de encuentro y la banda sonora de historias, amores y amistades de varias generaciones. ¿Y tú pisaste la pista más famosa de Chile?', 'Historia — párrafo 3', 'Historia', 23),
  ('sobre_p4',          'Lo que pasa en Frate, se queda en Frate.',                       'Historia — frase final', 'Historia', 24)
on conflict (clave) do nothing;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
