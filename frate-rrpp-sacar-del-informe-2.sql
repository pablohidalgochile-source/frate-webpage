-- 🔧 ARREGLAR EL ORIGEN · parte 2 de 2 (opcional pero recomendado)
--
-- La parte 1 las esconde. Esto arregla POR QUÉ aparecían: sus listas tienen
-- a la invitada en el campo «dueño», que el informe entiende como «esta
-- persona trajo gente». El campo correcto para eso es `inviter_nombre`, que
-- es el que el link público muestra como «Te invita · Antonia».
--
-- Después de esto, el link se sigue viendo IGUAL para el invitado.
--
-- ⚠️ MIRA PRIMERO, APLICA DESPUÉS. Corre solo el select y revisa las filas.

-- ① Qué se va a cambiar (solo lee)
select l.id, l.codigo, l.fecha, l.nombre,
       l.duenio_nombre                        as dueno_hoy,
       l.inviter_nombre                       as invita_hoy,
       'Aileen Caro'                          as dueno_nuevo,
       coalesce(l.inviter_nombre, l.duenio_nombre) as invita_nuevo
  from public.listas l
 where l.eliminada_at is null
   and l.duenio_id is null
   and public.rrpp_norm(l.duenio_nombre) in (
       select public.rrpp_norm(g.nombre) from public.rrpp_pago g where g.grupo = 'fuera')
 order by l.fecha desc;

-- ② Aplicar (descomenta cuando el select de arriba te calce)
-- update public.listas l
--    set inviter_nombre = coalesce(l.inviter_nombre, l.duenio_nombre),
--        duenio_nombre  = 'Aileen Caro'
--  where l.eliminada_at is null
--    and l.duenio_id is null
--    and public.rrpp_norm(l.duenio_nombre) in (
--        select public.rrpp_norm(g.nombre) from public.rrpp_pago g where g.grupo = 'fuera');
