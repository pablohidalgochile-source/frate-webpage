-- ============================================================
-- FRATE — Schema completo v2 (compatible con proyecto existente)
-- Ejecutar en: SQL Editor → New query → Run
-- ============================================================

-- ── LIMPIAR POLÍTICAS EXISTENTES ─────────────────────────────
drop policy if exists "cliente_select_own" on clientes;
drop policy if exists "cliente_insert_own" on clientes;
drop policy if exists "cliente_update_own" on clientes;
drop policy if exists "own"               on clientes;

-- ── 1. CLIENTES — agregar columnas nuevas si no existen ──────
alter table clientes add column if not exists nombres     text;
alter table clientes add column if not exists apellidos   text;
alter table clientes add column if not exists username    text;
alter table clientes add column if not exists rol         text default 'usuario';
alter table clientes add column if not exists universidad text;
alter table clientes add column if not exists carrera     text;
alter table clientes add column if not exists telefono    text;
alter table clientes add column if not exists rut         text;
alter table clientes add column if not exists email       text;

-- Índice único en username
create unique index if not exists clientes_username_idx on clientes (username)
  where username is not null and username <> '';

-- ── POLÍTICAS ADMIN (acceso total para usuarios con rol='admin') ──
-- Clientes: admin ve todos
drop policy if exists "admin_clientes_all" on clientes;
create policy "admin_clientes_all" on clientes for all
  using (exists (select 1 from clientes c2 where c2.id = auth.uid() and c2.rol = 'admin'));

-- Pedidos: admin ve todos
drop policy if exists "admin_pedidos_all" on pedidos;
create policy "admin_pedidos_all" on pedidos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Items pedido: admin ve todos
drop policy if exists "admin_items_all" on items_pedido;
create policy "admin_items_all" on items_pedido for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Reservas: admin ve todas
drop policy if exists "admin_reservas_all" on reservas;
create policy "admin_reservas_all" on reservas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Eventos: admin puede crear/editar/eliminar
drop policy if exists "admin_eventos_all" on eventos;
create policy "admin_eventos_all" on eventos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Tipos de ticket: admin CRUD
drop policy if exists "admin_tickets_all" on tipos_ticket;
create policy "admin_tickets_all" on tipos_ticket for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

alter table clientes enable row level security;
create policy "cliente_select_own" on clientes for select using (auth.uid() = id);
create policy "cliente_insert_own" on clientes for insert with check (auth.uid() = id);
create policy "cliente_update_own" on clientes for update using (auth.uid() = id);

-- ── 2. EVENTOS ───────────────────────────────────────────────
create table if not exists eventos (
  id                serial primary key,
  nombre            text    not null,
  fecha             date    not null,
  hora              text    default '23:00',
  ambiente          text,
  descripcion       text,
  djs               text[]  default '{}',
  imagen_url        text,
  precio_anticipada integer default 0,
  precio_general    integer default 0,
  activo            boolean default true,
  created_at        timestamptz default now()
);
alter table eventos enable row level security;
drop policy if exists "eventos_public_read" on eventos;
create policy "eventos_public_read" on eventos for select using (true);

-- ── 3. TIPOS DE TICKET ───────────────────────────────────────
create table if not exists tipos_ticket (
  id             serial primary key,
  evento_id      integer references eventos(id) on delete cascade,
  nombre         text    not null,
  descripcion    text,
  precio         integer not null,
  disponible     integer default 100,
  estado         text    default 'Activo',
  solo_web       boolean default true,
  max_por_compra integer default 6,
  created_at     timestamptz default now()
);
alter table tipos_ticket enable row level security;
drop policy if exists "tickets_public_read" on tipos_ticket;
create policy "tickets_public_read" on tipos_ticket for select using (true);

-- ── 4. PEDIDOS ───────────────────────────────────────────────
create table if not exists pedidos (
  id               serial primary key,
  cliente_id       uuid references clientes(id),
  nombre_cliente   text,
  email_cliente    text,
  estado           text    default 'pendiente',
  total            integer not null,
  metodo_pago      text,
  referencia_pago  text,
  created_at       timestamptz default now()
);
alter table pedidos enable row level security;
drop policy if exists "pedidos_select_own" on pedidos;
drop policy if exists "pedidos_insert_own" on pedidos;
create policy "pedidos_select_own" on pedidos for select using (auth.uid() = cliente_id);
create policy "pedidos_insert_own" on pedidos for insert with check (true);

-- ── 5. ITEMS DE PEDIDO ───────────────────────────────────────
create table if not exists items_pedido (
  id                serial primary key,
  pedido_id         integer references pedidos(id) on delete cascade,
  evento_id         integer references eventos(id),
  tipo_ticket_id    integer references tipos_ticket(id),
  nombre_evento     text,
  nombre_ticket     text,
  cantidad          integer not null,
  precio_unitario   integer not null,
  nombre_asistente  text,
  rut_asistente     text,
  created_at        timestamptz default now()
);
alter table items_pedido enable row level security;
drop policy if exists "items_select_own" on items_pedido;
drop policy if exists "items_insert_own" on items_pedido;
create policy "items_select_own" on items_pedido for select using (true);
create policy "items_insert_own" on items_pedido for insert with check (true);

-- ── 6. RESERVAS ──────────────────────────────────────────────
create table if not exists reservas (
  id          serial primary key,
  cliente_id  uuid references clientes(id),
  nombre      text,
  email       text,
  telefono    text,
  fecha       date,
  tipo        text,
  personas    integer,
  mensaje     text,
  estado      text default 'pendiente',
  created_at  timestamptz default now()
);
alter table reservas enable row level security;
drop policy if exists "reservas_insert_any" on reservas;
drop policy if exists "reservas_select_own" on reservas;
create policy "reservas_insert_any" on reservas for insert with check (true);
create policy "reservas_select_own" on reservas for select using (auth.uid() = cliente_id);

-- ── 7. DATOS DE EJEMPLO (solo si la tabla está vacía) ────────
insert into eventos (nombre, fecha, hora, ambiente, descripcion, djs, precio_anticipada, precio_general)
select * from (values
  ('TRAP JUEVES',         '2026-05-01'::date,'23:00','Fuego','La noche de trap más esperada.',array['DJ Frate','MC Urban'],3000,5000),
  ('REGGAETON VIERNES',   '2026-05-02'::date,'23:00','Fuego','El mejor reggaeton en vivo.',array['DJ Campus','La Fiera'],4000,6000),
  ('NOCHE UNIVERSITARIA', '2026-05-09'::date,'23:00','Aire','Solo con credencial.',array['DJ Mix','Selecta Pro'],3500,5500),
  ('SÁBADO PREMIUM',      '2026-05-10'::date,'23:00','Fuego','La noche grande de la semana.',array['DJ Frate','DJ Campus'],6000,8000)
) as v(nombre,fecha,hora,ambiente,descripcion,djs,precio_anticipada,precio_general)
where not exists (select 1 from eventos limit 1);

insert into tipos_ticket (evento_id,nombre,descripcion,precio,disponible,estado,solo_web,max_por_compra)
select * from (values
  (1,'Pre-Venta MUJER','Solo mujeres. Presenta C.I.',3000,80,'Activo',true,4),
  (1,'Pre-Venta HOMBRE UNIV.','Universitarios con credencial.',4000,50,'Activo',true,4),
  (1,'General','Sin restricción.',5000,100,'Activo',true,6),
  (2,'Pre-Venta MUJER','Solo mujeres.',4000,100,'Activo',true,4),
  (2,'Pre-Venta HOMBRE UNIV.','Universitarios.',5000,50,'Activo',true,4),
  (2,'General','Entrada general.',6000,200,'Activo',true,10),
  (3,'Universitaria MUJER','Con credencial vigente.',3500,80,'Activo',true,4),
  (3,'Universitaria HOMBRE','Con credencial vigente.',4000,60,'Activo',true,4),
  (4,'Anticipada','Precio especial anticipado.',6000,80,'Activo',true,6),
  (4,'General','Entrada general.',8000,200,'Activo',true,10)
) as v(evento_id,nombre,descripcion,precio,disponible,estado,solo_web,max_por_compra)
where not exists (select 1 from tipos_ticket limit 1);
