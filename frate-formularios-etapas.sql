-- ============================================================
-- FRATE · Etapas del pipeline de Formularios (cumpleaños/reservas)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- Etapas finales (7):
--   nuevo · sin_info · contactado · sin_disp · confirmado · realizado · no_realizado
--
-- Antes la columna estado tenía un CHECK viejo (solo nuevo/contactado/cerrado)
-- que hacía que "no se pudiera cambiar la etapa". Esto lo reemplaza y ADEMÁS
-- migra los estados viejos a los nuevos. Seguro y re-ejecutable.
-- ============================================================

-- 1) Quitar CUALQUIER check que exista sobre 'estado' (sin depender del nombre)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.formularios'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.formularios drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) Migrar los estados viejos a los nuevos (antes de poner el CHECK nuevo)
update public.formularios set estado = 'contactado'   where estado in ('contactando','coordinando');
update public.formularios set estado = 'no_realizado' where estado in ('perdido');
update public.formularios set estado = 'realizado'    where estado in ('cerrado');
-- por si quedó algún valor fuera de la lista, lo mando a 'nuevo' (no rompe el CHECK)
update public.formularios
set estado = 'nuevo'
where estado is null
   or estado not in ('nuevo','sin_info','contactado','sin_disp','confirmado','realizado','no_realizado');

-- 3) Agregar el CHECK nuevo con las 7 etapas
alter table public.formularios
  add constraint formularios_estado_check
  check (estado in ('nuevo','sin_info','contactado','sin_disp','confirmado','realizado','no_realizado'));

-- 4) Default coherente
alter table public.formularios alter column estado set default 'nuevo';

-- 5) Verificar
select estado, count(*) from public.formularios group by estado order by estado;
