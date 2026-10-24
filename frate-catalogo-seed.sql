-- ============================================================
-- FRATE — Catálogo real: paquetes Cumpleaños + Despedida + condiciones
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- Idempotente: se puede correr varias veces (upsert por nombre).
-- Preserva fotos/activo/destacado si ya editaste el paquete.
-- ============================================================

-- 1) Campo de condiciones estructuradas
alter table public.paquetes add column if not exists condiciones jsonb;

-- 2) Índice único por nombre (para el upsert)
create unique index if not exists paquetes_nombre_key on public.paquetes (nombre);

-- 3) Carga / actualiza el catálogo real
insert into public.paquetes (categoria, nombre, descripcion, incluye, precio, condiciones, orden, activo) values

-- ── CUMPLEAÑOS ──
('cumple', 'Carreteo Solito',
 'Si cumples años la semana del evento, entras gratis con 1 acompañante llegando antes de las 00:30. Presenta tu cédula en puerta (presencial, no sirve foto).',
 'Cumpleañero + 1 acompañante GRATIS · Trago de cortesía',
 0,
 '{"entrada":"general","personas":1,"gratis":1,"hora_limite":"00:30","trago_cortesia":true,"pago":"puerta","nota":"Cédula en puerta, presencial (no foto). Beneficio válido hasta las 00:30."}'::jsonb,
 1, true),

('cumple', 'Carrete Lista Gratuita',
 'Jueves: cumpleañero + 14 personas gratis. Viernes y sábado: cumpleañero + 4 personas gratis. Hasta las 00:30.',
 'Lista gratuita · Trago de cortesía · Entrada general',
 0,
 '{"entrada":"general","hora_limite":"00:30","trago_cortesia":true,"dias":["jueves","viernes","sabado"],"nota":"Jueves: cumpleañero +14 gratis · Vie/Sáb: cumpleañero +4 gratis. Lista y pago hasta las 18:00 del mismo día."}'::jsonb,
 2, true),

('cumple', 'Carrete Low Cost',
 'Lista de invitados: cumpleañero + 9 personas a $7.000 c/u con cover M (500cc). Cumpleañero + 1 acompañante entran gratis. Válido hasta las 00:30.',
 'Cumpleañero + 9 personas · Cover M (500cc) · Cumpleañero +1 gratis · $7.000 c/u',
 7000,
 '{"entrada":"general","personas":9,"gratis":1,"hora_limite":"00:30","pago":"previo","nota":"$7.000 por persona. Lista y pago hasta las 18:00 del mismo día del evento."}'::jsonb,
 3, true),

('cumple', 'Carrete Reservados',
 'Reserva tu espacio con pack de botella. Coordínalo con nosotros y ármalo a tu medida.',
 'Espacio reservado · Pack de botella a elección',
 0,
 '{"entrada":"vip","pago":"convenir","nota":"Reserva de espacio + pack de botella. A coordinar con nosotros."}'::jsonb,
 4, true),

-- ── DESPEDIDA DE SOLTER@S ──
('despedida', 'Pack ¡Chao Soltería!',
 '¡Chao soltería! Arma tu pack de consumo para Novi@ + 9 personas (máximo). Entrada general, válido hasta las 00:30.',
 'Novi@ + 9 personas · Pack de consumo · Entrada general',
 0,
 '{"entrada":"general","personas":9,"hora_limite":"00:30","pago":"previo","nota":"Pago previo por WebPay. Máximo 10 personas (Novi@ + 9)."}'::jsonb,
 1, true),

('despedida', 'Despedida Low Cost',
 'Lista de invitados Novi@ + 9 personas (máximo). Novi@ entra gratis + cover de regalo. Invitad@s $13.000 c/u, todos reciben cover. Hasta las 00:30.',
 'Novi@ gratis + cover de regalo · Invitad@s $13.000 c/u con cover · Entrada general',
 13000,
 '{"entrada":"general","personas":9,"gratis":1,"hora_limite":"00:30","pago":"previo","nota":"Novi@ gratis + cover. Invitad@s $13.000 c/u. Pago previo por WebPay."}'::jsonb,
 2, true),

('despedida', 'Privado de Novi@',
 'Reserva un espacio privado con pack de botella para la despedida. Coordínalo con nosotros.',
 'Espacio reservado · Pack de botella',
 0,
 '{"entrada":"vip","pago":"convenir","nota":"Reserva de espacio + pack de botella. A coordinar con nosotros."}'::jsonb,
 3, true)

on conflict (nombre) do update set
  categoria    = excluded.categoria,
  descripcion  = excluded.descripcion,
  incluye      = excluded.incluye,
  precio       = excluded.precio,
  condiciones  = excluded.condiciones,
  orden        = excluded.orden,
  updated_at   = now();
  -- (no toca foto_url, fotos, destacado ni activo: preserva tus ediciones)

-- 4) Verificación
select categoria, nombre, precio, condiciones->>'entrada' as entrada, condiciones->>'hora_limite' as hasta
from public.paquetes where categoria in ('cumple','despedida') order by categoria, orden;
