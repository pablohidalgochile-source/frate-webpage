-- ============================================================
-- FRATE · BORRAR el escenario de prueba del DIF-
-- Corre esto cuando el POS termine de ensayar. Deja la base como
-- estaba: ni el evento, ni el tipo, ni el pedido, ni los cobros.
--
-- El orden importa: primero lo que cuelga, al final el evento.
-- Todo está acotado por el evento de prueba y por la referencia
-- 'PRUEBA-DIF', así que no puede alcanzar nada real.
-- ============================================================

begin;

delete from public.tickets_diferencia
 where qr_id like 'FCC-TEST-DIF-%';

delete from public.items_pedido
 where pedido_id in (select id from public.pedidos
                      where referencia_pago = 'PRUEBA-DIF');

delete from public.pedidos
 where referencia_pago = 'PRUEBA-DIF';

delete from public.tipos_ticket
 where evento_id in (select id from public.eventos
                      where nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR'
                        and fecha  = date '2026-12-31');

delete from public.eventos
 where nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR'
   and fecha  = date '2026-12-31';

commit;

-- Control: los cuatro tienen que dar 0.
select (select count(*) from public.tickets_diferencia
         where qr_id like 'FCC-TEST-DIF-%')                  as cobros,
       (select count(*) from public.pedidos
         where referencia_pago = 'PRUEBA-DIF')               as pedidos,
       (select count(*) from public.eventos
         where nombre = 'ZZZ PRUEBA DIF - NO PUBLICAR')      as eventos,
       (select count(*) from public.items_pedido i
          join public.pedidos p on p.id = i.pedido_id
         where p.referencia_pago = 'PRUEBA-DIF')             as lineas;
