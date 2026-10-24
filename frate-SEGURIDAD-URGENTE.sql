-- ============================================================
-- FRATE · PARCHE DE SEGURIDAD URGENTE (2026-07-25)
-- Cierra 4 fugas CONFIRMADAS EN VIVO con la llave pública del sitio.
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor. Idempotente.
--
-- ✅ Verificado antes de escribirlo: NADA del sitio público se rompe.
--    · el carrito valida códigos por la RPC validar_codigo (no lee la tabla)
--    · admin_pin solo lo leen admin.html y validacion.html, ambas CON login
--    · votos solo se usa para contar los votos PROPIOS del usuario logueado
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) 🚨 CRÍTICO · erp_sync_log / erp_sync_cfg estaban SIN RLS
--    erp_sync_log.qr  = el token QR de CADA check-in y cortesía → con eso
--                       se pueden imprimir entradas válidas.
--    erp_sync_cfg.secret = el CRON_SECRET en texto plano.
--    Ambas quedaron legibles por cualquiera. Nadie del sitio las usa:
--    solo las tocan los triggers y la edge sync-erp (service_role, que
--    ignora RLS). Cerrarlas es seguro.
-- ────────────────────────────────────────────────────────────
alter table if exists public.erp_sync_log enable row level security;
alter table if exists public.erp_sync_cfg enable row level security;

revoke all on public.erp_sync_log from anon, authenticated;
revoke all on public.erp_sync_cfg from anon, authenticated;

-- Solo el admin puede mirar el log (para diagnóstico). El secreto: nadie.
drop policy if exists erp_sync_log_admin on public.erp_sync_log;
create policy erp_sync_log_admin on public.erp_sync_log for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));


-- ────────────────────────────────────────────────────────────
-- 2) 🚨 CRÍTICO · config_valores era de lectura PÚBLICA TOTAL
--    Quedaba expuesto el admin_pin (el PIN que autoriza ingresos fuera
--    de horario en la puerta), el WhatsApp del staff y el correo interno.
--    Estrategia conservadora: sigue siendo público TODO menos una lista
--    corta de claves sensibles → cero riesgo de romper el sitio.
-- ────────────────────────────────────────────────────────────
drop policy if exists config_valores_public_read on public.config_valores;

create policy config_valores_public_read on public.config_valores for select
  using (
    clave not in ('admin_pin', 'devoluciones_wsp', 'admin_bcc_email')
    and clave not like '%secret%'
    and clave not like '%token%'
    and clave not like '%api_key%'
    and clave not like '%password%'
  );

-- El staff logueado sí lee todo (la puerta necesita el PIN, el admin la config)
drop policy if exists config_valores_staff_read on public.config_valores;
create policy config_valores_staff_read on public.config_valores for select
  using (exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol in ('admin','portero','rrpp')));


-- ────────────────────────────────────────────────────────────
-- 3) 🟠 ALTO · codigos era de lectura pública
--    Cualquiera listaba TODOS los códigos de descuento (incluidos los no
--    publicados y los de cada RRPP) con su % de descuento.
--    El carrito NO lee esta tabla: usa la RPC validar_codigo. Seguro cerrar.
-- ────────────────────────────────────────────────────────────
drop policy if exists codigos_select_public on public.codigos;

drop policy if exists codigos_staff_read on public.codigos;
create policy codigos_staff_read on public.codigos for select
  using (exists (select 1 from public.clientes c
                 where c.id = auth.uid() and c.rol in ('admin','rrpp')));


-- ────────────────────────────────────────────────────────────
-- 4) 🟠 ALTO · votos exponía cliente_id (UUID de cada usuario)
--    Esa lista de UUIDs es la "lista de víctimas" para otros ataques.
--    El sitio solo cuenta los votos PROPIOS del usuario logueado → con
--    ver-solo-los-míos sigue funcionando igual.
-- ────────────────────────────────────────────────────────────
drop policy if exists votos_select_public on public.votos;
drop policy if exists votos_public_read on public.votos;

drop policy if exists votos_propios on public.votos;
create policy votos_propios on public.votos for select
  using (auth.uid() = cliente_id);

drop policy if exists votos_admin_read on public.votos;
create policy votos_admin_read on public.votos for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));


-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN (debe quedar todo en ✅)
-- ────────────────────────────────────────────────────────────
select 'erp_sync_log · RLS' as chequeo,
       case when (select rowsecurity from pg_tables where tablename='erp_sync_log') then '✅ cerrada' else '🚨 sigue abierta' end as estado
union all
select 'erp_sync_cfg · RLS',
       case when (select rowsecurity from pg_tables where tablename='erp_sync_cfg') then '✅ cerrada' else '🚨 sigue abierta' end
union all
select 'config_valores · admin_pin protegido',
       case when exists(select 1 from pg_policies where tablename='config_valores' and policyname='config_valores_staff_read')
            then '✅ solo staff' else '🚨 revisar' end
union all
select 'codigos · lectura pública',
       case when exists(select 1 from pg_policies where tablename='codigos' and policyname='codigos_select_public')
            then '🚨 sigue abierta' else '✅ cerrada' end
union all
select 'votos · cliente_id',
       case when exists(select 1 from pg_policies where tablename='votos' and policyname='votos_propios')
            then '✅ solo propios' else '🚨 revisar' end;

-- ============================================================
-- QUEDA PENDIENTE (requiere cambios de código, NO este SQL):
--   · staff-buscar    → hoy entrega los 60 del personal (con RUT) SIN login
--   · send-receipt    → hoy cualquiera manda correos desde tickets@frate.cl
--   · crear-pago      → confía en el clienteId que manda el navegador
--   · reanudar-pago   → sin autenticación (habilita el bucle de crédito)
--   · sitio_codigo    → lo lee index.html sin login; cerrarlo requiere
--                       mover el chequeo a una RPC primero
-- ============================================================
