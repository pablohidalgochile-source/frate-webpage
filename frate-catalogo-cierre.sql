-- ============================================================
-- FRATE — Catálogo de tickets: "hasta qué hora se puede comprar"
-- (cierre de venta). Se copia a tipos_ticket.vence_hora al usar el
-- ticket en un evento. Correr en el Supabase de la WEB (ydwlpra…).
-- Idempotente.
-- ============================================================

alter table public.catalogo_tickets add column if not exists cierre_venta text;

-- (tipos_ticket ya tiene descripcion, instrucciones, hora_max_ingreso, vence_hora
--  y condiciones — no requiere cambios.)

select 'catalogo_tickets.cierre_venta' as check,
       case when exists(select 1 from information_schema.columns
                        where table_name='catalogo_tickets' and column_name='cierre_venta')
            then 'OK' else 'FALTA' end;
