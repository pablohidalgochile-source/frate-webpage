-- === activar socio · PARTE 1 de 3 ===
-- En orden. Cada parte queda entera.

-- ============================================================
-- FRATE · CONVERTIR COMPRADORES EN SOCIOS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL NÚMERO QUE ORIGINA ESTO (medido hoy):
--     545 personas distintas te han comprado
--      23 tienen cuenta          ← 4%
--
-- O sea: 522 personas ya te pagaron, ya vinieron, y el sistema no las
-- reconoce cuando vuelven. No se les puede dar un beneficio, ni un
-- descuento, ni saber que son frecuentes.
--
-- ESTO HACE DOS COSAS AL CREAR LA CUENTA:
--   1. Le pega TODAS sus compras anteriores (por correo y por RUT).
--   2. Le abona un crédito de bienvenida, UNA sola vez.
--
-- El crédito se define en config_valores → `socio_credito_bienvenida`.
-- Se puede dejar en 0 y usar solo el reconocimiento del historial.
--
-- Idempotente. Se puede llamar mil veces: el crédito se da una vez.
-- ============================================================

-- ── 1) Cuánto se regala y la marca de "ya se le dio" ──
insert into public.config_valores(clave, valor)
select 'socio_credito_bienvenida', '2000'
where not exists (select 1 from public.config_valores where clave='socio_credito_bienvenida');

alter table public.clientes add column if not exists socio_activado_at timestamptz;
