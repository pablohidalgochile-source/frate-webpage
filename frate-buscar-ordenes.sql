-- ============================================================
-- FRATE — Buscar órdenes por INVITADO / RUT / correo (no solo el comprador)
-- ------------------------------------------------------------
-- La búsqueda de órdenes del admin usa esta función: encuentra la orden
-- aunque la persona buscada sea un invitado dentro de la compra (personas),
-- o por su RUT, no solo por el nombre/correo del comprador.
-- Devuelve los IDs de pedido que calzan. Correr una vez en el proyecto WEB.
-- ============================================================

create or replace function public.buscar_ordenes_ids(q text)
returns table(id bigint)
language sql
stable
as $$
  select distinct p.id
  from public.pedidos p
  left join public.items_pedido ip on ip.pedido_id = p.id
  where p.nombre_cliente ilike '%'||q||'%'
     or p.email_cliente  ilike '%'||q||'%'
     or ip.nombre_asistente ilike '%'||q||'%'
     or ip.rut_asistente    ilike '%'||q||'%'
     or replace(coalesce(ip.rut_asistente,''),'.','') ilike '%'||replace(q,'.','')||'%'
     or exists (
          select 1
          from jsonb_array_elements(coalesce(ip.personas::jsonb,'[]'::jsonb)) e
          where e->>'nombre' ilike '%'||q||'%'
             or e->>'email'  ilike '%'||q||'%'
             or e->>'rut'    ilike '%'||q||'%'
             or replace(coalesce(e->>'rut',''),'.','') ilike '%'||replace(q,'.','')||'%'
        )
  limit 400;
$$;

-- Permitir que el admin (usuario autenticado) la llame
grant execute on function public.buscar_ordenes_ids(text) to authenticated;
