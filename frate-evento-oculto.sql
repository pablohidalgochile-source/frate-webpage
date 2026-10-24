-- ============================================================
-- FRATE — Ocultar/mostrar un evento del público SIN cambiar su estado
-- ------------------------------------------------------------
-- Agrega la columna `oculto_publico` a la tabla eventos.
--   • true  = no aparece en frate.cl ni en /links (el link directo
--              /e/<slug> SIGUE funcionando, y el estado real del
--              evento — publicado / en_vivo / etc. — no se toca).
--   • false = visible normal (valor por defecto).
--
-- Se controla con el botón 🙈 / 👁️ que está en cada fila de la
-- lista de eventos del admin. Correr una sola vez en el proyecto WEB.
-- Es idempotente: se puede correr de nuevo sin problema.
-- ============================================================

alter table public.eventos
  add column if not exists oculto_publico boolean not null default false;

comment on column public.eventos.oculto_publico is
  'true = ocultar del público (frate.cl y /links) sin cambiar el estado; el link directo /e/ sigue activo.';

-- Índice parcial chico para filtrar rápido los visibles (opcional pero barato).
create index if not exists idx_eventos_oculto_publico
  on public.eventos (oculto_publico)
  where oculto_publico = true;
