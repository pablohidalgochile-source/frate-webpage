-- ============================================================
-- FRATE — Grupos de chats (Reserva, Frecuentes, Cumples…)
-- Columna libre 'grupo' por conversación: el encargado agrupa y
-- filtra desde Comunidad → Chats. Grupos editables/agregables
-- (cualquier nombre nuevo crea el grupo).
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

alter table public.conversaciones add column if not exists grupo text;
create index if not exists conversaciones_grupo_idx on public.conversaciones (grupo) where grupo is not null;

select 'conversaciones.grupo' as check,
       case when exists(select 1 from information_schema.columns where table_name='conversaciones' and column_name='grupo') then 'OK' else 'FALTA' end;
