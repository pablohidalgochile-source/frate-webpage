-- FRATE · MAILING · PÚBLICO «SELECCIÓN» (1 de 2): tabla + destinatarios + resumen
-- Proyecto WEB · SQL Editor · aditivo: no toca las funciones de «todos los miembros».
-- Reversa: drop function if exists public.campana_resumen_sel(text,integer,boolean), public.campana_destinatarios_sel(text,integer,integer,boolean), public.campana_base_sel(text,integer,boolean);
--          drop table if exists public.campana_seleccion;
set lock_timeout = '5s';

create table if not exists public.campana_seleccion (
  campana text not null, email text not null, nombre text, rut text,
  cliente_id uuid,                -- con cuenta (Usuarios, o Persona que tiene cuenta)
  persona_id bigint,              -- vino desde Comunidad → Personas
  origen text not null default 'usuarios',
  agregada_at timestamptz not null default now(), agregada_por uuid,
  primary key (campana, email)
);
alter table public.campana_seleccion enable row level security;
revoke all on public.campana_seleccion from anon, authenticated;

-- Le toca a quien está en la selección, con correo válido, sin rebote/queja, sin baja, no baneado,
-- sin envío logrado en esta campaña; opcional: sin reserva de miembro en un evento y sin sexo X.
create or replace function public.campana_base_sel(p_campana text, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns table (cliente_id uuid, email text, nombre text, creado timestamptz)
language sql stable security definer set search_path = public as $$
  select s.cliente_id, s.email, split_part(btrim(coalesce(nullif(c.nombres, ''), s.nombre, '')), ' ', 1), s.agregada_at
    from campana_seleccion s
    left join clientes c on c.id = s.cliente_id
   where s.campana = p_campana
     and s.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
     and not exists (select 1 from email_rebotes r where lower(btrim(r.email)) = s.email and r.tipo in ('email.bounced', 'email.complained'))
     and not exists (select 1 from correo_bajas x where x.email = s.email)
     and not exists (select 1 from baneados z where coalesce(z.activo, true) and rut_limpio(z.rut) <> ''
                      and rut_limpio(z.rut) in (rut_limpio(c.rut), rut_limpio(s.rut)))   -- RUT de la cuenta o de la persona
     and not exists (select 1 from campana_envios e where e.campana = p_campana and e.email = s.email
                      and (e.estado = 'enviado' or (e.estado = 'enviando' and e.creado_at > now() - interval '5 minutes')
                           or (e.estado = 'error' and e.intentos >= 3)))
     and not (p_excluir_evento is not null and s.cliente_id is not null and exists (select 1 from reservas_miembros rm
               where rm.cliente_id = s.cliente_id and rm.liberada_at is null and rm.evento_id = p_excluir_evento))
     and not (coalesce(p_excluir_x, true) and coalesce(c.sexo, '') = 'X')
$$;

create or replace function public.campana_destinatarios_sel(p_campana text, p_limite integer, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns table (cliente_id uuid, email text, nombre text)
language sql stable security definer set search_path = public as $$
  select cliente_id, email, nombre from campana_base_sel(p_campana, p_excluir_evento, p_excluir_x)
   order by creado limit greatest(1, least(coalesce(p_limite, 40), 100))
$$;

create or replace function public.campana_resumen_sel(p_campana text, p_excluir_evento integer default null, p_excluir_x boolean default true)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pendientes',    (select count(*) from campana_base_sel(p_campana, p_excluir_evento, p_excluir_x)),
    'seleccionados', (select count(*) from campana_seleccion where campana = p_campana),
    'enviados',      (select count(*) from campana_envios where campana = p_campana and estado = 'enviado'),
    'errores',       (select count(*) from campana_envios where campana = p_campana and estado = 'error'),
    'sin_remedio',   (select count(*) from campana_envios where campana = p_campana and estado = 'error' and intentos >= 3),
    'en_curso',      (select count(*) from campana_envios where campana = p_campana and estado = 'enviando'),
    'bajas',         (select count(*) from correo_bajas))
$$;

revoke all on function public.campana_base_sel(text, integer, boolean), public.campana_destinatarios_sel(text, integer, integer, boolean),
                       public.campana_resumen_sel(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.campana_base_sel(text, integer, boolean), public.campana_destinatarios_sel(text, integer, integer, boolean),
                          public.campana_resumen_sel(text, integer, boolean) to service_role;
notify pgrst, 'reload schema';

select to_regclass('public.campana_seleccion') is not null as tabla_seleccion;
