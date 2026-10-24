-- ============================================================
-- FRATE · Auto-sincronización 24/7 con MercadoPago (pg_cron)
-- Proyecto WEB · SQL Editor. Córrelo UNA vez.
--
-- Programa un robot que cada 10 minutos revisa los últimos pagos
-- de MercadoPago y reconcilia los que no se reflejaron (marca la
-- orden pagada + reenvía el ticket con QR). Idempotente y seguro:
-- si ya está pagado, no hace nada; no manda correos repetidos.
-- ============================================================

-- 1) Extensiones necesarias (una vez)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Programar cada 10 minutos (la anon key es pública, va en el header)
select cron.schedule(
  'frate-mp-conciliar',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/mp-conciliar?n=80',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt',
        'Authorization', 'Bearer sb_publishable_-_7GeDU_h84zf2v--lWQaQ_15ZFxOWt'
      )
    );
  $cron$
);

-- ── Comprobar que quedó programado ──
select jobid, jobname, schedule, active from cron.job where jobname = 'frate-mp-conciliar';

-- ── (opcional) ver las últimas ejecuciones ──
-- select status, return_message, start_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname='frate-mp-conciliar')
-- order by start_time desc limit 10;

-- ── (opcional) para APAGARLO en el futuro ──
-- select cron.unschedule('frate-mp-conciliar');
