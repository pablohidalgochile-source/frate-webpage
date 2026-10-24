-- frate-puerta-rut-condiciones.sql   ·   16-oct-2026
--
-- La pestana "Por RUT" de la puerta se queda sin las condiciones del ticket
-- cuando la red anda lenta. `puerta_buscar_rut` NO devuelve `condiciones` ni
-- `precio_unitario`, asi que validacion.html:1547 los va a buscar despues con
-- una carrera contra un reloj de 2.500 ms. Si la carrera se vence --un sabado
-- a la 1 AM en la puerta, justo cuando se usa esa pestana-- el codigo cae al
-- mapa por nombre y el portero ve la tarjeta verde SIN el aviso de
-- "solo mujeres" / "solo hombres", y no pide la cedula. Sin error ni aviso.
--
-- El arreglo: que la funcion devuelva las dos columnas desde el principio.
-- Asi la carrera deja de importar y el snapshot llega siempre.
--
-- Solo se AGREGAN dos campos al json; los que ya venian quedan igual, asi que
-- la puerta desplegada hoy sigue funcionando sin cambiar una linea.

create or replace function public.puerta_buscar_rut(p_rut text, p_evento integer)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  limpio text := regexp_replace(lower(coalesce(p_rut,'')), '[^0-9k]', '', 'g');
  v json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  if length(limpio) < 7 then return json_build_object('error','RUT demasiado corto'); end if;

  select coalesce(json_agg(row_to_json(t) order by t.ya_usado asc, t.nombre), '[]'::json) into v
  from (
    select pos.qr                                   as qr,
           coalesce(x.per->>'nombre', p.nombre_cliente) as nombre,
           x.per->>'rut'                            as rut,
           ip.nombre_ticket,
           p.nombre_cliente                         as comprador,
           'FCC-'||lpad(p.id::text, 6, '0')         as orden,
           (qu.qr_id is not null)                   as ya_usado,
           qu.created_at                            as usado_at,
           qu.incidencia,
           ip.condiciones,                          -- 🆕 el snapshot de la venta
           ip.precio_unitario                       -- 🆕 lo usa _esMiembro
    from items_pedido ip
    join pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
    cross join lateral jsonb_array_elements_text(ip.qr_ids) with ordinality pos(qr, i)
    left join lateral (select ip.personas -> (pos.i::int - 1) as per) x on true
    left join qr_usados qu on qu.qr_id = pos.qr
    where ip.evento_id = p_evento
      and regexp_replace(lower(coalesce(x.per->>'rut','')), '[^0-9k]', '', 'g') = limpio
  ) t;
  return v;
end; $function$;
