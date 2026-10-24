-- ============================================================
-- FRATE — BRIEF (FRATE FLYER): video de YouTube + datos del brief
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

alter table public.eventos add column if not exists video_youtube text;  -- link/ID de YouTube → fondo del sitio
alter table public.eventos add column if not exists brief         jsonb;  -- {cancion, artista, caption, concurso, premio, ...}

-- Verificación
select 'eventos.video_youtube' as check, case when exists(select 1 from information_schema.columns where table_name='eventos' and column_name='video_youtube') then 'OK' else 'FALTA' end
union all select 'eventos.brief', case when exists(select 1 from information_schema.columns where table_name='eventos' and column_name='brief') then 'OK' else 'FALTA' end;
