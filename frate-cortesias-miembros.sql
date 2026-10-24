-- 🎁 ENTRADAS DE REGALO SOLO PARA MIEMBROS
--
-- Dos interruptores en el tipo de ticket. Los dos nacen APAGADOS, así que
-- todos los tickets que ya existen siguen funcionando exactamente igual.
--
--   solo_miembros   → para sacarla hay que tener cuenta en frate.cl
--   uno_por_persona → una por RUT del asistente y una por cuenta
--
-- Por qué por RUT y no solo por cuenta: las cuentas no piden confirmar el
-- correo, así que alguien podría crear diez con correos inventados. El RUT
-- del asistente ya es obligatorio y se valida con dígito verificador.
--
-- La función de pago lo valida en el servidor. Si esto no está corrido,
-- la función lo lee como apagado y no cambia nada.

alter table public.tipos_ticket
  add column if not exists solo_miembros   boolean not null default false;
alter table public.tipos_ticket
  add column if not exists uno_por_persona boolean not null default false;

comment on column public.tipos_ticket.solo_miembros   is 'Si es true, crear-pago exige sesión iniciada para comprar/reservar este ticket.';
comment on column public.tipos_ticket.uno_por_persona is 'Si es true, crear-pago rechaza un RUT o una cuenta que ya tenga este ticket (pagado o en carro).';

-- Comprobación
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tipos_ticket'
   and column_name in ('solo_miembros', 'uno_por_persona')
 order by column_name;
