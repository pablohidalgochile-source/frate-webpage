-- === interruptor de lealtad · PARTE 1 de 3 ===
-- En orden. Arranca APAGADO.

-- ═══════════════════════════════════════════════════════════════════
-- 🔌 UN INTERRUPTOR DE VERDAD PARA PUNTOS Y PREMIOS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Pablo, 2026-08-04: «no puedo empezar con membresías y lealtad esta semana».
--
-- Un interruptor que solo viva en la pantalla sería decorativo: la plata
-- y los puntos se reparten en CUATRO lugares, y ninguno pasa por el admin.
--
--   1. activar_socio()          → el crédito de bienvenida       (base)
--   2. canjear_premio()         → descuenta puntos y da el premio(base)
--   3. mp-webhook               → puntos al pagar con MercadoPago(edge)
--   4. khipu-webhook            → puntos al pagar por transferencia(edge)
--
-- Este archivo tapa los DOS de la base. Los dos webhooks van aparte,
-- en su propio despliegue.
--
-- ⚠️ Arranca APAGADO a propósito. Nadie recibe nada hasta que Pablo lo
--    encienda desde Puntos & Premios.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) El interruptor ──────────────────────────────────────────────
insert into public.config_valores(clave, valor)
select 'lealtad_on', 'false'
where not exists (select 1 from public.config_valores where clave='lealtad_on');

create or replace function public.lealtad_activa()
returns boolean language sql stable set search_path = public as $$
  select coalesce(
    (select lower(btrim(valor)) in ('true','1','si','sí','on')
     from public.config_valores where clave='lealtad_on'),
    false)   -- sin fila = apagado. Nunca se reparte plata por omisión.
$$;
grant execute on function public.lealtad_activa() to anon, authenticated;

comment on function public.lealtad_activa is
  'El interruptor maestro de lealtad. Lo consultan activar_socio, canjear_premio y los dos webhooks de pago.';
