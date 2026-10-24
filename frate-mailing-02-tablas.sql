-- FRATE · MAILING · tablas + destinatarios (crea SOLO objetos nuevos; no toca tablas existentes)
-- Proyecto WEB · SQL Editor · correr completo. Solo el servidor (send-campana) las lee.
-- Reversa: drop function if exists public.campana_resumen(text,integer,boolean), public.campana_destinatarios(text,integer,integer,boolean), public.campana_base(text,integer,boolean);
--          drop table if exists public.campana_envios, public.campanas, public.correo_bajas;
set lock_timeout = '5s';

create table if not exists public.campanas (
  id text primary key, config jsonb not null default '{}'::jsonb,
  tanda_hasta timestamptz,                             -- candado: una sola tanda a la vez por campaña
  creada_at timestamptz not null default now(), actualizada_at timestamptz not null default now(), actualizada_por uuid
);
create table if not exists public.campana_envios (
  id bigint generated always as identity primary key,
  campana text not null, email text not null, cliente_id uuid,
  estado text not null default 'enviando',             -- enviando · enviado · error
  intentos integer not null default 1,                 -- un error se reintenta hasta 3 veces
  resend_id text, error text, creado_at timestamptz not null default now(), enviado_at timestamptz,
  unique (campana, email)
);
create table if not exists public.correo_bajas (email text primary key, origen text, created_at timestamptz not null default now());
-- Si ya se había corrido la PRIMERA versión de este archivo, las tablas existen sin estas
-- columnas y «create table if not exists» no las agrega: se agregan acá (no borra nada).
alter table public.campanas add column if not exists tanda_hasta timestamptz;
alter table public.campana_envios add column if not exists intentos integer not null default 1;
-- Funciones de la primera versión (otra firma): se reemplazan por las de abajo.
drop function if exists public.campana_resumen(text, boolean);
drop function if exists public.campana_destinatarios(text, integer, boolean);
drop function if exists public.campana_base(text, boolean);
alter table public.campanas enable row level security;
alter table public.campana_envios enable row level security;
alter table public.correo_bajas enable row level security;
revoke all on public.campanas, public.campana_envios, public.correo_bajas from anon, authenticated;

-- Le toca a: correo válido, no staff, sin rebote/queja, sin baja, no baneado, sin envío logrado (ni en
-- curso <5 min, ni 3 errores) en esta campaña; opcional: sin reserva de miembro en un evento y sin sexo X.
create or replace function public.campana_base(p_campana text, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns table (cliente_id uuid, email text, nombre text, creado timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select distinct on (lower(btrim(c.email))) c.id, lower(btrim(c.email)) as email,
           split_part(btrim(coalesce(c.nombres, '')), ' ', 1) as nombre, c.rut, c.sexo, c.created_at
      from clientes c
     where lower(btrim(coalesce(c.email, ''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
       and coalesce(c.rol, 'usuario') in ('usuario', 'cliente')
     order by lower(btrim(c.email)), c.created_at
  )
  select b.id, b.email, b.nombre, b.created_at from b
   where not exists (select 1 from email_rebotes r where lower(btrim(r.email)) = b.email and r.tipo in ('email.bounced', 'email.complained'))
     and not exists (select 1 from correo_bajas x where x.email = b.email)
     and not exists (select 1 from baneados z where coalesce(z.activo, true) and rut_limpio(b.rut) <> '' and rut_limpio(z.rut) = rut_limpio(b.rut))
     and not exists (select 1 from campana_envios e where e.campana = p_campana and e.email = b.email
                      and (e.estado = 'enviado' or (e.estado = 'enviando' and e.creado_at > now() - interval '5 minutes')
                           or (e.estado = 'error' and e.intentos >= 3)))
     and not (p_excluir_evento is not null and exists (select 1 from reservas_miembros rm
               where rm.cliente_id = b.id and rm.liberada_at is null and rm.evento_id = p_excluir_evento))
     and not (coalesce(p_excluir_x, true) and coalesce(b.sexo, '') = 'X')
$$;

create or replace function public.campana_destinatarios(p_campana text, p_limite integer, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns table (cliente_id uuid, email text, nombre text)
language sql stable security definer set search_path = public as $$
  select cliente_id, email, nombre from campana_base(p_campana, p_excluir_evento, p_excluir_x)
   order by creado limit greatest(1, least(coalesce(p_limite, 40), 100))
$$;

create or replace function public.campana_resumen(p_campana text, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pendientes',  (select count(*) from campana_base(p_campana, p_excluir_evento, p_excluir_x)),
    'enviados',    (select count(*) from campana_envios where campana = p_campana and estado = 'enviado'),
    'errores',     (select count(*) from campana_envios where campana = p_campana and estado = 'error'),
    'sin_remedio', (select count(*) from campana_envios where campana = p_campana and estado = 'error' and intentos >= 3),
    'en_curso',    (select count(*) from campana_envios where campana = p_campana and estado = 'enviando'),
    'bajas',       (select count(*) from correo_bajas))
$$;

revoke all on function public.campana_base(text, integer, boolean), public.campana_destinatarios(text, integer, integer, boolean),
                       public.campana_resumen(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.campana_base(text, integer, boolean), public.campana_destinatarios(text, integer, integer, boolean),
                          public.campana_resumen(text, integer, boolean) to service_role;
notify pgrst, 'reload schema';

select to_regclass('public.campanas') is not null as campanas, to_regclass('public.campana_envios') is not null as envios,
       to_regclass('public.correo_bajas') is not null as bajas, public.campana_resumen('primera-patita-16sep', 42, true) as resumen;
