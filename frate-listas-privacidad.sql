-- ═══════════════════════════════════════════════════════════════════
-- 🔒 LA TABLA `listas` SE ENTREGA COMPLETA A CUALQUIERA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- VERIFICADO EN VIVO (2026-08-04): con la llave pública, sin login,
-- cualquiera baja las 67 listas con sus 57 columnas. Eso incluye:
--
--   · codigo          → la lista COMPLETA de códigos. Con eso se abre
--                       frate.cl/lista/CUALQUIERA, incluidas las que
--                       nunca publicaste.
--   · notas, motivo_rechazo, rechazo_motivo  → comentarios internos
--   · aprobada_por, revisada_por, eliminada_por, historial → quién hizo qué
--   · hist_*, emitidas_n, cupos_zonas        → números operativos
--
-- No hay datos de invitados ahí (lista_inscritos ya devuelve 0 filas a
-- un desconocido, lo verifiqué). Pero los códigos sí son un problema:
-- son la llave para anotarse.
--
-- LA SOLUCIÓN: una vista pública con SOLO las columnas que la página
-- /lista/CODIGO necesita para funcionar, y la tabla base cerrada a
-- quien tenga sesión.
--
-- ⚠️ Las columnas de la vista salieron de leer lista.html y links.html,
--    no de adivinar. Si mañana la página usa una nueva, hay que
--    agregarla acá o se rompe la inscripción.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) La vista pública ────────────────────────────────────────────
-- `security_invoker = off` a propósito: corre con los permisos del dueño,
-- así un visitante sin sesión puede leer la lista a la que lo invitaron
-- aunque la tabla de abajo esté cerrada.
drop view if exists public.v_lista_publica;
create view public.v_lista_publica
with (security_invoker = off) as
select
  l.id, l.codigo, l.nombre, l.fecha, l.estado,
  l.condiciones, l.genero_esperado, l.valido_hasta, l.cupos, l.evento_id,
  l.duenio_nombre, l.inviter_nombre,
  l.closes_at, l.tipo, l.form_config, l.requires_manual_approval,
  l.cover_amount, l.benefit_text, l.allow_space_selection, l.allow_incomplete_data,
  l.floorplan_id, l.zona_id, l.hora_max_llegada, l.clase
from public.listas l
where l.eliminada_at is null;

grant select on public.v_lista_publica to anon, authenticated;

comment on view public.v_lista_publica is
  'Lo ÚNICO que ve un visitante sin sesión. Sin notas internas, sin quién aprobó, sin historial. Si /lista/CODIGO necesita una columna nueva, agregarla acá.';


-- ── 2) Cerrar la tabla base ────────────────────────────────────────
-- Antes cualquiera con la llave pública la bajaba entera.
alter table public.listas enable row level security;

drop policy if exists listas_public_read on public.listas;
drop policy if exists listas_anon_select on public.listas;
drop policy if exists "listas visibles" on public.listas;
drop policy if exists listas_select_all on public.listas;

drop policy if exists listas_read_sesion on public.listas;
create policy listas_read_sesion on public.listas for select
  to authenticated using (true);

-- Las escrituras ya estaban bloqueadas (probé insert con la llave pública:
-- HTTP 401 en las seis tablas). Esto solo deja explícito quién SÍ escribe.
drop policy if exists listas_write_staff on public.listas;
create policy listas_write_staff on public.listas for all
  to authenticated
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp','portero')))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp','portero')));


-- ── 3) Chequeo ─────────────────────────────────────────────────────
-- La vista tiene que traer filas y NO tener las columnas sensibles.
select
  (select count(*) from public.v_lista_publica)                       as listas_publicas,
  (select count(*) from information_schema.columns
     where table_name='v_lista_publica' and table_schema='public')    as columnas_vista,
  (select count(*) from information_schema.columns
     where table_name='listas' and table_schema='public')             as columnas_tabla,
  (select count(*) from information_schema.columns
     where table_name='v_lista_publica' and table_schema='public'
       and column_name in ('notas','motivo_rechazo','rechazo_motivo','historial',
                           'aprobada_por','revisada_por','eliminada_por'))
                                                                      as filtradas_que_quedan;
