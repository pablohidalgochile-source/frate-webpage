-- ✅ ¿QUÉ SQL FALTA CORRER? · 10 de septiembre
-- Solo LEE. Pregunta por cada objeto en vez de confiar en la memoria.

with f(archivo, tipo, objeto) as (values
  -- Lo último que te mandé
  ('frate-rrpp-grupos-1.sql',          'columna',  'rrpp_pago.grupo'),
  ('frate-rrpp-grupos-2.sql',          'función',  'rrpp_rendimiento'),
  ('frate-rrpp-liquidar-periodo.sql',  'función',  'rrpp_liquidar_periodo'),
  ('frate-rrpp-portal-tarifa.sql',     'función',  'rrpp_mi_tarifa_de'),
  ('frate-rrpp-portal-tarifa.sql',     'función',  'rrpp_mi_tarifa'),
  ('frate-rrpp-portal-tarifa-2.sql',   'función',  'rrpp_mi_rendimiento'),
  ('frate-rrpp-sacar-del-informe.sql', 'grupo',    'fuera'),
  ('frate-rrpp-acumulado-periodo.sql', 'función',  'rrpp_acumulado_fechas'),
  -- Pendientes viejos que arrastramos
  ('frate-notas-credito.sql',          'tabla',    'notas_credito'),
  ('frate-whatsapp.sql',               'tabla',    'wsp_mensajes'),
  ('frate-form-defs.sql',              'tabla',    'form_defs'),
  ('frate-baneados.sql',               'tabla',    'baneados'),
  ('frate-tickets-publico.sql',        'columna',  'tipos_ticket.publico'),
  ('frate-premios-2.sql',              'función',  'premio_canjear'),
  ('frate-reserva-cupo.sql',           'columna',  'pedidos.stock_reservado'),
  ('frate-bitacora-admin.sql',         'función',  'anular_pedido'),
  ('frate-cerrar-listas.sql',          'función',  'lista_publica'),
  ('frate-cupos-lista.sql',            'función',  'lista_cupos')
)
select f.archivo, f.objeto,
  case
    when f.tipo = 'función' and f.objeto = 'rrpp_acumulado_fechas' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='rrpp_acumulado'
                           and pg_get_function_identity_arguments(p.oid) like '%date%')
           then '✅ corrido' else '❌ FALTA' end
    when f.tipo = 'función' and f.objeto = 'rrpp_mi_rendimiento' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='rrpp_mi_rendimiento'
                           and pg_get_functiondef(p.oid) like '%rrpp_mi_tarifa_de%')
           then '✅ corrido' else '❌ FALTA (existe, pero con la tarifa global)' end
    when f.tipo = 'función' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname=f.objeto)
           then '✅ corrido' else '❌ FALTA' end
    when f.tipo = 'tabla' then
      case when to_regclass('public.'||f.objeto) is not null
           then '✅ corrido' else '❌ FALTA' end
    when f.tipo = 'columna' then
      case when exists (select 1 from information_schema.columns
                         where table_schema='public'
                           and table_name = split_part(f.objeto,'.',1)
                           and column_name = split_part(f.objeto,'.',2))
           then '✅ corrido' else '❌ FALTA' end
    when f.tipo = 'grupo' then
      case when exists (select 1 from public.rrpp_pago where grupo = f.objeto)
           then '✅ corrido' else '⚠️ sin filas en ese grupo' end
  end as estado
from f
order by estado desc, f.archivo;
