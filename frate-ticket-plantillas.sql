-- ============================================================
-- FRATE — Biblioteca de tipos de ticket reutilizables
-- Guarda configuraciones de ticket (nombre, precio, cupo, hora
-- máx, etc.) para reusarlas en cualquier evento sin re-tipear.
-- El modal "Tipo de Ticket" ofrece "Cargar desde biblioteca" y
-- "💾 A biblioteca". Correr en el Supabase de la WEB.
-- ============================================================

create table if not exists public.ticket_plantillas (
  id             bigserial primary key,
  nombre         text not null,
  descripcion    text,
  estado         text default 'Activo',
  precio         int  default 0,
  disponible     int  default 0,
  max_por_compra int  default 6,
  solo_web       boolean default true,
  hora_max_ingreso text,
  orden          int default 0,
  created_at     timestamptz default now()
);
create index if not exists ticket_plantillas_orden_idx on public.ticket_plantillas (orden, nombre);

alter table public.ticket_plantillas enable row level security;
drop policy if exists "ttpl_staff_read" on public.ticket_plantillas;
create policy "ttpl_staff_read" on public.ticket_plantillas for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));
drop policy if exists "ttpl_admin_all" on public.ticket_plantillas;
create policy "ttpl_admin_all" on public.ticket_plantillas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Semilla con los típicos de FRATE (no pisa si ya existen por nombre)
insert into public.ticket_plantillas (nombre, descripcion, precio, disponible, max_por_compra, solo_web, orden) values
  ('PRE-VENTA GRAL. MUJER', 'Exclusivo para mujeres. Al ingreso presenta C.I.', 6000, 100, 6, true, 10),
  ('PRE-VENTA GRAL. HOMBRE', 'Al ingreso presenta C.I.', 8000, 100, 6, true, 20),
  ('GENERAL EN PUERTA', 'Venta en puerta la noche del evento.', 10000, 200, 10, false, 30),
  ('COVER CUMPLEAÑOS', 'Cover para invitados de cumpleaños.', 5000, 50, 20, true, 40)
on conflict do nothing;

select 'ticket_plantillas' as check,
       case when exists(select 1 from pg_tables where tablename='ticket_plantillas') then 'OK' else 'FALTA' end,
       (select count(*) from public.ticket_plantillas) as plantillas;
