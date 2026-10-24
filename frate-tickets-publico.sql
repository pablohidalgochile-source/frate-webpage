-- ============================================================
-- FRATE · Campo "Público" del ticket (Mujer / Hombre / Universitario / Mixto)
-- Correr en el proyecto WEB (ydwlpraoaaijlfssevoh)
-- Valores: 'F'=Mujer · 'M'=Hombre · 'U'=Universitario · ''/NULL=Mixto (todos)
-- ------------------------------------------------------------
-- El dato viaja: catalogo_tickets → tipos_ticket → items_pedido.condiciones (jsonb, sin columna)
-- La puerta lo lee del snapshot condiciones; el storefront lo muestra al elegir el ticket.
-- ============================================================

alter table if exists public.catalogo_tickets  add column if not exists genero text;
alter table if exists public.tipos_ticket      add column if not exists genero text;
alter table if exists public.ticket_plantillas add column if not exists genero text;

comment on column public.catalogo_tickets.genero  is 'Público del ticket: F=Mujer, M=Hombre, U=Universitario, NULL/vacío=Mixto';
comment on column public.tipos_ticket.genero      is 'Público del ticket: F=Mujer, M=Hombre, U=Universitario, NULL/vacío=Mixto';
