-- ============================================================
-- FRATE — WEB → ERP EN VIVO (tiempo real, Database Webhook casero)
-- ------------------------------------------------------------
-- Dispara la edge function `sync-erp` APENAS ocurre:
--   • un check-in en la puerta   (insert en qr_usados)
--   • una venta pagada           (pedidos.estado → 'pagado')
--
-- Usa pg_net → la llamada HTTP es ASÍNCRONA (no bloquea el escaneo
-- ni el pago; si el ERP está caído, la puerta/venta NO se ven afectadas).
-- sync-erp barre los últimos días y deduplica solo → es idempotente.
--
-- Anti-estampida: máx. 1 disparo cada 15s (un evento lleno escanea
-- muchísimo; sync-erp igual manda TODO lo pendiente en cada corrida).
--
-- Correr UNA vez en el Supabase de la WEB (ydwlpra…). Idempotente.
-- Después: edita la fila de config con tu CRON_SECRET (si lo usas).
-- ============================================================

-- 0) Extensión HTTP asíncrona
create extension if not exists pg_net;

-- 1) Config de 1 fila (URL de la función + secreto opcional) -------------------
create table if not exists public.erp_sync_cfg (
  id      int primary key default 1,
  url     text not null default 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/sync-erp',
  secret  text,                                  -- = CRON_SECRET de sync-erp (si lo configuraste). Si no, deja NULL.
  activo  boolean not null default true,         -- apaga el envío en vivo poniéndolo en false
  ultimo  timestamptz,                           -- último disparo (para el anti-estampida)
  constraint erp_sync_cfg_one_row check (id = 1)
);
insert into public.erp_sync_cfg (id) values (1) on conflict (id) do nothing;

-- ⬇️  SI USAS CRON_SECRET en la función, descomenta y pon el valor:
-- update public.erp_sync_cfg set secret = 'TU_CRON_SECRET' where id = 1;

-- 2) Disparador (async, best-effort, con debounce de 15s) ----------------------
create or replace function public.fn_disparar_sync_erp() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg record; full_url text;
begin
  select * into cfg from public.erp_sync_cfg where id = 1;
  if cfg is null or not cfg.activo then return null; end if;

  -- anti-estampida: no más de 1 disparo cada 15 segundos
  if cfg.ultimo is not null and now() - cfg.ultimo < interval '15 seconds' then
    return null;
  end if;
  update public.erp_sync_cfg set ultimo = now() where id = 1;

  full_url := cfg.url || case when nullif(btrim(coalesce(cfg.secret,'')),'') is not null
                               then '?key=' || cfg.secret else '' end;
  begin
    perform net.http_post(
      url     := full_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body    := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  exception when others then null;   -- NUNCA romper la puerta ni la venta
  end;
  return null;
end; $$;

-- 3) Triggers ------------------------------------------------------------------
-- 3a) Cada check-in en la puerta
drop trigger if exists trg_sync_erp_checkin on public.qr_usados;
create trigger trg_sync_erp_checkin
  after insert on public.qr_usados
  for each row execute function public.fn_disparar_sync_erp();

-- 3b) Cada venta que pasa a pagada
drop trigger if exists trg_sync_erp_venta on public.pedidos;
create trigger trg_sync_erp_venta
  after update of estado on public.pedidos
  for each row
  when (NEW.estado = 'pagado' and OLD.estado is distinct from 'pagado')
  execute function public.fn_disparar_sync_erp();

-- ── Verificar / operar ────────────────────────────────────────────────────────
--   Ver config:     select * from public.erp_sync_cfg;
--   Apagar en vivo:  update public.erp_sync_cfg set activo = false where id = 1;
--   Forzar ahora:    update public.erp_sync_cfg set ultimo = null where id = 1;
--   Ver últimas llamadas HTTP:  select * from net._http_response order by created desc limit 20;
