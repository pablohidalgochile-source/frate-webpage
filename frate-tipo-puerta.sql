-- === 7) El tipo que faltaba: lo que se cobra EN LA PUERTA ===
-- El tablero de puerta muestra la categoria 🚪 Puerta desde siempre, y no
-- existe ningun tipo de esa clase: lo que se cobra al entrar no pasa por el
-- catalogo. Por eso esa columna sale en cero aunque haya entrado gente.
-- Correr DESPUES de frate-clase-ticket.sql. Idempotente.

-- El nombre lleva "INGRESO" a proposito: la regla vieja de evento_vivo
-- detectaba la puerta con `nombre ~* 'ingreso'`, asi que lo ya emitido bajo
-- ese nombre sigue cayendo donde corresponde aunque no tenga tipo.
insert into public.catalogo_tickets
  (nombre, descripcion, precio, max_por_compra, zona, genero,
   transferible, activo, orden, clase, clase_confirmada)
select
  'INGRESO PUERTA',
  'Se cobra al entrar, en la puerta. El monto lo pone quien cobra: el precio de aca es solo referencia.',
  0, 1, 'general', null, false, true,
  coalesce((select max(orden) from public.catalogo_tickets), 0) + 1,
  'puerta', true
where not exists (
  select 1 from public.catalogo_tickets where nombre ilike 'INGRESO PUERTA%'
);

-- Chequeo: cuantos tipos hay por clase, y cuales siguen sin confirmar.
select coalesce(clase,'(sin clase)') as clase,
       count(*) as tipos,
       count(*) filter (where not clase_confirmada) as por_confirmar,
       string_agg(nombre, ' · ' order by nombre) as cuales
from public.catalogo_tickets
group by 1 order by 2 desc;
