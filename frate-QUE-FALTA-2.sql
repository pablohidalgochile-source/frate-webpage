-- ✅ ¿QUÉ FALTA DE VERDAD?  (SOLO LECTURA) · versión corregida
--
-- El chequeo anterior buscaba índices con nombres que YO inventé y por eso
-- dio 0. Estos son los nombres reales que crea frate-indices-2.sql.

select
  (select count(*) from pg_indexes where schemaname='public'
    and indexname in ('items_pedido_tt_idx','pedidos_metodo_idx',
                      'qr_usados_incidencia_idx','lista_inscritos_estado_idx')) as indices_2_de_4,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='convenios')                     as convenios_0_o_1,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='premio_canjear')                    as premio_canjear_debe_ser_1,
  (select count(*) from information_schema.columns
    where table_name='clientes' and column_name in ('red_social','usuario_red')) as redes_de_2,
  (select count(*) from information_schema.tables where table_schema='public'
    and table_name in ('concursos','concurso_premios','concurso_giros'))        as concursos_de_3,
  (select count(*) from information_schema.tables where table_schema='public'
    and table_name in ('premios_link','premios_link_canjes','cumple_links'))    as premios_cumples_de_3;
