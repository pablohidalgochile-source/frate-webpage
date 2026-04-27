-- ============================================================
-- FRATE — Schema completo Supabase
-- Ejecutar en: supabase.com → tu proyecto → SQL Editor → New query
-- ============================================================

-- ── 1. CLIENTES (perfil vinculado a auth.users) ──────────────
create table if not exists clientes (
  id          uuid references auth.users on delete cascade primary key,
  nombres     text,
  apellidos   text,
  email       text,
  telefono    text,
  rut         text,
  universidad text,
  carrera     text,
  created_at  timestamptz default now()
);
alter table clientes enable row level security;
create policy "cliente_select_own" on clientes for select using (auth.uid() = id);
create policy "cliente_insert_own" on clientes for insert with check (auth.uid() = id);
create policy "cliente_update_own" on clientes for update using (auth.uid() = id);

-- ── 2. EVENTOS ───────────────────────────────────────────────
create table if not exists eventos (
  id               serial primary key,
  nombre           text    not null,
  fecha            date    not null,
  hora             text    default '23:00',
  ambiente         text,
  descripcion      text,
  djs              text[]  default '{}',
  imagen_url       text,
  precio_anticipada integer default 0,
  precio_general   integer default 0,
  activo           boolean default true,
  created_at       timestamptz default now()
);
alter table eventos enable row level security;
create policy "eventos_public_read" on eventos for select using (true);
create policy "eventos_admin_all"   on eventos using (auth.jwt() ->> 'role' = 'admin');

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
create policy "tickets_public_read" on tipos_ticket for select using (true);
create policy "tickets_admin_all"   on tipos_ticket using (auth.jwt() ->> 'role' = 'admin');

-- ── 4. PEDIDOS ───────────────────────────────────────────────
create table if not exists pedidos (
  id               serial primary key,
  cliente_id       uuid references clientes(id),
  nombre_cliente   text,
  email_cliente    text,
  estado           text    default 'pendiente',  -- pendiente | pagado | cancelado
  total            integer not null,
  metodo_pago      text,
  referencia_pago  text,
  created_at       timestamptz default now()
);
alter table pedidos enable row level security;
create policy "pedidos_select_own" on pedidos for select using (auth.uid() = cliente_id);
create policy "pedidos_insert_own" on pedidos for insert with check (auth.uid() = cliente_id);
create policy "pedidos_admin_all"  on pedidos using (auth.jwt() ->> 'role' = 'admin');

-- ── 5. ITEMS DE PEDIDO ───────────────────────────────────────
create table if not exists items_pedido (
  id               serial primary key,
  pedido_id        integer references pedidos(id) on delete cascade,
  evento_id        integer references eventos(id),
  tipo_ticket_id   integer references tipos_ticket(id),
  nombre_evento    text,
  nombre_ticket    text,
  cantidad         integer not null,
  precio_unitario  integer not null,
  nombre_asistente text,
  rut_asistente    text,
  created_at       timestamptz default now()
);
alter table items_pedido enable row level security;
create policy "items_select_own" on items_pedido for select
  using (exists (select 1 from pedidos p where p.id = pedido_id and p.cliente_id = auth.uid()));
create policy "items_insert_own" on items_pedido for insert
  with check (exists (select 1 from pedidos p where p.id = pedido_id and p.cliente_id = auth.uid()));

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
  estado      text default 'pendiente',  -- pendiente | confirmada | cancelada
  created_at  timestamptz default now()
);
alter table reservas enable row level security;
create policy "reservas_select_own" on reservas for select using (auth.uid() = cliente_id);
create policy "reservas_insert_any" on reservas for insert with check (true);
create policy "reservas_admin_all"  on reservas using (auth.jwt() ->> 'role' = 'admin');

-- ── 7. DESHABILITAR confirmación de email (para pruebas) ─────
-- supabase.com → Authentication → Providers → Email
-- Desactivar "Confirm email" para que el registro sea inmediato

-- ── DATOS DE EJEMPLO — puedes borrar esto después ────────────
insert into eventos (nombre, fecha, hora, ambiente, descripcion, djs, precio_anticipada, precio_general) values
  ('TRAP JUEVES',    '2026-05-01', '23:00', 'Fuego', 'La noche de trap más esperada del mes.', array['DJ Frate','MC Urban'], 3000, 5000),
  ('REGGAETON VIERNES', '2026-05-02', '23:00', 'Fuego', 'El mejor reggaeton en vivo.', array['DJ Campus','La Fiera'], 4000, 6000),
  ('NOCHE UNIVERSITARIA', '2026-05-09', '23:00', 'Aire', 'Solo con credencial universitaria.', array['DJ Mix','Selecta Pro'], 3500, 5500),
  ('SÁBADO PREMIUM', '2026-05-10', '23:00', 'Fuego', 'La noche grande de la semana.', array['DJ Frate','DJ Campus','La Fiera'], 6000, 8000);

insert into tipos_ticket (evento_id, nombre, descripcion, precio, disponible, estado, solo_web, max_por_compra) values
  (1,'Pre-Venta MUJER','Solo mujeres. Presenta C.I.',3000,80,'Activo',true,4),
  (1,'Pre-Venta HOMBRE UNIV.','Universitarios con credencial.',4000,50,'Activo',true,4),
  (1,'General','Sin restricción.',5000,100,'Activo',true,6),
  (2,'Pre-Venta MUJER','Solo mujeres.',4000,100,'Activo',true,4),
  (2,'Pre-Venta HOMBRE UNIV.','Universitarios.',5000,50,'Activo',true,4),
  (2,'General','Entrada general.',6000,200,'Activo',true,10),
  (3,'Universitaria MUJER','Con credencial vigente.',3500,80,'Activo',true,4),
  (3,'Universitaria HOMBRE','Con credencial vigente.',4000,60,'Activo',true,4),
  (4,'Anticipada',   'Precio especial anticipado.',6000,80,'Activo',true,6),
  (4,'General',      'Entrada general.',8000,200,'Activo',true,10);
