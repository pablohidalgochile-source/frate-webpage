-- ============================================================
-- FRATE · VERIFICACIÓN TOTAL (2026-07-25) — solo LEE, no cambia nada.
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor.
--
-- Corre el BLOQUE 1 y pégame el resultado.
-- Después corre el BLOQUE 2 (aparte) y pégame ese también.
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 1 · Migraciones aplicadas + Seguridad (RLS)       ║
-- ║ Selecciona desde aquí hasta el "-- FIN BLOQUE 1" y corre.║
-- ╚══════════════════════════════════════════════════════════╝

select 'A · MIGRACIONES' as bloque, '' as chequeo, '' as estado
union all
select 'A', '⭐ anti-spam formularios · columnas dk_*',
  case when exists(select 1 from information_schema.columns where table_name='formularios' and column_name='dk_email')
        and exists(select 1 from information_schema.columns where table_name='formularios' and column_name='dk_tel')
       then '✅ ok' else '❌ FALTA · frate-form-dedup.sql' end
union all
select 'A', '⭐ anti-spam formularios · candados únicos',
  case when exists(select 1 from pg_indexes where indexname='ux_form_dk_email')
        and exists(select 1 from pg_indexes where indexname='ux_form_dk_tel')
       then '✅ ok' else '❌ FALTA · frate-form-dedup.sql (sin esto vuelven los duplicados)' end
union all
select 'A', 'devoluciones autoservicio · tabla',
  case when exists(select 1 from information_schema.tables where table_name='solicitudes_devolucion')
       then '✅ ok' else '❌ FALTA · frate-devoluciones-solicitud.sql' end
union all
select 'A', 'devoluciones · ¿link público encendido?',
  coalesce((select case when lower(valor)='true' then '🌐 ACTIVO (los clientes ya pueden pedir)'
                        else '🔒 apagado (por defecto)' end
            from public.config_valores where clave='devoluciones_activo'), '— sin config · frate-devoluciones-solicitud.sql')
union all
select 'A', 'formularios configurables · form_defs',
  case when exists(select 1 from information_schema.tables where table_name='form_defs')
       then '✅ ok' else '⚠️ FALTA · frate-form-defs.sql (los forms usan el respaldo interno)' end
union all
select 'A', 'FRATE CONNECT · espejo WhatsApp→conversaciones',
  case when exists(select 1 from information_schema.columns where table_name='conversaciones' and column_name='wsp_id')
       then '✅ ok' else '⚠️ FALTA · frate-connect.sql (WhatsApp no entra al inbox unificado)' end
union all
select 'A', 'WEB→ERP en vivo · trigger pg_net',
  case when exists(select 1 from information_schema.tables where table_name='erp_sync_cfg')
       then '✅ ok' else '⚠️ FALTA · frate-sync-erp-tiempo-real.sql (el ERP no recibe en vivo)' end
union all
select 'A', 'puerta en vivo · RPC evento_vivo',
  case when exists(select 1 from pg_proc where proname='evento_vivo')
       then '✅ ok' else '❌ FALTA · frate-evento-vivo.sql (/vivo y el banner no cargan)' end
union all
select 'A', 'reportes post-evento · RPC evento_reporte',
  case when exists(select 1 from pg_proc where proname='evento_reporte')
       then '✅ ok' else '⚠️ FALTA · frate-evento-reporte.sql' end
union all
select 'A', 'notas de crédito · columnas fiscales (IVA)',
  case when exists(select 1 from information_schema.columns where table_name='pedidos' and column_name='dev_iva')
       then '✅ ok' else '⚠️ FALTA · frate-notas-credito.sql (IVA a recuperar sin registrar)' end
union all
select 'A', 'captura VIP en puerta · RPC',
  case when exists(select 1 from pg_proc where proname='puerta_capturar_cliente')
       then '✅ ok' else '⚠️ FALTA · frate-puerta-captura.sql' end
union all
select 'A', 'validación offline puerta · RPC snapshot',
  case when exists(select 1 from pg_proc where proname='puerta_snapshot_qr')
       then '✅ ok' else '⚠️ FALTA · frate-puerta-offline.sql' end
union all
select 'A', 'candado anti doble-uso de QR (índice único)',
  case when exists(select 1 from pg_indexes where tablename='qr_usados' and indexdef ilike '%unique%')
       then '✅ ok' else '🚨 FALTA — un QR podría usarse 2 veces' end
union all
select 'A', 'WhatsApp Cloud · tablas inbox',
  case when exists(select 1 from information_schema.tables where table_name='wsp_conversaciones')
       then '✅ ok' else '⚠️ FALTA · frate-whatsapp.sql' end
union all
select 'A', 'lista de baneados',
  case when exists(select 1 from information_schema.tables where table_name='baneados')
       then '✅ ok' else '⚠️ FALTA · frate-baneados.sql' end
union all
select 'C · SEGURIDAD (RLS)', '', ''
union all
select 'C',
  'tabla · '||tablename,
  case when rowsecurity then '✅ RLS on · '||(select count(*) from pg_policies p where p.tablename=t.tablename and p.schemaname='public')::text||' polít.'
       else '🚨 RLS APAGADA — datos legibles con la llave pública' end
from pg_tables t
where schemaname='public'
  and tablename in ('clientes','personas','pedidos','items_pedido','qr_usados','formularios','reservas',
                    'listas','lista_inscritos','conversaciones','mensajes','wsp_conversaciones','wsp_mensajes',
                    'config_valores','solicitudes_devolucion','ingresos_manuales','cumpleanos','baneados','eventos','tipos_ticket')
order by 1, 2;

-- FIN BLOQUE 1


-- ╔══════════════════════════════════════════════════════════╗
-- ║ BLOQUE 2 · ¿El anti-spam quedó limpio? (corre aparte)    ║
-- ║ Solo funciona si el Bloque 1 dijo ✅ en "columnas dk_*". ║
-- ╚══════════════════════════════════════════════════════════╝

select 'duplicados por correo que aún quedan (debe ser 0)' as chequeo,
       coalesce((select count(*)::text from (
          select dk_email from public.formularios
          where dk_email is not null group by dk_email having count(*)>1) x), '0') as valor
union all
select 'duplicados por teléfono que aún quedan (debe ser 0)',
       coalesce((select count(*)::text from (
          select dk_tel from public.formularios
          where dk_tel is not null group by dk_tel having count(*)>1) y), '0')
union all
select 'total de solicitudes en el sistema',
       (select count(*)::text from public.formularios)
union all
select 'solicitudes creadas HOY (hora Chile)',
       (select count(*)::text from public.formularios
        where (created_at at time zone 'America/Santiago')::date = (now() at time zone 'America/Santiago')::date)
union all
select 'caso BENJAMIN (eran ~18 · debe quedar 1)',
       (select count(*)::text from public.formularios
        where upper(coalesce(nombre,'')) like 'BENJAMIN VICENTE VIDAL%')
union all
select 'caso FRANCISCA PINOCHET (debe quedar 1)',
       (select count(*)::text from public.formularios
        where upper(coalesce(nombre,'')) like '%FRANCISCA%PINOCHET%');

-- ============================================================
-- Extra opcional (detalle de políticas, por si el auditor lo pide):
--   select tablename, policyname, cmd, qual::text
--   from pg_policies where schemaname='public' order by tablename, policyname;
-- ============================================================
