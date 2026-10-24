-- ============================================================
-- FRATE · Sincronización WEB → ERP (cortesías + puerta)
-- Proyecto WEB · SQL Editor. Ver ARQUITECTURA-SYNC-ERP.md
-- ============================================================

-- 1) Tabla de deduplicación: qué QR ya se entregó al ERP (para no reenviar)
create table if not exists public.erp_sync_log (
  ref     text primary key,          -- 'cortesia|FCC-001518-1' o 'checkin|FCC-001518-1'
  tipo    text not null,             -- cortesia_emitida | checkin
  qr      text,
  sent_at timestamptz default now()
);
create index if not exists erp_sync_log_qr_idx on public.erp_sync_log (qr);

-- ============================================================
-- 2) CRON — ⚠️ ACTIVAR SOLO cuando el ERP YA ACEPTE los tipos
--    'cortesia_emitida' y 'checkin' (ver el documento). Si lo
--    activas antes, los eventos se encolan hasta que el ERP esté.
--
-- Requiere las extensiones pg_cron + pg_net (ya usadas por mp-conciliar).
-- Reemplaza <TU_CRON_SECRET> por el secreto que setees en Supabase
-- (supabase secrets set CRON_SECRET=... --project-ref ydwlpra…), o
-- quita la línea de headers x-cron-secret si no usas secreto.
-- ============================================================
-- select cron.schedule('sync-erp-2min', '*/2 * * * *', $$
--   select net.http_post(
--     url     := 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/sync-erp',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"<TU_CRON_SECRET>"}'::jsonb
--   );
-- $$);

-- Para desactivar el cron más adelante:
-- select cron.unschedule('sync-erp-2min');
