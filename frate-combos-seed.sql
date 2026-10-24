-- ============================================================
-- FRATE — E: Combos + add-ons (aparecen en la vitrina de paquetes)
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- Requiere haber corrido antes frate-catalogo-seed.sql (índice único nombre + columna condiciones).
-- Idempotente (upsert por nombre). Edítalos/actívalos desde Admin → Paquetes.
-- ============================================================

insert into public.paquetes (categoria, nombre, descripcion, incluye, precio, condiciones, orden, activo) values

('combo', 'Combo Previa + Carrete',
 'Junta a tu grupo para la previa y entren juntos al carrete, con tarifa preferente y zona sugerida. Lo armamos a tu medida.',
 'Coordinación del grupo · Entrada + cover · Zona sugerida',
 0,
 '{"entrada":"general","pago":"convenir","nota":"Arma tu grupo para la previa y el ingreso juntos. A coordinar según cantidad."}'::jsonb,
 10, true),

('combo', 'Combo Facultad',
 'Tu facultad, carrera o generación carretea junta con tarifa de grupo recurrente y beneficios para quien organiza.',
 'Tarifa de grupo recurrente · Cortesías para el organizador · Zona',
 0,
 '{"entrada":"general","pago":"convenir","nota":"Descuento por grupo recurrente. Coordina con nosotros por WhatsApp."}'::jsonb,
 11, true),

('otro', 'Decoración temática',
 'Decoramos tu mesa o espacio para el cumpleaños o la despedida — globos, cartel y detalles según tu temática.',
 'Decoración de mesa/espacio · Temática a elección',
 0,
 '{"pago":"convenir","nota":"Decoración a coordinar según temática y espacio disponible."}'::jsonb,
 20, true),

('otro', 'Fotógrafo / Contenido',
 'Un fotógrafo captura tu noche y te entregamos el contenido digital para revivir el carrete y tus redes.',
 'Sesión de fotos/video de tu grupo · Entrega digital',
 0,
 '{"pago":"convenir","nota":"Cobertura y entrega a coordinar."}'::jsonb,
 21, true),

('otro', 'Transporte / Van',
 'Coordinamos transporte para que tu grupo llegue junto y seguro al carrete.',
 'Van para tu grupo · Sujeto a disponibilidad y zona',
 0,
 '{"pago":"convenir","nota":"Sujeto a disponibilidad, cantidad y zona."}'::jsonb,
 22, true)

on conflict (nombre) do update set
  categoria=excluded.categoria, descripcion=excluded.descripcion, incluye=excluded.incluye,
  precio=excluded.precio, condiciones=excluded.condiciones, orden=excluded.orden, updated_at=now();

select categoria, count(*) from public.paquetes where categoria in ('combo','otro') group by categoria;
