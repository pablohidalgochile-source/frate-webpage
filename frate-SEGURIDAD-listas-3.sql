-- 🔒 LISTAS · el intento anterior se deshizo entero. Este no toca nada más.
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- QUÉ PASÓ CON EL ANTERIOR:
--   El editor de Supabase corre todo en UNA transacción. Yo metí un
--   `create policy` que nombraba la columna `co_duenios`, que no existe
--   en tu base. Esa sentencia falló y se deshicieron TODAS las demás,
--   incluidos los `drop policy` que sí importaban. Por eso el listado te
--   mostró las políticas intactas: no es que no funcionaran, es que
--   nunca llegaron a correr.
--
--   Este archivo solo BORRA. No crea nada, no nombra ninguna columna,
--   así que no hay nada que pueda fallar y arrastrar al resto.
--
-- LAS DOS QUE SOBRAN, según tu propio listado:
--   listas_publico_aprobadas · SELECT · para «public» · using (estado='aprobada')
--     ⇒ cualquier anónimo lee TODAS las listas aprobadas, con dueña y fecha.
--   listas_read_sesion · SELECT · para «authenticated» · using (true)
--     ⇒ cualquiera con cuenta lee TODAS las listas, no solo las suyas.
--
-- LAS QUE SE QUEDAN (están bien, no las toco):
--   listas_admin_all   · admin
--   listas_staff       · admin/rrpp/portero
--   listas_write_staff · admin/rrpp/portero
--   listas_rrpp_read   · la dueña ve lo suyo
--
-- ⚠️ APENAS LO CORRAS, AVÍSAME. Verifico en segundos que la página de
--    inscripción siga funcionando. La vista `v_lista_publica` es la que
--    usa el público, y todavía no sé si depende de esta política. Si se
--    rompe, la última línea comentada la devuelve.

drop policy if exists listas_publico_aprobadas on public.listas;
drop policy if exists listas_read_sesion       on public.listas;


-- ── Chequeo · lo que queda vivo ────────────────────────────────────
select policyname as politica,
       cmd        as operacion,
       coalesce(array_to_string(roles, ', '), 'todos') as para_quien,
       case when qual = 'true' then '⚠️ deja pasar a todos'
            when qual like '%auth.uid()%' then '✅ mira quién eres'
            else '· ' || left(qual, 40) end as condicion
from pg_policies
where schemaname = 'public' and tablename = 'listas'
order by policyname;


-- ── SI SE ROMPIÓ LA INSCRIPCIÓN ────────────────────────────────────
--   create policy listas_publico_aprobadas on public.listas
--     for select using (estado = 'aprobada');
