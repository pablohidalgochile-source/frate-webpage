-- ============================================================
-- FRATE — Inbox único WEB↔ERP (contrato #1)
-- Mapea el usuario del canal externo (WhatsApp/IG) del ERP a
-- NUESTRA conversación, para que el Anfitrión mantenga el hilo.
--
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- api-crm degrada suave si esto no está, pero sin el hilo por
-- external_id cada mensaje abriría una conversación nueva.
-- ============================================================

alter table public.conversaciones add column if not exists external_id text;

-- Buscar rápido la conversación por (canal, external_id)
create index if not exists conversaciones_canal_ext_idx
  on public.conversaciones (canal, external_id)
  where external_id is not null;

-- Verificación
select 'conversaciones.external_id' as check,
       case when exists(select 1 from information_schema.columns where table_name='conversaciones' and column_name='external_id') then 'OK' else 'FALTA' end;
