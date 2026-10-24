-- ============================================================
-- FRATE — ACTIVAR VIRALIDAD
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
--
-- Prende la pestaña "Puntos" en la cuenta y carga premios de
-- arranque. El resto de la viralidad (ranking, referidos, grupos,
-- cumpleañero) ya está activo. Todo editable después en el admin.
--
-- Economía: 1 punto por cada $100 gastado (config: puntos_pesos_por_punto).
--   → 100 pts = $10.000 gastados · 500 pts = $50.000 gastados.
-- ============================================================

-- 1) Prender la pestaña "Puntos" en la cuenta del usuario
update config_sitio set visible = true where clave = 'cuenta_puntos';

-- 2) Premios de arranque (edítalos/bórralos a gusto en Admin → Puntos & Premios)
--    tipo 'beneficio' = perk físico en la puerta/barra · tipo 'credito' = suma $ a la cuenta
insert into public.premios (nombre, descripcion, costo_puntos, tipo, valor, stock, activo, orden) values
  ('Paso preferente',         'Sáltate la fila una noche. Muestra este premio en la puerta.',        150, 'beneficio',    0, null,  true, 1),
  ('Trago de la casa gratis', 'Un trago de la casa gratis en la barra. Canjea con tu código.',        300, 'beneficio',    0, null,  true, 2),
  ('$3.000 de crédito',       'Sumamos $3.000 de crédito a tu cuenta para tu próxima entrada.',       400, 'credito',   3000, null,  true, 3),
  ('Entrada General gratis',  'Una entrada General liberada para el evento que elijas.',              600, 'beneficio',    0, null,  true, 4),
  ('Mesa VIP por una noche',  'Reserva de mesa VIP para ti y tu grupo, sujeta a disponibilidad.',    1200, 'beneficio',    0,    4,  true, 5);

-- 3) Verificación
select 'cuenta_puntos visible' as check, visible::text from config_sitio where clave='cuenta_puntos'
union all
select 'premios activos', count(*)::text from premios where activo = true;

-- ============================================================
-- LISTO. En Admin → Puntos & Premios ajustas costos, agregas o
-- borras premios. La pestaña "Puntos" ya aparecerá en la cuenta.
-- ============================================================
