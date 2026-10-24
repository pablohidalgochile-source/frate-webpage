-- frate-cupos-fantasma.sql   ·   18-oct-2026   ·   NO CORRER SIN DECIDIR ANTES
--
-- Repone los cupos FANTASMA que dejó el doble retorno (arreglado en crear-pago v52,
-- pero el arreglo detiene la hemorragia: no repone lo ya inflado).
--
-- FANTASMA = cupos que la página todavía va a vender y que no existen.
--            = max(0, disponible - max(0, cupo_del_brief - vendidas))
-- NO es lo mismo que VENDIDAS DE MÁS (PREV 1 y PREV 2 MUJER): esas ya se pagaron,
-- la página ya ofrece cero, y ahí no hay nada que corregir. Tocarlas SUBIRÍA el
-- cupo de dos tramos agotados.
--
-- El cupo NO va escrito a mano: se lee del brief del evento, que es la fuente.
-- Las vendidas se cuentan sobre QR de pedidos PAGADOS — los QR nacen antes de
-- pagar, así que sin ese filtro se cuelan los carritos abandonados.
--
-- ⚠️ DECISIÓN DEL DUEÑO ANTES DE CORRER: esto baja PREV 3 MUJER + COVER de 12 a 3.
--    Con PREV 4 cerrada, las mujeres quedan casi sin nada que comprar para el 31.

begin;

with brief as (
  select ev.id evento_id, e->>'nombre' nom, (e->>'stock')::int cupo
    from eventos ev, jsonb_array_elements(ev.brief->'tickets') e
   where ev.id in (59, 60, 61)
), ventas as (
  select i.evento_id, i.nombre_ticket nom,
         sum(case when p.estado = 'pagado'
                  then coalesce(jsonb_array_length(i.qr_ids), i.cantidad, 0)
                  else 0 end) vend
    from items_pedido i
    join pedidos p on p.id = i.pedido_id
   where i.evento_id in (59, 60, 61)
   group by 1, 2
), objetivo as (
  select t.id,
         t.nombre,
         t.disponible as web_hoy,
         greatest(0, b.cupo - coalesce(v.vend, 0)) as real_quedan
    from tipos_ticket t
    join brief  b on b.nom = t.nombre and b.evento_id = t.evento_id
    left join ventas v on v.nom = t.nombre and v.evento_id = t.evento_id
   where t.estado = 'Activo'
)
update tipos_ticket t
   set disponible = o.real_quedan
  from objetivo o
 where t.id = o.id
   and o.web_hoy > o.real_quedan;   -- solo BAJA cupos fantasma, nunca sube

-- Revisar el resultado antes de confirmar. Debe decir 7 filas.
-- Si el número no es 7, hacer rollback y avisar.

commit;
