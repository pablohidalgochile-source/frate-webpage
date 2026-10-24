-- ============================================================
-- FRATE — Limpieza de respuestas duplicadas del bot
-- Desactiva el AUTO-envío de las respuestas que chocaban (quedan
-- como plantillas/rápidas, no se pierden). Enriquece la de convenio
-- para no perder la cobertura de "universidad".
--
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

-- B1: la "agenda de cumpleaños en el chat" (orden 20) deja de auto-enviarse;
--     el bot usará la que deriva al formulario (deriva_cumple, orden 5).
update public.respuestas set bot_auto = false
 where bot_auto = true and orden = 20 and texto ilike '%agenda de cumplea%';

-- B2: el texto "convenio universitario" (orden 50) deja de auto-enviarse;
--     el bot usará la que deriva a frat-friends (deriva_convenio, orden 5).
update public.respuestas set bot_auto = false
 where bot_auto = true and orden = 50 and texto ilike '%CONVENIO UNIVERSITARIO%';

-- Enriquecer deriva_convenio para que siga atrapando "universidad"
update public.respuestas
   set disparadores = disparadores || ',universidad,universitario,instituto,centro de alumnos'
 where clave = 'deriva_convenio' and coalesce(disparadores,'') not ilike '%universidad%';

-- Verificación: cuántas respuestas cumpleaños/convenio quedan en AUTO
select 'auto cumpleaños' as check, count(*) from public.respuestas where bot_auto and disparadores ilike '%cumplea%'
union all
select 'auto convenio',           count(*) from public.respuestas where bot_auto and disparadores ilike '%convenio%';
