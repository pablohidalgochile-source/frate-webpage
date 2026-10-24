-- 🎁 CORTESÍAS DE MIEMBROS · paso 1 de 3 · solo toca catalogo_tickets
-- Va separado del disparador: el script completo bloqueaba dos tablas a la
-- vez y chocó con una lectura del sitio (deadlock). Uno por tabla no choca.
-- Si alguien tiene la tabla ocupada, espera 5 s y avisa en vez de trabarse:
-- en ese caso vuelve a correrlo.
set lock_timeout = '5s';

alter table public.catalogo_tickets
  add column if not exists solo_miembros   boolean not null default false,
  add column if not exists uno_por_persona boolean not null default false;

select 'columnas listas' as paso_1;
