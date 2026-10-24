-- 🌙 CERRAR SOLOS LOS EVENTOS · PARTE 2 de 2 — el reloj
-- Corre después de la parte 1.
--
-- La parte 1 dejó la función. Esto la pone a correr sola cada hora y
-- después te muestra, EN ENSAYO, a quiénes cerraría ahora mismo.

-- ── Que corra solo, cada hora ─────────────────────────────────────
-- Cada hora y no una vez al día: así el cierre cae cerca de las 05:00
-- reales y no depende de a qué hora se ejecute el trabajo diario.
create extension if not exists pg_cron;

select cron.unschedule('frate-cerrar-eventos')
where exists (select 1 from cron.job where jobname = 'frate-cerrar-eventos');

select cron.schedule('frate-cerrar-eventos', '7 * * * *',
                     $$ select public.eventos_cerrar_vencidos(false); $$);


-- ── Chequeo · ENSAYO: dice a quiénes cerraría, sin cerrar nada ────
-- De aquí en adelante el trabajo automático se hace cargo. Los que ya
-- están vencidos hoy los revisas con frate-eventos-vencidos-revision.sql
-- antes de dejar que esto los cierre.
select public.eventos_cerrar_vencidos(true) as ensayo;
