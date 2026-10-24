-- ═══ carga histórica · PARTE 1 de 6 ═══
-- Corre las partes EN ORDEN. Cada una queda entera.

-- ═══════════════════════════════════════════════════════════════════
-- 📅 NOCHES QUE PASARON ANTES DE QUE LA APP LAS REGISTRARA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Pablo, 2026-08-03: «Jueves 2 de julio: 45 mujeres y 56 hombres que
-- ingresaron, que quemaron su QR. Cada lista tenía 100 inscritos.»
--
-- ⚠️ LO QUE **NO** SE HACE ACÁ: inventar 200 personas.
--    No existen esos 200 nombres ni sus RUT. Fabricarlos dejaría 200
--    fichas falsas en lista_inscritos y en Personas PARA SIEMPRE,
--    ensuciando frecuentes, duplicados y todo el CRM.
--
-- LO QUE SÍ: la noche se declara en AGREGADO, en la lista misma, con
--    una marca visible. En los reportes esas filas salen etiquetadas
--    «histórico» — un número escrito por una persona nunca se confunde
--    con uno que salió de un escáner.
--
-- Correr DESPUÉS de frate-rrpp-rendimiento.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) Los números declarados viven en la lista ────────────────────
alter table public.listas
  add column if not exists hist_inscritos int,
  add column if not exists hist_entraron  int,
  add column if not exists hist_mujeres   int,
  add column if not exists hist_hombres   int,
  add column if not exists hist_nota      text,
  add column if not exists hist_por       text,
  add column if not exists hist_at        timestamptz;

comment on column public.listas.hist_entraron is
  'Declarado a mano para una noche anterior a la app. NO salió del escáner.';


-- ── 2) La noche del 2 de julio ─────────────────────────────────────
insert into public.eventos (nombre, fecha, estado, activo, archivado)
select 'JUEVES 2 DE JULIO', date '2026-07-02', 'cerrado', false, false
where not exists (select 1 from public.eventos where fecha = date '2026-07-02');
