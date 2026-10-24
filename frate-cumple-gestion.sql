-- ============================================================
-- FRATE · Centro de Cumpleaños & Reservas — datos de gestión
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
-- Agrega una columna 'gestion' (jsonb) a formularios para guardar
-- responsable, paquete, invitados, mesa, pago, cotización, etc.
-- El pipeline usa la columna 'estado' que ya existe (más etapas).
-- ============================================================

alter table if exists public.formularios add column if not exists gestion jsonb default '{}'::jsonb;

comment on column public.formularios.gestion is 'Gestión del cumple/reserva: {responsable, paquete, invitados, mesa, pago, monto, cotizacion, prox_contacto, lista_id}';

-- Índice para la agenda (buscar por fecha a celebrar dentro de datos)
create index if not exists formularios_estado_idx on public.formularios (tipo, estado, created_at desc);
