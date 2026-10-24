-- ============================================================
-- FRATE · Orden de los tickets en la compra (por evento)
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
-- Guarda el orden en que se muestran los tickets de un evento en frate.cl.
-- ============================================================

alter table if exists public.tipos_ticket add column if not exists orden int default 0;

comment on column public.tipos_ticket.orden is 'Orden de aparición en la compra (menor primero). Lo controla el admin desde el evento.';

create index if not exists tipos_ticket_orden_idx on public.tipos_ticket (evento_id, orden, id);
