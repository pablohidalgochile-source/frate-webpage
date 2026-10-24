-- ============================================================
-- FRATE · ESCENARIO DE PRUEBA PARA EL TICKET DE DIFERENCIA (DIF-)
-- Trozo 1 de 2 · crea el escenario. El trozo 2 emite los 4 cobros.
--
-- POR QUÉ: `tickets_diferencia` tiene CERO filas en toda su historia.
-- Ese camino nunca se ha usado en producción, ni de este lado (emisión)
-- ni del lado del POS (cobro, donde hay un hueco conocido: si el cajero
-- cierra la pantalla y vuelve a entrar, hoy puede cobrar dos veces).
-- El POS quiere ejercitarlo con plata de mentira antes del 31.
--
-- NO SE VE AL PÚBLICO, por construcción y no por disciplina:
--   · el evento nace activo=false, y la portada filtra .eq('activo', true)
--     (frate-supabase.js:201), así que no aparece en index, /e/ ni /links;
--   · el tipo de ticket nace 'Oculto';
--   · el pedido va con total=0, y admin_kpi_ventas sólo suma total>0,
--     así que no entra a ningún KPI de ventas.
--
-- VERIFICADO ANTES DE ESCRIBIR ESTO:
--   · no hay NINGÚN trigger en pedidos, items_pedido ni qr_usados,
--     así que insertar esto no dispara ninguna sincronización al ERP;
--   · v_ingreso_total (la que mira el POS en vivo) no existe en esta
--     base, así que este pedido no puede tocar su tablero.
--
-- Para borrarlo todo después: frate-dif-prueba-99-limpiar.sql
-- ============================================================

begin;

-- 1 · El evento, en borrador y con nombre inequívoco.
insert into public.eventos (nombre, fecha, hora, hora_termino, ambiente,
                            descripcion, estado, activo)
values ('ZZZ PRUEBA DIF - NO PUBLICAR', date '2026-12-31', '23:00', '05:00',
        'Fuego', 'Escenario de prueba del ticket de diferencia. Borrar despues.',
        'creado', false)
on conflict do nothing;

-- 2 · Un tipo de ticket oculto, colgado de ese evento.
insert into public.tipos_ticket (evento_id, nombre, precio, disponible,
                                 estado, solo_web, max_por_compra)
select e.id, 'PRUEBA DIF - entrada', 10000, 10, 'Oculto', true, 6
  from public.eventos e
 where e.nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR'
   and e.fecha  = date '2026-12-31'
   and not exists (select 1 from public.tipos_ticket t
                    where t.evento_id = e.id
                      and t.nombre = 'PRUEBA DIF - entrada');

-- 3 · El pedido. total=0 a proposito: no entra a los KPI de venta.
insert into public.pedidos (nombre_cliente, email_cliente, estado, total,
                            total_pagado, referencia_pago)
select 'PRUEBA DIF', 'prueba-dif@frate.cl', 'pagado', 0, 0, 'PRUEBA-DIF'
 where not exists (select 1 from public.pedidos
                    where referencia_pago = 'PRUEBA-DIF');

-- 4 · La linea con 4 QR: uno por cada DIF- que va a emitir el trozo 2.
--     diferencia_emitir rechaza un segundo cobro pendiente sobre el MISMO
--     QR, asi que cuatro cobros necesitan cuatro QR distintos.
insert into public.items_pedido (pedido_id, evento_id, tipo_ticket_id,
                                 nombre_ticket, cantidad, precio_unitario,
                                 qr_ids, personas)
select p.id, e.id, t.id, 'PRUEBA DIF - entrada', 4, 10000,
       '["FCC-TEST-DIF-0-0-PRUEBA1","FCC-TEST-DIF-0-1-PRUEBA2",
         "FCC-TEST-DIF-0-2-PRUEBA3","FCC-TEST-DIF-0-3-PRUEBA4"]'::jsonb,
       '[{"nombre":"PRUEBA UNO","rut":"11.111.111-1"},
         {"nombre":"PRUEBA DOS","rut":"22.222.222-2"},
         {"nombre":"PRUEBA TRES","rut":"33.333.333-3"},
         {"nombre":"PRUEBA CUATRO","rut":"44.444.444-4"}]'::jsonb
  from public.pedidos p
  join public.eventos e on e.nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR'
                       and e.fecha  = date '2026-12-31'
  join public.tipos_ticket t on t.evento_id = e.id
                            and t.nombre = 'PRUEBA DIF - entrada'
 where p.referencia_pago = 'PRUEBA-DIF'
   and not exists (select 1 from public.items_pedido i
                    where i.pedido_id = p.id);

commit;

-- Control: tiene que decir 1 evento, 1 tipo, 1 pedido, 1 linea, 4 QR.
select (select count(*) from public.eventos
         where nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR')            as eventos,
       (select count(*) from public.pedidos
         where referencia_pago = 'PRUEBA-DIF')                     as pedidos,
       (select coalesce(jsonb_array_length(qr_ids), 0)
          from public.items_pedido i
          join public.pedidos p on p.id = i.pedido_id
         where p.referencia_pago = 'PRUEBA-DIF' limit 1)           as qrs;
