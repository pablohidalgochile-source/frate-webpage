-- ============================================================
-- FRATE · el contenido del banner de temporada
--
-- El NOMBRE y las TRES NOCHES no van acá: salen solos del brief y de la
-- marca ⭐ especial de cada evento. Esto es lo único que ningún sistema
-- puede inventar: el texto de presentación y el teaser.
--
-- Se puede cambiar después desde Configuración → 🎃 Temporada especial,
-- sin volver a tocar SQL.
-- ============================================================

insert into public.config_valores (clave, valor) values
  ('temporada_texto',  'Tres noches seguidas, cada una con su propio mundo. Ven con vestuario y maquillaje: cambia la dotación de la noche.'),
  ('temporada_video',  'https://ydwlpraoaaijlfssevoh.supabase.co/storage/v1/object/public/frate-media/temporada/halloween-2026-teaser.mp4'),
  ('temporada_imagen', '')
on conflict (clave) do update set valor = excluded.valor;

-- Control: las tres claves con su valor.
select clave, left(valor, 72) as valor from public.config_valores
 where clave in ('temporada_texto','temporada_video','temporada_imagen') order by clave;
