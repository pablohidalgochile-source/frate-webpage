-- ============================================================
-- FRATE — Media de eventos (video) + API de ingreso de eventos
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
--
-- Agrega:
--  · eventos.video_url   → el evento puede tener video corriendo
--  · eventos.external_id → id externo para que la app de flyers
--    actualice el mismo evento sin duplicarlo
-- ============================================================

alter table public.eventos add column if not exists video_url   text;
alter table public.eventos add column if not exists external_id text;

create unique index if not exists eventos_external_id_key
  on public.eventos (external_id) where external_id is not null;

-- Verificación
select 'listo' as ok,
       count(*) filter (where video_url is not null)   as con_video,
       count(*)                                         as eventos
from public.eventos;

-- ============================================================
-- LISTO.
-- ============================================================
