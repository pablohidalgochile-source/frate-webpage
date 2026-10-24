-- 🧭 ¿QUÉ SQL FALTA CORRER? — que responda la base, no la memoria
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira.
--
-- Es UNA SOLA consulta a propósito: el editor de Supabase muestra el
-- resultado de la ÚLTIMA sentencia nomás. La versión anterior traía
-- cuatro y por eso solo se veía la última.
--
-- Revisa si existe de verdad lo que cada archivo crea. Los ❌ salen
-- arriba: corre solo esos.

with chk(archivo, tipo, obj, det) as (values
  ('frate-plantillas-unificar-1.sql ','columna','catalogo_tickets','origen_plantilla_id'),
  ('frate-cerrar-eventos-auto-1.sql ','función','eventos_cerrar_vencidos',''),
  ('frate-comisiones-mp.sql         ','tabla','comisiones_mp',''),
  ('frate-retencion-8.sql           ','ajuste','devolucion_retencion_pct',''),
  ('frate-politica-opcion-a.sql     ','ajuste','comision_mp_pct',''),
  ('frate-devolucion-pin.sql        ','función','devolucion_pin_ok',''),
  ('frate-devolucion-pin-2.sql      ','función','mi_entrada_gestion',''),
  ('frate-mi-entrada.sql            ','función','mis_entradas',''),
  ('frate-notas-credito.sql         ','columna','pedidos','nc_folio'),
  ('frate-diferencia-1.sql          ','tabla','tickets_diferencia',''),
  ('frate-diferencia-2.sql          ','función','diferencia_emitir',''),
  ('frate-diferencia-3.sql          ','función','diferencia_pagar',''),
  ('frate-registro-puerta-1.sql     ','columna','ingresos_manuales','fecha_nacimiento'),
  ('frate-registro-puerta-2.sql     ','función','puerta_registrar_ingreso',''),
  ('frate-baneados.sql              ','tabla','baneados',''),
  ('frate-SEGURIDAD-admins.sql      ','tabla','admins_autorizados',''),
  ('frate-whatsapp.sql              ','tabla','wsp_conversaciones',''),
  ('frate-form-defs.sql             ','tabla','form_defs',''),
  ('frate-rrpp-portal.sql           ','función','rrpp_crear_lista',''),
  ('frate-rrpp-rendimiento.sql      ','función','rrpp_cuenta_de_texto',''),
  ('frate-tickets-publico.sql       ','columna','catalogo_tickets','genero'),
  ('frate-catalogo-cierre.sql       ','columna','catalogo_tickets','cierre_venta'),
  ('frate-sync-erp-tiempo-real.sql  ','función','fn_disparar_sync_erp',''),
  ('frate-pos-llaves.sql            ','tabla','pos_llaves',''),
  ('frate-links-portada.sql         ','columna','link_items','cover'),
  ('frate-limpiar-nombres-ordenes.sql','columna','pedidos','vino_por')
),
res as (
  select c.archivo,
         c.tipo || ' ' || c.obj || case when c.det <> '' then '.' || c.det else '' end as crea,
         case when case c.tipo
           when 'función' then exists (select 1 from pg_proc p
                                        join pg_namespace n on n.oid = p.pronamespace
                                       where n.nspname = 'public' and p.proname = c.obj)
           when 'tabla'   then to_regclass('public.' || c.obj) is not null
           when 'columna' then exists (select 1 from information_schema.columns i
                                       where i.table_schema = 'public'
                                         and i.table_name = c.obj and i.column_name = c.det)
           when 'ajuste'  then exists (select 1 from public.config_valores v where v.clave = c.obj)
         end then '✅ corrido' else '❌ FALTA' end as estado
  from chk c

  union all
  -- Los que no crean nada: se revisan por sus datos.
  select 'frate-plantillas-unificar-2.sql', 'datos · plantillas migradas al catálogo',
         case when exists (select 1 from public.catalogo_tickets
                            where origen_plantilla_id is not null)
              then '✅ corrido' else '❌ FALTA' end

  union all
  select 'frate-cerrar-fantasma.sql', 'datos · solicitud FCC-003682 cerrada',
         case when exists (select 1 from public.pedidos
                            where id = 3682 and dev_estado = 'pendiente')
              then '❌ FALTA' else '✅ corrido' end

  union all
  select 'frate-cerrar-eventos-auto-2.sql', 'el reloj de pg_cron',
         case when exists (select 1 from cron.job
                            where jobname = 'frate-cerrar-eventos')
              then '✅ corrido' else '❌ FALTA' end
)
select archivo, crea, estado
from res
order by (estado = '✅ corrido'), archivo;
