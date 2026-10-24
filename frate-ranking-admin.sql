-- ============================================================
-- FRATE · Ranking Musical — control del admin (sobre los votos)
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
-- Permite fijar posición, ocultar y ordenar canciones a mano.
-- ============================================================

alter table if exists public.canciones add column if not exists orden  int;
alter table if exists public.canciones add column if not exists fijado boolean default false;
alter table if exists public.canciones add column if not exists activo boolean default true;

comment on column public.canciones.orden  is 'Posición manual (menor primero) cuando fijado=true. La define el admin.';
comment on column public.canciones.fijado is 'true = el admin la fija en su posición (manda sobre los votos).';
comment on column public.canciones.activo is 'false = oculta del ranking público.';

-- Seguridad: que el admin pueda editar/borrar canciones directamente.
-- NO tocamos "enable row level security" para no romper la lectura pública ni la votación.
-- Estas políticas son aditivas: si RLS está apagado quedan latentes; si está prendido, dan acceso.
drop policy if exists "canciones_public_read" on public.canciones;
create policy "canciones_public_read" on public.canciones for select using (true);
drop policy if exists "canciones_admin_all" on public.canciones;
create policy "canciones_admin_all" on public.canciones for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Verificación
select 'canciones' as tabla,
       count(*) as total,
       count(*) filter (where fijado) as fijadas
from public.canciones;
