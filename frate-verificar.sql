-- ============================================================
-- FRATE · ¿Están todos los SQL corridos? — Verificación en 1 tiro
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- Corre TODO este bloque y mira la columna "estado". Pégame el resultado.
-- ============================================================

select 'cumpleanos (tabla · memoria)' as chequeo,
  case when exists(select 1 from information_schema.tables where table_name='cumpleanos')
       then '✅ ok' else '❌ FALTA · frate-cumpleanos-memoria.sql' end as estado
union all
select 'operacion_diaria (tabla · memoria)',
  case when exists(select 1 from information_schema.tables where table_name='operacion_diaria')
       then '✅ ok' else '❌ FALTA · frate-cumpleanos-memoria.sql' end
union all
select 'cumpleaños importados (~1443)',
  (select case when count(*) >= 1000 then '✅ ok ('||count(*)||')'
               else '⚠️ solo '||count(*)||' · corre frate-cumpleanos-import.sql' end
   from public.cumpleanos)
union all
select 'noches pulseras/ingreso (~102)',
  (select case when count(*) >= 50 then '✅ ok ('||count(*)||')'
               else '⚠️ solo '||count(*)||' · frate-cumpleanos-import.sql' end
   from public.operacion_diaria)
union all
select 'etapas formularios (7 nuevas)',
  case when exists(select 1 from pg_constraint
                   where conrelid='public.formularios'::regclass and contype='c'
                     and pg_get_constraintdef(oid) ilike '%sin_disp%')
       then '✅ ok' else '❌ FALTA · frate-formularios-etapas.sql' end
union all
select 'devolver cupo al cancelar/reembolsar',
  case when exists(select 1 from pg_proc
                   where proname='fn_descontar_stock'
                     and pg_get_functiondef(oid) ilike '%disponible + ip.cantidad%')
       then '✅ ok' else '❌ FALTA · frate-stock-devolver.sql' end
union all
select 'RLS: RRPP edita/normaliza inscritos',
  case when exists(select 1 from pg_policies
                   where tablename='lista_inscritos' and policyname='li_upd_duenos')
       then '✅ ok' else '❌ FALTA · frate-rrpp-editar.sql' end
union all
select 'catálogo: 4 tipos nuevos',
  (select case when count(*) >= 4 then '✅ ok' else '⚠️ solo '||count(*)||' · frate-catalogo-tickets.sql' end
   from public.catalogo_tickets
   where nombre ilike any(array['%LISTA CORTESIA STAFF%','%CUMPLEAÑOS INVITAD%','%LISTA VIP AIRE%','%LISTA VIP FUEGO%']))
union all
select 'nombres con ( ) sin limpiar',
  (select case when (
     (select count(*) from public.personas        where nombre ~ '\(') +
     (select count(*) from public.lista_inscritos  where nombre ~ '\(') +
     (select count(*) from public.reservas         where nombre ~ '\(') +
     (select count(*) from public.formularios      where nombre ~ '\(')
   ) = 0 then '✅ ok (0)' else '⚠️ quedan sucios · frate-limpiar-nombres.sql' end)
union all
select 'duplicados de formularios abiertos',
  (select case when count(*)=0 then '✅ ok (0)'
               else '⚠️ '||count(*)||' nombres con 2+ abiertos · frate-formularios-dedup.sql' end
   from (select 1 from public.formularios
         where estado not in ('realizado','no_realizado')
         group by tipo, upper(btrim(nombre)) having count(*)>1) d)
order by 1;

-- ── Borra el registro de prueba que quedó (lo pediste) ──
delete from public.formularios where nombre in ('ZZZ TEST TELEFONO','OTRO NOMBRE DISTINTO');
