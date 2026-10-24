-- === Rotulo del escalon + color por tipo de entrada ===
-- Pablo: «REBAJADA / GENERAL / PRO ese rotulo agregalo al tipo de ticket es
-- muy bueno». Hoy se deduce del nombre; con esto se declara.
-- El color queda opcional: vacio = lo elige el modo de Configuracion General.
-- Idempotente.

alter table public.catalogo_tickets
  add column if not exists rotulo text,
  add column if not exists color  text,
  add column if not exists emojis text;

alter table public.tipos_ticket
  add column if not exists rotulo text,
  add column if not exists color  text,
  add column if not exists emojis text;

comment on column public.catalogo_tickets.rotulo is 'El escalon que se muestra arriba del nombre: REBAJADA / GENERAL / PRO. Vacio = se deduce del nombre.';
comment on column public.catalogo_tickets.color  is 'Hex del tinte. Vacio = lo elige el modo de Configuracion General.';
comment on column public.catalogo_tickets.emojis is 'Emoji del mosaico, pegados. Vacio = se deducen del nombre.';

-- Propuesta inicial de rotulo, deducida del nombre. Editable despues.
update public.catalogo_tickets set rotulo =
  case when nombre ~* 'REBAJAD|PROMO|EARLY'   then 'REBAJADA'
       when nombre ~* '\mPRO\M|PREMIUM|VIP'  then 'PRO'
       when nombre ~* 'GRAL|GENERAL'          then 'GENERAL'
       when nombre ~* 'CORTES|LISTA|INVITAD'  then 'CORTESIA'
       when nombre ~* 'PUERTA|INGRESO'        then 'PUERTA'
       else null end
where rotulo is null;

select nombre, coalesce(rotulo,'(sin rotulo)') as rotulo, clase, precio
from public.catalogo_tickets order by orden, nombre;
