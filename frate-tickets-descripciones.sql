-- ============================================================
-- FRATE — Descripciones + condiciones de los 5 tipos de ticket "de siempre".
-- Crea o actualiza cada uno en el catálogo (catalogo_tickets), con la
-- descripción (texto de venta) y las condiciones (instrucciones → viajan
-- al correo y a la puerta). Nombres GENÉRICOS (sin el día).
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

-- Helper: actualiza si existe (por nombre), inserta si no.
-- (catalogo_tickets no tiene unique en nombre, por eso update + insert-if-missing.)

-- 1) Pre-Venta REBAJADA MUJER  (⚠️ inferida — ajústala si quieres)
update public.catalogo_tickets set
  descripcion  = 'Preventa rebajada — la más económica. Este ticket asegura tu cupo. Exclusivo para mujeres (según sexo indicado en Cédula de identidad). Cupos limitados.',
  instrucciones= E'Preventa rebajada · cupos limitados\nEste ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)'
where upper(trim(nombre)) = 'PRE-VENTA REBAJADA MUJER';
insert into public.catalogo_tickets (nombre, descripcion, instrucciones, precio, max_por_compra, activo)
select 'Pre-Venta REBAJADA MUJER',
  'Preventa rebajada — la más económica. Este ticket asegura tu cupo. Exclusivo para mujeres (según sexo indicado en Cédula de identidad). Cupos limitados.',
  E'Preventa rebajada · cupos limitados\nEste ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)',
  7000, 6, true
where not exists (select 1 from public.catalogo_tickets where upper(trim(nombre))='PRE-VENTA REBAJADA MUJER');

-- 2) Pre-Venta GRAL. MUJER
update public.catalogo_tickets set
  descripcion  = 'Este TICKET ASEGURA TU CUPO. Exclusivo para MUJERES (Según sexo indicado en Cédula de identidad).',
  instrucciones= E'Este ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)'
where upper(trim(nombre)) = 'PRE-VENTA GRAL. MUJER';
insert into public.catalogo_tickets (nombre, descripcion, instrucciones, precio, max_por_compra, activo)
select 'Pre-Venta GRAL. MUJER',
  'Este TICKET ASEGURA TU CUPO. Exclusivo para MUJERES (Según sexo indicado en Cédula de identidad).',
  E'Este ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)',
  8000, 6, true
where not exists (select 1 from public.catalogo_tickets where upper(trim(nombre))='PRE-VENTA GRAL. MUJER');

-- 3) Pre-Venta PRO MUJER
update public.catalogo_tickets set
  descripcion  = 'ACCESO + 1 COVER a ELECCIÓN (Pisco, Ron, Vodka, Cerveza). Este TICKET ASEGURA TU CUPO. Exclusivo para MUJERES (Según sexo indicado en Cédula de identidad).',
  instrucciones= E'Incluye 1 COVER a elección (Pisco, Ron, Vodka, Cerveza)\nEste ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)'
where upper(trim(nombre)) = 'PRE-VENTA PRO MUJER';
insert into public.catalogo_tickets (nombre, descripcion, instrucciones, precio, max_por_compra, activo)
select 'Pre-Venta PRO MUJER',
  'ACCESO + 1 COVER a ELECCIÓN (Pisco, Ron, Vodka, Cerveza). Este TICKET ASEGURA TU CUPO. Exclusivo para MUJERES (Según sexo indicado en Cédula de identidad).',
  E'Incluye 1 COVER a elección (Pisco, Ron, Vodka, Cerveza)\nEste ticket asegura tu cupo\nExclusivo para mujeres (según sexo en Cédula de identidad)',
  9000, 6, true
where not exists (select 1 from public.catalogo_tickets where upper(trim(nombre))='PRE-VENTA PRO MUJER');

-- 4) Pre-Venta GRAL. HOMBRE UNIVERSITARIO
update public.catalogo_tickets set
  descripcion  = 'Exclusivo para HOMBRES UNIVERSITARIOS (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Este TICKET ASEGURA TU CUPO.',
  instrucciones= E'Exclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nEste ticket asegura tu cupo'
where upper(trim(nombre)) = 'PRE-VENTA GRAL. HOMBRE UNIVERSITARIO';
insert into public.catalogo_tickets (nombre, descripcion, instrucciones, precio, max_por_compra, activo)
select 'Pre-Venta GRAL. HOMBRE UNIVERSITARIO',
  'Exclusivo para HOMBRES UNIVERSITARIOS (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Este TICKET ASEGURA TU CUPO.',
  E'Exclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nEste ticket asegura tu cupo',
  9000, 6, true
where not exists (select 1 from public.catalogo_tickets where upper(trim(nombre))='PRE-VENTA GRAL. HOMBRE UNIVERSITARIO');

-- 5) Pre-Venta PRO HOMBRE UNIVERSITARIO
update public.catalogo_tickets set
  descripcion  = 'ACCESO + 1 COVER a ELECCIÓN (Pisco, Ron, Vodka, Cerveza). Exclusivo para HOMBRE UNIVERSITARIO (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Este TICKET ASEGURA TU CUPO.',
  instrucciones= E'Incluye 1 COVER a elección (Pisco, Ron, Vodka, Cerveza)\nExclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nEste ticket asegura tu cupo'
where upper(trim(nombre)) = 'PRE-VENTA PRO HOMBRE UNIVERSITARIO';
insert into public.catalogo_tickets (nombre, descripcion, instrucciones, precio, max_por_compra, activo)
select 'Pre-Venta PRO HOMBRE UNIVERSITARIO',
  'ACCESO + 1 COVER a ELECCIÓN (Pisco, Ron, Vodka, Cerveza). Exclusivo para HOMBRE UNIVERSITARIO (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Este TICKET ASEGURA TU CUPO.',
  E'Incluye 1 COVER a elección (Pisco, Ron, Vodka, Cerveza)\nExclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nEste ticket asegura tu cupo',
  10000, 6, true
where not exists (select 1 from public.catalogo_tickets where upper(trim(nombre))='PRE-VENTA PRO HOMBRE UNIVERSITARIO');

-- Verificación
select nombre, left(descripcion,40) as descripcion, activo
from public.catalogo_tickets
where upper(trim(nombre)) in ('PRE-VENTA REBAJADA MUJER','PRE-VENTA GRAL. MUJER','PRE-VENTA PRO MUJER','PRE-VENTA GRAL. HOMBRE UNIVERSITARIO','PRE-VENTA PRO HOMBRE UNIVERSITARIO')
order by nombre;
