-- ============================================================
-- FRATE — Biblioteca de tipos de ticket reutilizables (plantillas)
-- Extiende catalogo_tickets con los campos de "plantilla": hora máx de
-- ingreso, condiciones/instrucciones, zona y transferible. Así cada tipo
-- guardado en la biblioteca se puede APLICAR a un evento o a una lista de
-- cortesía y autocompletar sus condiciones.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

alter table public.catalogo_tickets add column if not exists hora_max_ingreso text;
alter table public.catalogo_tickets add column if not exists instrucciones    text;
alter table public.catalogo_tickets add column if not exists zona             text;
alter table public.catalogo_tickets add column if not exists transferible     boolean default true;

select 'catalogo_tickets (biblioteca)' as check,
       case when exists (select 1 from information_schema.columns where table_name='catalogo_tickets' and column_name='hora_max_ingreso') then 'OK' else 'FALTA' end as hora_max,
       case when exists (select 1 from information_schema.columns where table_name='catalogo_tickets' and column_name='instrucciones') then 'OK' else 'FALTA' end as instrucciones,
       case when exists (select 1 from information_schema.columns where table_name='catalogo_tickets' and column_name='zona') then 'OK' else 'FALTA' end as zona,
       case when exists (select 1 from information_schema.columns where table_name='catalogo_tickets' and column_name='transferible') then 'OK' else 'FALTA' end as transferible;
