-- FRATE · PASO 1 · diagnóstico antes de construir (SOLO LECTURA, no cambia nada)
-- Proyecto WEB · SQL Editor · correr completo y copiar el resultado (una fila por sección)
with
g1 as (select jsonb_agg(jsonb_build_object('tabla', c.relname, 'trigger', t.tgname, 'funcion', p.proname,
               'activo', t.tgenabled, 'def', pg_get_triggerdef(t.oid)) order by c.relname, t.tgname) v
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public' and not t.tgisinternal
          and c.relname in ('clientes', 'pedidos', 'items_pedido', 'tipos_ticket')),
g2 as (select jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
               'definer', p.prosecdef, 'volatil', p.provolatile, 'cuerpo', pg_get_functiondef(p.oid)) order by p.proname) v
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and (p.proname in ('tg_proteger_rol', 'tg_validar_rut_cliente', 'current_user_is_admin', 'rut_limpio',
                             'fn_descontar_stock', 'puerta_check_qr', 'puerta_buscar_rut', 'editar_asistente')
               or p.proname ilike '%cupo%')),
g3 as (select jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname) v
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname ilike '%admin%' or p.proname ilike '%staff%' or p.proname ilike '%rol%')),
g4 as (select jsonb_agg(jsonb_build_object('tabla', table_name, 'col', column_name, 'tipo', data_type,
               'nulo', is_nullable) order by table_name, ordinal_position) v
         from information_schema.columns
        where table_schema = 'public' and table_name in ('clientes', 'pedidos', 'items_pedido', 'tipos_ticket')),
g5 as (select jsonb_agg(jsonb_build_object('tabla', tablename, 'politica', policyname, 'cmd', cmd,
               'roles', roles, 'using', qual, 'check', with_check) order by tablename, cmd) v
         from pg_policies where schemaname = 'public' and tablename in ('clientes', 'pedidos', 'items_pedido')),
g6 as (select jsonb_agg(jsonb_build_object('tabla', conrelid::regclass::text, 'nombre', conname,
               'def', pg_get_constraintdef(oid))) v
         from pg_constraint where conrelid in ('public.clientes'::regclass, 'public.tipos_ticket'::regclass)),
g7 as (select jsonb_object_agg(coalesce(estado, '(null)'), n) v
         from (select estado, count(*) n from public.pedidos group by 1) x),
g8 as (select jsonb_object_agg(u, n) v
         from (select coalesce(nullif(btrim(universidad), ''), '(vacío)') u, count(*) n
                 from public.clientes group by 1 order by 2 desc limit 25) x),
g9 as (select jsonb_build_object(
          'ruts_repetidos', (select count(*) from (select public.rut_limpio(rut) from public.clientes
                              where public.rut_limpio(rut) <> '' group by 1 having count(*) > 1) x),
          'auth_sin_ficha', (select count(*) from auth.users u where not exists (select 1 from public.clientes c where c.id = u.id)),
          'filas_clientes', (select count(*) from public.clientes),
          'filas_pedidos', (select count(*) from public.pedidos),
          'existe_reservas_miembros', to_regclass('public.reservas_miembros') is not null,
          'existe_clientes_sexo', exists (select 1 from information_schema.columns
                                          where table_schema = 'public' and table_name = 'clientes' and column_name = 'sexo')) v)
select 'G1 triggers' seccion, v from g1
union all select 'G2 funciones clave', v from g2
union all select 'G3 helpers admin/rol', v from g3
union all select 'G4 columnas', v from g4
union all select 'G5 politicas', v from g5
union all select 'G6 constraints', v from g6
union all select 'G7 estados pedidos', v from g7
union all select 'G8 universidades', v from g8
union all select 'G9 conteos', v from g9;
