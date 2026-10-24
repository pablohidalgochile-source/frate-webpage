-- 🎁 CORTESÍAS DE MIEMBROS · paso 4 · hombre general + texto de preventas
-- Solo toca catalogo_tickets y sin cambiar su estructura: no puede chocar con
-- el sitio como el script largo. Repetirlo no duplica ni pisa nada.

-- ① La tercera cortesía: hombres (según Cédula), mismas condiciones.
insert into public.catalogo_tickets
  (nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
   hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
   max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
select v.* from (values
  ('CORTESIA HOMBRE GENERAL (MIEMBROS)',
   'TICKET GRATUITO solo para MIEMBROS de FRATE. Exclusivo para HOMBRES (según sexo indicado en Cédula). Es PERSONALIZADO, NO TRANSFERIBLE y UNO POR PERSONA. Podrás CANJEARLO EN PUERTA hasta las 00:30 HRS presentando tu C.I. física.',
   E'Solo para miembros de FRATE (entra con tu cuenta)\nExclusivo para hombres (según sexo indicado en Cédula)\nUno por persona · personalizado y no transferible\nPresenta tu C.I. física en la puerta\nVálido hasta las 00:30 hrs',
   0, 1, 'M', 'cortesia', true, '00:30', false, 'general', 'CORTESIA HOMBRE GENERAL (MIEMBROS)',
   true, true, 0, true, false, 3, true, true)
) as v(nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
       hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
       max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
where not exists (select 1 from public.catalogo_tickets c where upper(c.nombre) = upper(v.nombre));

-- ② Las preventas de HOMBRE GENERAL decían «universitarios» y pedían credencial.
--    Solo se corrigen si todavía traen ese texto: si ya las editaste, no se pisan.
update public.catalogo_tickets
   set descripcion   = 'Exclusivo para HOMBRES (según sexo indicado en Cédula). Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. física. Este TICKET ASEGURA TU CUPO.',
       instrucciones = E'Exclusivo para hombres (según sexo indicado en Cédula)\nPresenta tu C.I. física al ingreso\nEste ticket asegura tu cupo'
 where id = 21 and (descripcion ilike '%universitari%' or instrucciones ilike '%universitari%');

update public.catalogo_tickets
   set descripcion   = 'ACCESO + 1 COVER a ELECCIÓN (Pisco, Ron, Vodka, Cerveza). Exclusivo para HOMBRES (según sexo indicado en Cédula). Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. física. Este TICKET ASEGURA TU CUPO.',
       instrucciones = E'Incluye 1 COVER a elección (Pisco, Ron, Vodka, Cerveza)\nExclusivo para hombres (según sexo indicado en Cédula)\nPresenta tu C.I. física al ingreso\nEste ticket asegura tu cupo'
 where id = 22 and (descripcion ilike '%universitari%' or descripcion ilike '%institución%' or instrucciones ilike '%universitari%');

-- ✅ Comprobación
select id, nombre, genero, precio, max_por_compra, solo_miembros, uno_por_persona, left(descripcion, 70) as texto
  from public.catalogo_tickets
 where nombre ilike '%(MIEMBROS)%' or id in (21, 22)
 order by id;
