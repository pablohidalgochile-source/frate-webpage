-- FRATE · COBROS 03d · soltar los cobros que YA quedaron pegados a una cuenta
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · va DESPUÉS de frate-cobros-03c.
--
-- ⛔ ESTE ARCHIVO NO CAMBIA NADA TAL COMO ESTÁ. Lo que corre es SOLO el conteo de abajo, que
--    es de lectura. El `update` va comentado a propósito: toca filas de producción y esa
--    decisión es tuya, no mía. Para ejecutarlo hay que descomentarlo a mano.
--
-- QUÉ PROBLEMA QUEDA ABIERTO: el 03c evita que se peguen cobros NUEVOS, pero los que ya se
-- pegaron antes del parche siguen ahí. Como el conteo del «gastado» y de «compras» de
-- activar_socio barre todo lo que tenga cliente_id, a esa persona su cumpleaños de $300.000
-- le sigue apareciendo dentro de lo que gastó en entradas. Y si su ÚNICA orden pegada es el
-- cobro, `v_enlazadas > 0` le abre igual el bono de bienvenida el día que enciendas la lealtad.
--
-- Con el front nuevo esas órdenes se ven bien igual («Cumpleaños FRATE», sin botones) y sirven
-- de comprobante, así que no corre apuro. Soltarlas es higiene del Wrapped, no una urgencia.
--
-- Reversa del update: no la hay automática. Antes de correrlo, guarda los pares afectados:
--   create table if not exists public.bak_cobros_pegados as
--     select id, cliente_id from public.pedidos
--      where cliente_id is not null
--        and (coalesce(origen,'web') = 'crm'
--             or exists (select 1 from public.crm_pagos c where c.pedido_id = pedidos.id));
--   -- para devolverlos:  update public.pedidos p set cliente_id = b.cliente_id
--   --                      from public.bak_cobros_pegados b where b.id = p.id;

-- ① EL CONTEO PREVIO (esto SÍ se ejecuta: solo lee)
select 'cobros pegados a una cuenta · por `origen`' as chequeo,
       count(*)::text as cuantos,
       coalesce(sum(coalesce(total_pagado,0)),0)::text as plata_que_infla_el_gastado
  from public.pedidos
 where cliente_id is not null and coalesce(origen,'web') = 'crm'
union all
select 'cobros pegados · viejos, con origen «web» pero con fila en crm_pagos',
       count(*)::text,
       coalesce(sum(coalesce(total_pagado,0)),0)::text
  from public.pedidos p
 where p.cliente_id is not null and coalesce(p.origen,'web') <> 'crm'
   and exists (select 1 from public.crm_pagos c where c.pedido_id = p.id)
union all
select 'cuentas distintas afectadas', count(distinct cliente_id)::text, ''
  from public.pedidos p
 where p.cliente_id is not null
   and (coalesce(p.origen,'web') = 'crm'
        or exists (select 1 from public.crm_pagos c where c.pedido_id = p.id));

-- ② EL UPDATE · NO EJECUTADO. Descomenta las 5 líneas solo si decides soltarlos, y córrelo
--    fuera de venta (toca filas de `pedidos`). Las mismas dos señales de es_cobro_servicio.
--
-- set lock_timeout = '2s';
-- update public.pedidos p
--    set cliente_id = null
--  where p.cliente_id is not null
--    and (coalesce(p.origen,'web') = 'crm'
--         or exists (select 1 from public.crm_pagos c where c.pedido_id = p.id));
--
-- Después de correrlo, el conteo de ① tiene que dar 0 en las dos primeras filas.
