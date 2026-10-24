-- FRATE · PASO 4 (de nuevo) · crea la tabla del candado Y verifica todo
-- Proyecto WEB · SQL Editor · correr COMPLETO y copiar el resultado (3 filas: A, B y C)
-- Se puede correr más de una vez: si la tabla ya existe, no la toca.
set lock_timeout = '5s';

create table if not exists public.reservas_miembros (
  id             bigint generated always as identity primary key,
  tipo_ticket_id bigint      not null,
  cliente_id     uuid        not null,
  rut_norm       text        not null check (length(rut_norm) >= 6),  -- rut_limpio(rut) o 'X'+documento
  pedido_id      bigint      not null,
  evento_id      bigint,
  created_at     timestamptz not null default now(),
  liberada_at    timestamptz,          -- null = candado activo
  liberada_por   text,                 -- 'estado:cancelado', 'pedido borrado', ...
  conflicto_at   timestamptz           -- el pedido revivió y el cupo ya lo tenía otro
);

create unique index if not exists reservas_miembros_tt_cliente_uq
  on public.reservas_miembros (tipo_ticket_id, cliente_id) where liberada_at is null;
create unique index if not exists reservas_miembros_tt_rut_uq
  on public.reservas_miembros (tipo_ticket_id, rut_norm) where liberada_at is null;
create index if not exists reservas_miembros_pedido_idx on public.reservas_miembros (pedido_id);
create index if not exists reservas_miembros_cliente_idx on public.reservas_miembros (cliente_id);

alter table public.reservas_miembros enable row level security;
revoke all on public.reservas_miembros from anon, authenticated;

notify pgrst, 'reload schema';

select 'A objetos nuevos' as seccion, jsonb_build_object(
  'clientes_sexo',        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clientes' and column_name = 'sexo'),
  'trg_sexo_fijo',        exists (select 1 from pg_trigger where tgname = 'trg_sexo_fijo'),
  'tabla_reservas',       to_regclass('public.reservas_miembros') is not null,
  'service_role_inserta', case when to_regclass('public.reservas_miembros') is null then null
                               else has_table_privilege('service_role', 'public.reservas_miembros', 'INSERT') end,
  'trg_liberar_pedidos',  (select count(*) from pg_trigger where tgname like 'trg_reservas_miembros%'),
  'trg_rut_fijo',         exists (select 1 from pg_trigger where tgname = 'trg_rut_fijo_miembros'),
  'asistente_candado',    position('no se puede regalar' in pg_get_functiondef('public.editar_asistente'::regproc)) > 0,
  'filas_candado',        case when to_regclass('public.reservas_miembros') is null then null
                               else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.reservas_miembros', false, true, '')))[1]::text end
) as v
union all
select 'B tickets del evento 42', (select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'genero', genero, 'estado', estado,
         'disponible', disponible, 'solo_miembros', solo_miembros) order by id) from public.tipos_ticket where evento_id = 42)
union all
select 'C reservas de esos tickets', (select jsonb_agg(jsonb_build_object(
         'pedido', p.id, 'estado', p.estado, 'ticket', ip.tipo_ticket_id, 'creado', p.created_at,
         'cuenta', coalesce(c.nombres || ' ' || c.apellidos, '(sin cuenta)'), 'correo', coalesce(c.email, p.email_cliente),
         'rut_cuenta', public.rut_limpio(c.rut), 'rut_entrada', public.rut_limpio(coalesce(ip.personas -> 0 ->> 'rut', ip.rut_asistente)),
         'nombre_entrada', ip.personas -> 0 ->> 'nombre') order by p.created_at)
    from public.items_pedido ip join public.pedidos p on p.id = ip.pedido_id
    left join public.clientes c on c.id = p.cliente_id
   where ip.tipo_ticket_id in (select id from public.tipos_ticket where evento_id = 42));
