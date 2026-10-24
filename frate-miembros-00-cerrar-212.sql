-- FRATE · PASO 0 · cerrar la cortesía 212 mientras se construye el candado
-- Es lo mismo que elegir Estado «Cerrado» en el admin. La venta pagada no se toca.
-- Reversa: update public.tipos_ticket set estado = 'Activo' where id = 212;
set lock_timeout = '5s';
update public.tipos_ticket set estado = 'Cerrado' where id = 212 and estado is distinct from 'Cerrado';
select id, nombre, estado, disponible from public.tipos_ticket where id = 212;
