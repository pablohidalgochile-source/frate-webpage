-- ============================================================
-- FRATE — Crear bucket de Storage para media (video de fondo, galería)
-- El admin sube archivos a 'frate-media'. Sin este bucket, los uploads
-- fallan con "Bucket not found". Correr una vez en Supabase SQL Editor.
-- ============================================================

-- 1) Crear bucket público
insert into storage.buckets (id, name, public)
values ('frate-media', 'frate-media', true)
on conflict (id) do update set public = true;

-- 2) Lectura pública (cualquiera puede VER los archivos — necesario para mostrarlos)
drop policy if exists "frate_media_public_read" on storage.objects;
create policy "frate_media_public_read" on storage.objects
  for select using (bucket_id = 'frate-media');

-- 3) Subir / reemplazar / borrar: solo usuarios autenticados (admin logueado)
drop policy if exists "frate_media_auth_insert" on storage.objects;
create policy "frate_media_auth_insert" on storage.objects
  for insert with check (bucket_id = 'frate-media' and auth.role() = 'authenticated');

drop policy if exists "frate_media_auth_update" on storage.objects;
create policy "frate_media_auth_update" on storage.objects
  for update using (bucket_id = 'frate-media' and auth.role() = 'authenticated');

drop policy if exists "frate_media_auth_delete" on storage.objects;
create policy "frate_media_auth_delete" on storage.objects
  for delete using (bucket_id = 'frate-media' and auth.role() = 'authenticated');

-- ============================================================
-- LISTO. Después de correr esto:
-- Admin → Configuración → "Subir / cambiar video" → el fondo aparece solo.
-- (También arregla la Galería & Media, que usa el mismo bucket.)
-- ============================================================
