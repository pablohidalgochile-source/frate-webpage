-- 🎁 PREMIOS POR INSTAGRAM Y FRATV · PARTE 1 de 2 — la tabla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- PARA QUÉ:
--   Regalas algo por DM de Instagram o en vivo por FRATV. Hoy eso termina
--   en un mensaje suelto: la persona no queda registrada, no sabes si lo
--   usó, y en la puerta hay que creerle.
--
--   Con esto generas un LINK. La persona lo abre, se registra o entra con
--   su cuenta, y el premio queda pegado a ELLA. Ganas dos cosas: la
--   persona entra a tu base de datos, y el premio queda con dueño y con
--   fecha de vencimiento.
--
-- LO QUE SE PUEDE REGALAR (Pablo, 2026-08-11):
--   entrada · cover · descuento · consumo
--
-- ⚠️ SE LLAMA `premios_link` Y NO `premios` A PROPÓSITO:
--    `premios` ya existe y es OTRA COSA — es el catálogo de canje por
--    puntos del programa de lealtad (costo_puntos, activo, orden), y está
--    en uso vivo en frate.cl y en el admin. Usar ese nombre habría chocado
--    con algo que ya funciona.
--
-- ⚠️ El premio NO se aplica solo en el checkout. Igual que el crédito,
--    se pregunta primero. Acá solo queda registrado a nombre de alguien.

create table if not exists public.premios_link (
  id            bigserial primary key,
  codigo        text unique not null,
  tipo          text not null check (tipo in ('entrada','cover','descuento','consumo')),
  detalle       text,                    -- «2x1 en piscola», «$5.000 de consumo»
  valor         int,                     -- % si es descuento, $ si es consumo
  evento_id     int  references public.eventos(id) on delete set null,
  origen        text default 'instagram' check (origen in ('instagram','fratv','otro')),
  nota          text,                    -- para ti: de qué sorteo salió
  vence_at      timestamptz,             -- null = mientras el evento exista
  usos_max      int  default 1,          -- casi siempre 1; sirve para códigos abiertos
  usos          int  default 0,
  creado_por    uuid references public.clientes(id),
  created_at    timestamptz not null default now()
);

create index if not exists premios_link_codigo_idx  on public.premios_link (upper(codigo));
create index if not exists premios_link_evento_idx  on public.premios_link (evento_id);

-- Quién lo reclamó. Tabla aparte porque un código abierto puede tener
-- varios dueños, y porque así queda el historial aunque borres el premio.
create table if not exists public.premios_link_canjes (
  id          bigserial primary key,
  premio_id   bigint not null references public.premios_link(id) on delete cascade,
  cliente_id  uuid   not null references public.clientes(id) on delete cascade,
  usado_at    timestamptz,               -- cuándo lo ocupó de verdad (puerta/barra)
  usado_por   uuid references public.clientes(id),
  created_at  timestamptz not null default now(),
  unique (premio_id, cliente_id)         -- nadie reclama dos veces el mismo
);

create index if not exists premios_link_canjes_cli on public.premios_link_canjes (cliente_id);

alter table public.premios_link        enable row level security;
alter table public.premios_link_canjes enable row level security;

-- El staff ve y administra todo.
drop policy if exists premios_link_staff on public.premios_link;
create policy premios_link_staff on public.premios_link for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp')));

drop policy if exists premios_link_canjes_staff on public.premios_link_canjes;
create policy premios_link_canjes_staff on public.premios_link_canjes for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp')));

-- Cada persona ve LO SUYO. Sin esto no podría ver su propio premio.
drop policy if exists premios_link_canjes_mio on public.premios_link_canjes;
create policy premios_link_canjes_mio on public.premios_link_canjes for select
  using (cliente_id = auth.uid());


-- ── Chequeo ────────────────────────────────────────────────────────
select 'premios_link'   as tabla, count(*) as filas from public.premios_link
union all
select 'premios_link_canjes', count(*) from public.premios_link_canjes;
