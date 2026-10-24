-- ============================================================
-- FRATE — F5: Plantillas de Comunidad + extranjero + fix RLS
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- Idempotente.
-- ============================================================

-- 1) FIX: política de ESCRITURA admin para respuestas y catalogo_items
--    (el CRUD del admin las necesita — sin esto, guardar/borrar falla por RLS)
alter table if exists public.respuestas enable row level security;
drop policy if exists "respuestas_admin_write" on public.respuestas;
create policy "respuestas_admin_write" on public.respuestas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

alter table if exists public.catalogo_items enable row level security;
drop policy if exists "catalogo_items_admin_write" on public.catalogo_items;
create policy "catalogo_items_admin_write" on public.catalogo_items for all
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

-- 2) Plantillas de Comunidad (presets reutilizables de listas/cortesía)
create table if not exists public.plantillas_comunidad (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  genero             text default '',        -- '' | 'F' | 'M'
  hora_max           text default '',        -- '00:30'
  cupos              integer default 0,      -- 0 = sin límite
  max_acompanantes   integer default 0,      -- 0 = solo 1 entrada por persona
  texto_condiciones  text default '',
  permite_extranjero boolean default true,
  chequear_edad      boolean default true,
  orden              integer default 0,
  activo             boolean default true,
  created_at         timestamptz default now()
);
create unique index if not exists plantillas_nombre_key on public.plantillas_comunidad (nombre);
alter table public.plantillas_comunidad enable row level security;
drop policy if exists "plantillas_read" on public.plantillas_comunidad;
create policy "plantillas_read" on public.plantillas_comunidad for select using (true);
drop policy if exists "plantillas_admin_write" on public.plantillas_comunidad;
create policy "plantillas_admin_write" on public.plantillas_comunidad for all
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

-- 3) Extranjero en los inscritos (para relajar el DV del RUT y saber que es extranjer@)
alter table public.lista_inscritos add column if not exists extranjero boolean default false;

-- 4) Plantillas base (editables/eliminables desde el admin)
insert into public.plantillas_comunidad (nombre, genero, hora_max, cupos, max_acompanantes, texto_condiciones, permite_extranjero, chequear_edad, orden) values
('Cortesía Mujer',        'F', '00:30', 0, 0, 'No transferible. Cédula física. Exclusivo mujeres.', true, true, 1),
('Lista Cumpleaños',      '',  '00:30', 0, 3, 'Cumpleañer@ + invitad@s. Todos con cédula física. Beneficio válido hasta las 00:30.', true, true, 2),
('Embajador / Convenio',  '',  '00:30', 0, 0, 'Lista de convenio universitario. Presentar credencial universitaria + cédula física.', true, false, 3)
on conflict (nombre) do nothing;

select nombre, genero, hora_max, max_acompanantes from public.plantillas_comunidad order by orden;
