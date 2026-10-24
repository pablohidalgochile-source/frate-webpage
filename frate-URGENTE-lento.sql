-- 🚨 ¿QUÉ ESTÁ LENTO AHORA MISMO? — para correr en vivo
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- Córrela AHORA, mientras se siente lento. Mide el momento, no el pasado.
--
-- CÓMO LEERLA — la columna `que_es` te dice qué mirar:
--
--   🚨 CONSULTA PEGADA   → algo lleva más de 5 segundos corriendo. Si ves
--                          varias iguales, esa consulta es el problema.
--   ⏳ esperando          → está trabada esperando a otra. Mira `trabada_por`:
--                          ese es el proceso que tiene tomado lo que necesita.
--   🔵 corriendo          → normal, va rápido.
--   📊 tabla que crece    → tablas que se llenaron mucho. `net._http_response`
--                          es la típica: pg_net guarda ahí CADA aviso que le
--                          mandamos al ERP y nadie la limpia. Si tiene cientos
--                          de miles de filas, ahí está tu lentitud.

select que_es, detalle, hace, extra from (

  -- Lo que está corriendo en este segundo
  select 1 as ord,
         case when now() - query_start > interval '5 seconds' then '🚨 CONSULTA PEGADA'
              when wait_event_type is not null                then '⏳ esperando'
              else '🔵 corriendo' end                          as que_es,
         left(regexp_replace(query, '\s+', ' ', 'g'), 95)       as detalle,
         to_char(now() - query_start, 'MI:SS')                  as hace,
         case when cardinality(pg_blocking_pids(pid)) > 0
                   then 'la traba el proceso ' || array_to_string(pg_blocking_pids(pid), ', ')
              when wait_event_type is not null
                   then 'esperando ' || wait_event_type
              else state end                                    as extra
  from pg_stat_activity
  where state <> 'idle'
    and pid <> pg_backend_pid()
    and query_start is not null

  union all

  -- Las tablas más pesadas, por si alguna se disparó
  select 2,
         '📊 tabla que crece',
         schemaname || '.' || relname,
         pg_size_pretty(pg_total_relation_size(relid)),
         n_live_tup::text || ' filas'
  from pg_stat_user_tables
  where pg_total_relation_size(relid) > 50 * 1024 * 1024

) t
order by ord, hace desc nulls last;
