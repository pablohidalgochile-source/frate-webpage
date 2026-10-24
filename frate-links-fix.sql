-- ============================================================
-- FRATE · Linktree — dejar SOLO 2 enlaces: Cumpleaños + Reservas
-- Proyecto WEB. Reemplaza los de ejemplo por los definitivos.
-- ============================================================

delete from public.link_items;   -- limpia los de ejemplo

insert into public.link_items (titulo, url, emoji, orden, activo) values
  ('Cumpleaños', '/formcumple',  '🎂', 10, true),
  ('Reservas',   '/formreserva', '🍾', 20, true);

select id, titulo, url, emoji, orden from public.link_items order by orden;
