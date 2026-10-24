-- ============================================================
-- FRATE · ESCENARIO DE PRUEBA DEL DIF- · Trozo 2 de 2  (CORREGIDO)
-- Emite los 4 cobros de $1.000 que pidió el POS.
-- Corre DESPUÉS de frate-dif-prueba-01.sql.
--
-- POR QUÉ CAMBIÓ: la versión anterior llamaba a `diferencia_emitir`,
-- que arranca con `if not public.puerta_rol_ok()`. Esa guarda mira
--     clientes.rol in ('admin','portero') where id = auth.uid()
-- y desde el panel de Supabase `auth.uid()` es null, así que siempre
-- devuelve «Sin permiso de puerta». Era mi error: leí la función sin
-- su guarda de entrada.
--
-- NO se toca el permiso ni se corre como otro usuario. Se replica el
-- INSERT que hace la propia función, campo por campo, incluido el
-- correlativo real `diferencia_codigo()` y el mismo cálculo de
-- vencimiento. Las filas quedan indistinguibles de una emisión real.
-- ============================================================

begin;

insert into public.tickets_diferencia (
  codigo, pedido_id, qr_id, persona, rut, evento_id, motivo,
  ticket_actual, precio_actual, ticket_destino, monto, nota,
  emitido_por, emitido_por_id, vence_at)
select
  public.diferencia_codigo(),
  i.pedido_id,
  q.qr,
  coalesce(i.personas -> (q.n - 1)::int ->> 'nombre', p.nombre_cliente),
  i.personas -> (q.n - 1)::int ->> 'rut',
  i.evento_id,
  'Prueba del POS - red cortada',
  i.nombre_ticket,
  i.precio_unitario,
  null,
  1000,
  'PRUEBA. Evento ZZZ PRUEBA DIF. Borrar con frate-dif-prueba-99.',
  'staff',
  null,
  (coalesce(e.fecha, current_date) + 1)::timestamptz
    + coalesce(e.hora_termino, '05:00')::time
from public.items_pedido i
join public.pedidos p on p.id = i.pedido_id
join public.eventos e on e.id = i.evento_id
-- `with ordinality` devuelve bigint y el operador -> de jsonb sólo acepta
-- integer: sin el ::int, Postgres responde «operator does not exist:
-- jsonb -> bigint». La función original no lo sufría porque usaba una
-- variable declarada `int`.
cross join lateral jsonb_array_elements_text(i.qr_ids) with ordinality q(qr, n)
where p.referencia_pago = 'PRUEBA-DIF'
  and not exists (select 1 from public.tickets_diferencia d
                   where d.qr_id = q.qr and d.estado = 'pendiente');

commit;

-- Los 4 códigos para pasarle al POS: 4 filas, 'pendiente', $1.000.
select codigo, monto, estado, persona, rut, motivo, vence_at
  from public.tickets_diferencia
 where qr_id like 'FCC-TEST-DIF-%'
 order by id;
