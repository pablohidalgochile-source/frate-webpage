-- ============================================================
-- FRATE LINK — Fase 0: extiende public.* (NO crea esquema frate).
-- Reusa listas + lista_inscritos + personas + cortesías + /validacion.
-- Solo suma columnas/tablas nuevas. Idempotente. Correr en WEB (ydwlpra…).
-- ============================================================

-- ── LISTAS: config del link ─────────────────────────────────
alter table public.listas add column if not exists tipo text default 'guest_list';        -- guest_list|birthday|reservation|artist|production
alter table public.listas add column if not exists form_config jsonb;                      -- {rut:'opcional',email:'opcional',...}
alter table public.listas add column if not exists inviter_nombre text;                     -- "quién invita"
alter table public.listas add column if not exists requires_manual_approval boolean default true;
alter table public.listas add column if not exists allow_incomplete_data boolean default false;
alter table public.listas add column if not exists allow_space_selection boolean default false;
alter table public.listas add column if not exists floorplan_id int;
alter table public.listas add column if not exists closes_at timestamptz;
alter table public.listas add column if not exists cover_amount int default 0;
alter table public.listas add column if not exists monto_servicio int default 0;
alter table public.listas add column if not exists categoria text;
alter table public.listas add column if not exists benefit_text text;

-- ── LISTA_INSCRITOS: campos por tipo + calidad + espacio ────
alter table public.lista_inscritos add column if not exists apodo text;
alter table public.lista_inscritos add column if not exists rol text;
alter table public.lista_inscritos add column if not exists productor text;
alter table public.lista_inscritos add column if not exists nacionalidad text;
alter table public.lista_inscritos add column if not exists espacio_id text;
alter table public.lista_inscritos add column if not exists espacio_nombre text;
alter table public.lista_inscritos add column if not exists calidad_dato text;             -- completa|parcial|minima
alter table public.lista_inscritos add column if not exists tipo_acceso text;

-- ── CATÁLOGO de tipos de link (con presets) ─────────────────
create table if not exists public.link_tipos (
  id bigserial primary key,
  tipo text unique not null,
  nombre text not null,
  emoji text,
  form_config jsonb,
  requires_manual_approval boolean default true,
  allow_incomplete_data boolean default false,
  allow_space_selection boolean default false,
  orden int default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
insert into public.link_tipos (tipo,nombre,emoji,form_config,allow_incomplete_data,allow_space_selection,orden) values
 ('guest_list','Lista','🎫', '{"rut":"opcional","email":"opcional","telefono":"oculto","instagram":"oculto","apodo":"oculto","rol":"oculto","productor":"oculto","nacionalidad":"oculto"}'::jsonb, false, false, 1),
 ('birthday','Cumpleaños','🎂', '{"rut":"opcional","email":"opcional","telefono":"obligatorio","instagram":"opcional","apodo":"oculto","rol":"oculto","productor":"oculto","nacionalidad":"oculto"}'::jsonb, false, true, 2),
 ('reservation','Reserva','🍾', '{"rut":"opcional","email":"opcional","telefono":"obligatorio","instagram":"opcional","apodo":"oculto","rol":"oculto","productor":"oculto","nacionalidad":"oculto"}'::jsonb, false, true, 3),
 ('artist','Artista','🎤', '{"rut":"opcional","email":"oculto","telefono":"opcional","instagram":"opcional","apodo":"obligatorio","rol":"obligatorio","productor":"oculto","nacionalidad":"opcional"}'::jsonb, true, false, 4),
 ('production','Producción','🎬', '{"rut":"opcional","email":"oculto","telefono":"opcional","instagram":"oculto","apodo":"opcional","rol":"obligatorio","productor":"obligatorio","nacionalidad":"oculto"}'::jsonb, true, false, 5)
on conflict (tipo) do nothing;
alter table public.link_tipos enable row level security;
drop policy if exists "link_tipos_read" on public.link_tipos;
create policy "link_tipos_read" on public.link_tipos for select using (true);

-- ── FICHAS especializadas: cumpleaños y reserva ─────────────
create table if not exists public.birthday_requests (
  id bigserial primary key, lista_id bigint references public.listas(id) on delete cascade,
  cumpleaniero text, fecha_cumple date, telefono text, instagram text,
  invitados_estimados int, cover_cumple int, cover_invitados int,
  quiere_decoracion boolean, notas_decoracion text, quiere_botellas boolean, notas_botellas text,
  presupuesto text, quiere_mesa boolean, zona_preferida text,
  coordination_status text default 'nuevo', created_at timestamptz default now()
);
create table if not exists public.reservation_requests (
  id bigserial primary key, lista_id bigint references public.listas(id) on delete cascade,
  responsable text, party_size int, zona text, consumo_minimo int, abono int,
  quiere_botellas boolean, notas_botellas text, presupuesto text,
  coordination_status text default 'nuevo', created_at timestamptz default now()
);
alter table public.birthday_requests enable row level security;
alter table public.reservation_requests enable row level security;
drop policy if exists "bday_admin" on public.birthday_requests;
create policy "bday_admin" on public.birthday_requests for all
  using (exists(select 1 from public.clientes where id=auth.uid() and rol in ('admin','rrpp','portero')));
drop policy if exists "resv_admin" on public.reservation_requests;
create policy "resv_admin" on public.reservation_requests for all
  using (exists(select 1 from public.clientes where id=auth.uid() and rol in ('admin','rrpp','portero')));

select 'frate-link fase0' as check,
       (select count(*) from information_schema.columns where table_name='listas' and column_name='form_config') as listas_ok,
       (select count(*) from information_schema.columns where table_name='lista_inscritos' and column_name='calidad_dato') as inscritos_ok,
       (select count(*) from public.link_tipos) as tipos;
