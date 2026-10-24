-- ============================================================
-- FRATE — Contrato maestro R32: identidad estable de cada ticket
-- Agrega tipos_ticket.ticket_uid para casar tickets del brief por
-- UID (no por nombre). Corre una vez en el Supabase de la WEB
-- (ydwlpra…). Idempotente y aditivo — no toca nada existente.
-- ============================================================

alter table public.tipos_ticket
  add column if not exists ticket_uid text;

-- Búsqueda rápida por (evento, uid) desde api-evento-ingest.
create index if not exists idx_tipos_ticket_uid
  on public.tipos_ticket (evento_id, ticket_uid);

-- Verificar:
select 'tipos_ticket.ticket_uid' as check,
       case when exists (
         select 1 from information_schema.columns
         where table_schema='public' and table_name='tipos_ticket' and column_name='ticket_uid'
       ) then 'OK' else 'FALTA' end as estado;
