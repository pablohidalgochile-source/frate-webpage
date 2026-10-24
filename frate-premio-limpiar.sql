-- 🧹 SACAR LA VERSIÓN VIEJA DE premio_canjear  ·  proyecto WEB
--
-- QUÉ PASÓ (error mío):
--   `frate-redes-2.sql` creó `premio_canjear(text, text)` con el candado del
--   usuario. Pero `create or replace` NO reemplaza cuando cambia la firma:
--   crea una función NUEVA. La vieja de un solo argumento quedó viva, y esa
--   NO pide el usuario que ganó.
--
--   Por la API no se puede llamar —PostgREST devuelve PGRST203 por ambigüedad
--   y la página usa la de dos argumentos— pero es una puerta abierta dentro
--   de la base y no tiene por qué existir.

drop function if exists public.premio_canjear(text);


-- ── Chequeo · debe quedar UNA sola, con dos argumentos ────────────
select p.proname                                as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname = 'premio_canjear';
