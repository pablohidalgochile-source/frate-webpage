-- frate-vasos-01-cupo.sql   ·   17-oct-2026   ·   PARTE 1 de 2
--
-- Vender el VASO de Halloween como extra del checkout. Los extras (addons) no
-- tenian ni evento ni stock, que es justo lo que los hacia inservibles: aparecian
-- en TODOS los eventos y se podian vender infinitos.
--
-- Esta parte agrega las dos columnas y copia, tal cual, el mecanismo de cupo que
-- ya usan las entradas (reservar_cupo / liberar_cupo). No se inventa nada: el
-- descuento atomico `where stock >= cantidad` es lo que impide que dos personas
-- se lleven el ultimo vaso.

alter table public.addons
  add column if not exists eventos int[],   -- null = todos; {59,60} = solo esas noches
  add column if not exists stock   int;     -- null = sin limite (como era antes)

comment on column public.addons.eventos is
  'Eventos donde se ofrece. NULL = todos (comportamiento viejo).';
comment on column public.addons.stock is
  'Unidades que quedan. NULL = sin limite. Lo descuenta reservar_extra al armar el carrito.';

-- Espejo exacto de reservar_cupo(p_tt, p_cant), pero sobre addons.
create or replace function public.reservar_extra(p_addon integer, p_cant integer)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare n int; sin_tope boolean;
begin
  if p_cant is null or p_cant <= 0 then return true; end if;
  -- Un extra sin stock declarado no tiene cupo que reservar: pasa derecho.
  select (stock is null) into sin_tope from public.addons where id = p_addon;
  if sin_tope is null then return false; end if;   -- el extra no existe
  if sin_tope then return true; end if;
  update public.addons
     set stock = stock - p_cant
   where id = p_addon and stock >= p_cant;
  get diagnostics n = row_count;
  return n > 0;
end; $function$;

-- Espejo exacto de liberar_cupo(p_tt, p_cant).
create or replace function public.liberar_extra(p_addon integer, p_cant integer)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_cant is null or p_cant <= 0 then return; end if;
  update public.addons set stock = stock + p_cant
   where id = p_addon and stock is not null;
end; $function$;

grant execute on function public.reservar_extra(integer, integer) to anon, authenticated;
grant execute on function public.liberar_extra(integer, integer)  to anon, authenticated;
