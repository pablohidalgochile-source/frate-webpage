-- 🎰 CONCURSOS ADMINISTRABLES · parte 1 de 2 · tablas
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- LA IDEA: un concurso es una FICHA que arma Pablo, no código. Sus reglas,
-- sus premios con stock, quién puede jugar y cuándo vencen los códigos.
-- La ruleta, el raspe y la trivia son solo la FORMA de jugar; lo que se
-- reparte se define acá.
--
-- ⛔ NUNCA reparte crédito FRATE. La lealtad está congelada por orden de
--    Pablo: estos concursos entregan CÓDIGOS DE PREMIO (premios_link), que
--    es un sistema aparte y no toca puntos ni rangos.

create table if not exists public.concursos (
  id             bigserial primary key,
  nombre         text not null,
  activo         boolean not null default false,
  desde          timestamptz,
  hasta          timestamptz,
  juego          text not null default 'ruleta'
                 check (juego in ('ruleta','raspe','trivia')),
  -- a quién se le permite jugar
  quien_puede    text not null default 'todos'
                 check (quien_puede in ('todos','sin_red','compradores','una_sola_compra')),
  giros_por_persona int not null default 1,
  pide_red       boolean not null default true,   -- exige instagram/tiktok antes de girar
  vence_dias     int not null default 7,          -- cuánto dura el código que gana
  evento_id      int references public.eventos(id) on delete set null,
  creado_por     uuid references public.clientes(id),
  created_at     timestamptz not null default now()
);

-- Los premios del bolsón. `para_todos` = el consuelo que siempre sale.
-- `stock` null = infinito. `probabilidad` solo aplica a los limitados.
create table if not exists public.concurso_premios (
  id             bigserial primary key,
  concurso_id    bigint not null references public.concursos(id) on delete cascade,
  tipo           text not null check (tipo in ('entrada','cover','descuento','consumo')),
  detalle        text,
  valor          int,
  stock          int,                              -- null = sin tope
  entregados     int not null default 0,
  probabilidad   int not null default 0            -- 0-100, ignorado si para_todos
                 check (probabilidad between 0 and 100),
  para_todos     boolean not null default false,
  orden          int not null default 0
);

-- Un giro por persona y por concurso (o los que permita la ficha).
create table if not exists public.concurso_giros (
  id             bigserial primary key,
  concurso_id    bigint not null references public.concursos(id) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  premio_id      bigint references public.concurso_premios(id) on delete set null,
  codigo         text,                             -- el premios_link que se generó
  created_at     timestamptz not null default now()
);

create index if not exists concurso_giros_idx on public.concurso_giros (concurso_id, cliente_id);
create index if not exists concurso_premios_idx on public.concurso_premios (concurso_id, orden);


-- ── Permisos ──────────────────────────────────────────────────────
alter table public.concursos        enable row level security;
alter table public.concurso_premios enable row level security;
alter table public.concurso_giros   enable row level security;

-- El admin arma y mira todo.
drop policy if exists concursos_admin on public.concursos;
create policy concursos_admin on public.concursos for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

drop policy if exists concurso_premios_admin on public.concurso_premios;
create policy concurso_premios_admin on public.concurso_premios for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

-- Cada persona ve SUS giros, nada más.
drop policy if exists concurso_giros_mios on public.concurso_giros;
create policy concurso_giros_mios on public.concurso_giros for select
  using (cliente_id = auth.uid()
         or exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));


-- ── Chequeo ───────────────────────────────────────────────────────
select 'concursos' as tabla, count(*) as filas from public.concursos
union all select 'concurso_premios', count(*) from public.concurso_premios
union all select 'concurso_giros',   count(*) from public.concurso_giros;
