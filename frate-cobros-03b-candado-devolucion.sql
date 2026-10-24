-- FRATE · COBROS 03b · candado: un cobro de servicio no pide devolución solo
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-03a.
-- Idempotente. No cambia ninguna columna ni ninguna fila: solo agrega un trigger.
--
-- ⚠️ CÓRRELO FUERA DE VENTA, igual que el 01a: crear un trigger toma un lock sobre `pedidos` y
--    mientras espera deja en cola TODO lo que llegue detrás, lecturas incluidas (un jueves a las
--    23:40 eso cuelga la portada y el validador). `create or replace trigger` (PG 14+, Supabase
--    corre 15) se queda en ShareRowExclusive en vez del AccessExclusive del drop+create, y el
--    lock_timeout corta la espera a 2 s. Si sale «lock timeout», vuelve a correrlo: es seguro.
--
-- POR QUÉ UN TRIGGER Y NO REESCRIBIR LA FUNCIÓN: hacia dev_estado='pendiente' hay DOS
-- caminos — la edge `solicitar-devolucion` (Mis compras) y el RPC `mi_entrada_gestion`
-- (/mi-entrada, que recibe el id del pedido desde el navegador y no mira si la orden tiene
-- entradas adentro). Reescribir ese RPC entero son 80 líneas que no caben en un solo pegado
-- y que pisarían la versión viva. El trigger tapa los dos caminos —y cualquiera que venga—
-- en una sola línea de verdad, y NO estorba al admin: solo bloquea la solicitud NUEVA
-- ('pendiente'), nunca aprobar, rechazar ni devolver (ahí sí se puede devolver a medias).
--
-- Reversa: drop trigger if exists pedidos_cobro_sin_devolucion on public.pedidos;
--          drop function if exists public.pedidos_cobro_sin_devolucion();

set lock_timeout = '2s';  -- corto a propósito: la cola detrás del lock no pasa los 3 s de anon

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'es_cobro_servicio')
  then raise exception 'Falta correr primero frate-cobros-03a-candado-borrar.sql'; end if;
end $$;

-- `security definer`: la escritura de dev_estado llega como service role (la edge) o como el
-- usuario del admin, y ninguno de los dos tiene execute sobre es_cobro_servicio (se lo quitamos
-- en el 03a). Corriendo como el dueño, el trigger sí puede preguntar — y de paso ve crm_pagos
-- sin pelear con su RLS de staff.
create or replace function public.pedidos_cobro_sin_devolucion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Solo la solicitud nueva del cliente. Si ya venía 'pendiente' (o el admin la mueve a
  -- aprobada/rechazada), no se toca nada: esa plata la resuelve una persona en Órdenes.
  -- Las DOS señales, igual que las otras cuatro capas: un cobro viejo pudo quedar con
  -- origen 'web' (01b sin correr) y por `origen` a secas se colaba.
  if new.dev_estado = 'pendiente' and old.dev_estado is distinct from new.dev_estado
     and public.es_cobro_servicio(new.id) then
    raise exception 'Este es un pago de un servicio: escríbenos y lo vemos contigo.'
      using detail = 'ES_COBRO_SERVICIO',
            hint   = 'Los cumpleaños y reservas se devuelven desde Admin → Órdenes.';
  end if;
  return new;
end; $$;

-- `update of dev_estado`: no se ejecuta en las ventas normales, solo cuando alguien
-- escribe esa columna. Cero costo en el camino caliente de la compra de entradas.
create or replace trigger pedidos_cobro_sin_devolucion
  before update of dev_estado on public.pedidos
  for each row execute function public.pedidos_cobro_sin_devolucion();

-- Verificación
select 'trigger pedidos_cobro_sin_devolucion' as chequeo,
       case when exists (select 1 from pg_trigger where tgname = 'pedidos_cobro_sin_devolucion'
                           and not tgisinternal) then 'OK' else 'FALTA' end as valor
union all
select 'el trigger mira las DOS señales',
       case when exists (select 1 from pg_proc where proname = 'pedidos_cobro_sin_devolucion'
                           and prosrc like '%es_cobro_servicio%') then 'OK' else 'FALTA' end
union all
select 'cobros que hoy tienen solicitud de devolución encima (revisar a mano)',
       (select count(*)::text from public.pedidos p          -- las DOS señales, como el trigger:
         where p.dev_estado is not null and public.es_cobro_servicio(p.id));  -- los viejos también
