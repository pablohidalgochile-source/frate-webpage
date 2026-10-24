-- frate-SEGURIDAD-rate-y-vista.sql   ·   12-oct-2026
--
-- Dos objetos quedaron abiertos a la llave publica que va escrita en el HTML
-- del sitio. Comprobado en vivo antes de escribir esto:
--   rate_limit              → 7.425 filas con IPs, y anon con DELETE/UPDATE/TRUNCATE
--   v_social_ventas_evento  → 50 noches de facturacion, legibles por cualquiera
--
-- Radio de impacto revisado antes de tocar:
--   · rate_limit no lo lee NADIE del front. Las edge functions lo usan por el RPC
--     `rate_ok`, que es SECURITY DEFINER y solo lo pueden llamar service_role y
--     postgres (_shared/rate.ts:16). Cerrar la tabla no los afecta.
--   · v_social_ventas_evento la usa FRATE Social Command, pero NO con la llave
--     publica: se conecta con el rol dedicado `social_ro`, que tiene bypassrls y
--     su propio grant (web-contract.sql:40). Revocar anon no lo toca.

-- ── 1. El freno del sitio ────────────────────────────────────────────────
alter table public.rate_limit enable row level security;
revoke all on public.rate_limit from anon, authenticated;

-- ── 2. El libro de ventas ────────────────────────────────────────────────
revoke all on public.v_social_ventas_evento from anon, authenticated;
alter view public.v_social_ventas_evento set (security_invoker = on);

-- Para revertir:
--   grant select on public.rate_limit to anon, authenticated;
--   alter table public.rate_limit disable row level security;
--   grant select on public.v_social_ventas_evento to anon, authenticated;
--   alter view public.v_social_ventas_evento set (security_invoker = off);
