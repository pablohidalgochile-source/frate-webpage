-- ============================================================
-- FRATE — CRM: puente web ↔ ERP (contrato ARQUITECTURA-CRM-WEB.md)
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

-- ── 1) RESERVAS: extensión por tipo + invitados[] + respuesta ERP ──
alter table public.reservas add column if not exists rut text;
alter table public.reservas add column if not exists email text;
alter table public.reservas add column if not exists instagram text;
alter table public.reservas add column if not exists evento_id integer references public.eventos(id) on delete set null;
alter table public.reservas add column if not exists zona_preferida text;
alter table public.reservas add column if not exists presupuesto integer;
alter table public.reservas add column if not exists consumo_minimo_ofrecido integer;
alter table public.reservas add column if not exists quiere_botellas boolean default false;
alter table public.reservas add column if not exists quiere_decoracion boolean default false;
alter table public.reservas add column if not exists quiere_mesa boolean default true;
alter table public.reservas add column if not exists fecha_nacimiento date;
alter table public.reservas add column if not exists comentario text;
alter table public.reservas add column if not exists invitados jsonb default '[]'::jsonb;
alter table public.reservas add column if not exists origen text default 'web_form';
alter table public.reservas add column if not exists mesa_nombre text;
alter table public.reservas add column if not exists mesa_zona text;
alter table public.reservas add column if not exists condiciones text;
alter table public.reservas add column if not exists nota_cliente text;
alter table public.reservas add column if not exists abono_requerido integer;
alter table public.reservas add column if not exists pagado_monto integer;
alter table public.reservas add column if not exists pagado_medio text;
alter table public.reservas add column if not exists motivo_rechazo text;
alter table public.reservas add column if not exists updated_at timestamptz default now();
-- (el estado 'rechazada' no requiere migración: la columna es text sin CHECK)

-- ── 2) LISTAS GRATUITAS ──────────────────────────────────────
create table if not exists public.listas (
  id             serial primary key,
  nombre         text not null,
  fecha          date not null,
  evento_id      integer references public.eventos(id) on delete set null,
  cupos          integer,
  valido_hasta   timestamptz,
  duenio_id      uuid references public.clientes(id) on delete set null,
  codigo         text,
  estado         text default 'pendiente',   -- pendiente | aprobada | rechazada | cerrada
  motivo_rechazo text,
  origen         text default 'web_form',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create table if not exists public.lista_inscritos (
  id                  serial primary key,
  lista_id            integer not null references public.listas(id) on delete cascade,
  nombre              text not null,
  rut                 text,
  telefono            text,
  email               text,
  instagram           text,
  acompanantes        integer default 0,
  comentario          text,
  estado              text default 'pendiente',   -- pendiente | aprobado | rechazado
  pedido_cortesia_id  integer references public.pedidos(id) on delete set null,
  qr_ids              jsonb,
  motivo_rechazo      text,
  origen              text default 'web_form',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists lista_inscritos_lista_idx on public.lista_inscritos (lista_id);

-- ── 3) INVITACIONES RRPP ─────────────────────────────────────
create table if not exists public.invitaciones_rrpp (
  id                  serial primary key,
  codigo_id           integer references public.codigos(id) on delete set null,
  codigo              text,
  duenio_id           uuid references public.clientes(id) on delete set null,
  evento_id           integer references public.eventos(id) on delete set null,
  fecha               date not null,
  nombre              text not null,
  rut                 text,
  telefono            text,
  email               text,
  instagram           text,
  personas            integer default 1,
  estado              text default 'pendiente',   -- pendiente | aprobado | rechazado
  pedido_cortesia_id  integer references public.pedidos(id) on delete set null,
  qr_ids              jsonb,
  motivo_rechazo      text,
  origen              text default 'web_form',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists invitaciones_rrpp_duenio_idx on public.invitaciones_rrpp (duenio_id);

-- ── 4) RLS: escritura solo vía edge functions (service role);
--          lectura: admin todo, RRPP lo suyo, público listas aprobadas ──
alter table public.listas enable row level security;
alter table public.lista_inscritos enable row level security;
alter table public.invitaciones_rrpp enable row level security;

drop policy if exists "listas_admin_all" on public.listas;
create policy "listas_admin_all" on public.listas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));
drop policy if exists "listas_rrpp_read" on public.listas;
create policy "listas_rrpp_read" on public.listas for select using (duenio_id = auth.uid());
drop policy if exists "listas_publico_aprobadas" on public.listas;
create policy "listas_publico_aprobadas" on public.listas for select using (estado = 'aprobada');

drop policy if exists "inscritos_admin_all" on public.lista_inscritos;
create policy "inscritos_admin_all" on public.lista_inscritos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));
drop policy if exists "inscritos_rrpp_read" on public.lista_inscritos;
create policy "inscritos_rrpp_read" on public.lista_inscritos for select
  using (exists (select 1 from listas l where l.id = lista_id and l.duenio_id = auth.uid()));

drop policy if exists "invrrpp_admin_all" on public.invitaciones_rrpp;
create policy "invrrpp_admin_all" on public.invitaciones_rrpp for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));
drop policy if exists "invrrpp_rrpp_read" on public.invitaciones_rrpp;
create policy "invrrpp_rrpp_read" on public.invitaciones_rrpp for select using (duenio_id = auth.uid());

-- ── 5) COLA DE WEBHOOKS AL ERP ───────────────────────────────
create table if not exists public.crm_webhooks_pendientes (
  id              bigserial primary key,
  payload         jsonb not null,
  intentos        integer default 0,
  ultimo_error    text,
  estado          text default 'pendiente',   -- pendiente | enviado | fallido
  proximo_intento timestamptz default now(),
  created_at      timestamptz default now()
);
alter table public.crm_webhooks_pendientes enable row level security;
drop policy if exists "cola_admin_read" on public.crm_webhooks_pendientes;
create policy "cola_admin_read" on public.crm_webhooks_pendientes for select
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- ── 6) CRON: drenar la cola cada 5 minutos ───────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('frate-crm-reintentos'); exception when others then null; end $$;
select cron.schedule(
  'frate-crm-reintentos', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/crm-reintentos',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);

-- ── 7) PRENDER la sección Reservas de la web (confirmado) ────
update public.config_sitio set visible = true where clave = 'reservas';

-- ── 8) Verificación ──────────────────────────────────────────
select 'reservas.invitados' as check, case when exists(select 1 from information_schema.columns where table_name='reservas' and column_name='invitados') then 'OK' else 'FALTA' end
union all select 'tabla listas', case when exists(select 1 from pg_tables where tablename='listas') then 'OK' else 'FALTA' end
union all select 'tabla lista_inscritos', case when exists(select 1 from pg_tables where tablename='lista_inscritos') then 'OK' else 'FALTA' end
union all select 'tabla invitaciones_rrpp', case when exists(select 1 from pg_tables where tablename='invitaciones_rrpp') then 'OK' else 'FALTA' end
union all select 'cola webhooks', case when exists(select 1 from pg_tables where tablename='crm_webhooks_pendientes') then 'OK' else 'FALTA' end
union all select 'cron 5 min', case when exists(select 1 from cron.job where jobname='frate-crm-reintentos') then 'OK' else 'FALTA' end
union all select 'sección reservas ON', (select visible::text from config_sitio where clave='reservas');

-- ============================================================
-- LISTO. Falta 1 paso manual del dueño: instalar la llave nueva
--   CRM_WEBHOOK_KEY (Supabase web) = ERP_API_KEY (Vercel ERP)
-- ============================================================
