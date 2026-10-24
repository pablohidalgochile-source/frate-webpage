-- frate-tramo-auto.sql · 18-oct-2026
--
-- B · El paso de tramo AUTOMÁTICO: cuando se agota el tipo marcado como
-- disparador, se cierra TODO su tramo «PREV N» y se abre TODO el «PREV N+1»
-- del mismo evento. Para Halloween el disparador es PREV 3 MUJER del 31.
--
-- NO es una regla general escrita a fuego: se enciende tipo por tipo con la
-- bandera `dispara_tramo`. Un evento sin ninguna marcada se comporta igual que
-- hoy. Es el mismo trabajo que hace el botón del admin, hecho solo.

alter table public.tipos_ticket
  add column if not exists dispara_tramo boolean not null default false;

comment on column public.tipos_ticket.dispara_tramo is
  'Si se agota este tipo, se cierra su tramo PREV N y se abre el PREV N+1 del evento.';

-- Queda rastro de cada cambio: sin esto el tramo se movería de madrugada y
-- nadie sabría a qué hora ni por qué.
create table if not exists public.tramo_cambios (
  id          bigserial primary key,
  evento_id   bigint,
  disparador  bigint,
  de_tramo    int,
  a_tramo     int,
  cerrados    int,
  abiertos    int,
  creado_at   timestamptz not null default now()
);

create or replace function public.fn_tramo_auto()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  n_actual int;
  n_cierra int;
  n_abre   int;
begin
  -- Sólo el tipo marcado, y sólo en el instante en que cruza a cero.
  if not coalesce(old.dispara_tramo, false) then return new; end if;
  if coalesce(old.disponible, 0) <= 0 then return new; end if;
  if coalesce(new.disponible, 0) >  0 then return new; end if;

  -- El número de tramo sale del nombre: «PREV 3 MUJER …» → 3.
  n_actual := nullif(substring(new.nombre from '^\s*PREV(?:ENTA)?\s*(\d+)\s'), '')::int;
  if n_actual is null then return new; end if;

  -- Cierra TODO el tramo vigente del evento (no sólo el que se agotó).
  update tipos_ticket
     set venta_hasta = now()
   where evento_id = new.evento_id
     and estado <> 'Oculto'
     and nombre ~ ('^\s*PREV(ENTA)?\s*' || n_actual || '\s');
  get diagnostics n_cierra = row_count;

  -- Y abre TODO el siguiente.
  update tipos_ticket
     set venta_desde = now()
   where evento_id = new.evento_id
     and estado <> 'Oculto'
     and nombre ~ ('^\s*PREV(ENTA)?\s*' || (n_actual + 1) || '\s');
  get diagnostics n_abre = row_count;

  insert into tramo_cambios (evento_id, disparador, de_tramo, a_tramo, cerrados, abiertos)
  values (new.evento_id, new.id, n_actual, n_actual + 1, n_cierra, n_abre);

  return new;
end; $function$;

drop trigger if exists trg_tramo_auto on public.tipos_ticket;

-- `when` sobre `disponible`: los UPDATE de arriba tocan sólo las fechas, así
-- que el trigger no se vuelve a disparar a sí mismo.
create trigger trg_tramo_auto
  after update of disponible on public.tipos_ticket
  for each row
  when (old.disponible is distinct from new.disponible)
  execute function public.fn_tramo_auto();
