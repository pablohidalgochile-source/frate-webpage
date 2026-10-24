-- ============================================================
-- FRATE — Gestión de reservas (pipeline + notas)
-- Estados: pendiente → en_analisis (🔍 se está trabajando) → confirmada / cancelada.
-- 'en_analisis' funciona directo (la columna estado es texto).
-- Agrega notas internas + historial para ir anotando el avance.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- ============================================================

alter table public.reservas add column if not exists notas_internas text;
alter table public.reservas add column if not exists historial jsonb default '[]'::jsonb;

select 'reservas_gestion' as check,
       case when exists (select 1 from information_schema.columns
             where table_name='reservas' and column_name='notas_internas')
            then 'OK' else 'FALTA' end as col;
