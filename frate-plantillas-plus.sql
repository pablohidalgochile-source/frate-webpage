-- ============================================================
-- FRATE — Plantillas de Comunidad: campos extra para autorellenar 100%
-- Guarda por plantilla: título en la entrada, zona, transferible,
-- dueño por defecto, y cuál es la ⭐ por defecto del importador.
-- (El código funciona con o sin estas columnas; correr esto las activa.)
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- ============================================================

alter table public.plantillas_comunidad add column if not exists titulo_entrada text;
alter table public.plantillas_comunidad add column if not exists zona text default 'general';
alter table public.plantillas_comunidad add column if not exists transferible boolean default false;
alter table public.plantillas_comunidad add column if not exists duenio text;
alter table public.plantillas_comunidad add column if not exists es_default boolean default false;

select 'plantillas_plus' as check,
       case when exists (select 1 from information_schema.columns
             where table_name='plantillas_comunidad' and column_name='es_default')
            then 'OK' else 'FALTA' end as col;
