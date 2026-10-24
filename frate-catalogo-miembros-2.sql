-- 🎁 CORTESÍAS DE MIEMBROS · paso 2 de 3 · las dos cortesías
-- Corre DESPUÉS del paso 1. Repetirlo no duplica nada.
insert into public.catalogo_tickets
  (nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
   hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
   max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
select v.* from (values
  ('CORTESIA MUJER (MIEMBROS)',
   'TICKET GRATUITO solo para MIEMBROS de FRATE. Exclusivo para MUJERES (según sexo indicado en Cédula). Es PERSONALIZADO, NO TRANSFERIBLE y UNO POR PERSONA. Podrás CANJEARLO EN PUERTA hasta las 00:30 HRS presentando tu C.I. física.',
   E'Solo para miembros de FRATE (entra con tu cuenta)\nExclusivo para mujeres (según sexo indicado en Cédula)\nUno por persona · personalizado y no transferible\nPresenta tu C.I. física en la puerta\nVálido hasta las 00:30 hrs',
   0, 1, 'F', 'cortesia', true, '00:30', false, 'general', 'CORTESIA MUJER (MIEMBROS)',
   true, true, 0, true, false, 3, true, true),
  ('CORTESIA HOMBRE UNIVERSITARIO (MIEMBROS)',
   'TICKET GRATUITO solo para MIEMBROS de FRATE. Exclusivo para HOMBRES UNIVERSITARIOS (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Es PERSONALIZADO, NO TRANSFERIBLE y UNO POR PERSONA. Válido hasta las 00:30 HRS.',
   E'Solo para miembros de FRATE (entra con tu cuenta)\nExclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nUno por persona · personalizado y no transferible\nVálido hasta las 00:30 hrs',
   0, 1, 'U', 'cortesia', true, '00:30', false, 'general', 'CORTESIA HOMBRE UNIVERSITARIO (MIEMBROS)',
   true, true, 0, true, false, 3, true, true)
) as v(nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
       hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
       max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
where not exists (select 1 from public.catalogo_tickets c where upper(c.nombre) = upper(v.nombre));

select id, nombre, genero, precio, max_por_compra, hora_max_ingreso, solo_miembros, uno_por_persona
  from public.catalogo_tickets where nombre ilike '%(MIEMBROS)%' order by id;
