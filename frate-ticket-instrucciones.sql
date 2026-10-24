-- ============================================================
-- FRATE — Instrucciones/condiciones POR tipo de ticket
-- Cada tipo de ticket (y su plantilla) puede tener su propio texto
-- de instrucciones/condiciones que sale en el correo automáticamente.
-- Correr en el Supabase de la WEB. Idempotente.
-- ============================================================

alter table public.tipos_ticket      add column if not exists instrucciones text;
alter table public.ticket_plantillas  add column if not exists instrucciones text;

select 'ticket instrucciones' as check,
       (select count(*) from information_schema.columns where table_name='tipos_ticket'     and column_name='instrucciones') as tt,
       (select count(*) from information_schema.columns where table_name='ticket_plantillas' and column_name='instrucciones') as pl;
