-- ↩️ DESHACER LA MIGRACIÓN DE CUMPLEAÑOS  ·  proyecto WEB
-- Solo si algo salió mal. Devuelve todo como estaba.
--
-- Funciona porque `inviter_nombre` estaba VACÍO en toda la tabla antes de la
-- migración: donde haya algo, lo escribimos nosotros. Esa es la marca que
-- permite revertir sin haber guardado una copia aparte.
--
-- ⚠️ Ojo: también borra el inviter de las listas NUEVAS creadas después de la
--    migración. Eso es correcto — vuelven al estado de antes, con el
--    cumpleañero como dueño.

update public.listas
   set duenio_nombre  = inviter_nombre,
       duenio_id      = null,
       inviter_nombre = null
 where (codigo like 'CUMPLE-%' or codigo like 'RESERVA-%')
   and eliminada_at is null
   and inviter_nombre is not null;


-- ── Chequeo · debe quedar todo como antes ─────────────────────────
select count(*)                                        as listas,
       count(*) filter (where inviter_nombre is null)  as sin_invitador,
       count(*) filter (where duenio_id is null)       as sin_duenio_id
from public.listas
where (codigo like 'CUMPLE-%' or codigo like 'RESERVA-%')
  and eliminada_at is null;
