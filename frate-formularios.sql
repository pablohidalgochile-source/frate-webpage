-- ============================================================
-- FRATE — Formularios con link propio (Inbox único)
-- Tabla que recibe cumpleaños / reserva / cliente frecuente desde
-- las páginas públicas (/formcumple /formreserva /formfrecuente).
-- El envío entra por la edge function form-submit (service role);
-- el admin los trabaja desde Comunidad → Formularios.
--
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

create table if not exists public.formularios (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('cumple','reserva','frecuente')),
  nombre     text,
  email      text,
  telefono   text,
  instagram  text,
  datos      jsonb not null default '{}'::jsonb,   -- todos los campos del form
  estado     text  not null default 'nuevo' check (estado in ('nuevo','contactado','cerrado')),
  notas      text,
  historial  jsonb not null default '[]'::jsonb,    -- [{ts, ev, por}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists formularios_estado_idx on public.formularios (estado, created_at desc);
create index if not exists formularios_tipo_idx   on public.formularios (tipo,   created_at desc);

-- Sólo el admin lee/edita desde el panel. El envío público entra por form-submit
-- (service role, salta RLS). Nada de INSERT público directo a la tabla.
alter table public.formularios enable row level security;
drop policy if exists formularios_admin_all on public.formularios;
create policy formularios_admin_all on public.formularios
  for all using      (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
          with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- ── El Anfitrión deriva por intención a cada formulario (idempotente por clave) ──
insert into public.respuestas (clave, titulo, texto, categoria, disparadores, bot_auto, tras_responder, orden, activo)
select v.clave, v.titulo, v.texto, 'derivacion', v.disparadores, true, 'nada', 5, true
from (values
  ('deriva_cumple',    'Deriva · Cumpleaños',
   '¡Bacán que quieras celebrar tu cumple con nosotros! 🎂 Llena esta ficha y el equipo te contacta para cerrar el día: https://www.frate.cl/formcumple',
   'cumpleaños,cumple,cumpleanos,celebrar cumple,mi cumple'),
  ('deriva_reserva',   'Deriva · Reserva',
   '¿Quieres mesa? 🍾 Reserva acá y coordinamos sector y botellas: https://www.frate.cl/formreserva',
   'reservar,reserva,mesa,mesas,vip,botella,botellas,garzon'),
  ('deriva_frecuente', 'Deriva · Cliente frecuente',
   'Hazte cliente frecuente ⭐ y te llegan beneficios (incluido tu cumple): https://www.frate.cl/formfrecuente',
   'cliente frecuente,beneficios,socio,membresia,frecuente'),
  ('deriva_convenio',  'Deriva · FRAT&FRIENDS',
   '¿Marca, RRPP o embajador/a? 🤝 Cuéntanos tu propuesta acá: https://www.frate.cl/frat-friends',
   'convenio,marca,embajador,embajadora,alianza,rrpp,canje,colaboracion')
) as v(clave, titulo, texto, disparadores)
where not exists (select 1 from public.respuestas r where r.clave = v.clave);

-- Verificación
select 'formularios'         as check, case when exists(select 1 from information_schema.tables where table_name='formularios') then 'OK' else 'FALTA' end
union all
select 'respuestas deriva',           case when (select count(*) from public.respuestas where clave like 'deriva_%') >= 4 then 'OK' else 'FALTA' end;
