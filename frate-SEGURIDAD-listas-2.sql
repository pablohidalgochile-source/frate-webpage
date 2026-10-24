-- 🔒 LA POLÍTICA QUE SE ME PASÓ EN `listas`
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- El SQL anterior cerró dos de tres hoyos. `listas` siguió abierta porque
-- la política que la abre se llama distinto de las que dropeé:
--
--   listas_publico_aprobadas → for select using (estado = 'aprobada')
--     sin restricción de rol ⇒ CUALQUIER anónimo lee todas las aprobadas.
--
--   listas_read_sesion → to authenticated using (true)
--     ⇒ cualquiera con cuenta lee TODAS las listas, no solo las suyas.
--
-- ⚠️ ANTES DE CORRER, LEE ESTO:
--    La página pública de inscripción usa la vista `v_lista_publica`, y
--    comprobé que la vista responde. PERO no pude comprobar si la vista
--    funciona GRACIAS a esta política o a pesar de ella: eso depende de
--    cómo se creó la vista, y no lo puedo ver sin la llave de servicio.
--
--    Entonces: corre esto y AVÍSAME. Verifico en 10 segundos que la
--    página de inscripción siga funcionando. Si se rompió, al final de
--    este archivo está la línea para devolverla.

drop policy if exists listas_publico_aprobadas on public.listas;
drop policy if exists "listas_publico_aprobadas" on public.listas;
drop policy if exists listas_read_sesion on public.listas;

-- La dueña sigue viendo lo suyo (esto NO se toca: es el portal RRPP).
drop policy if exists listas_rrpp_read on public.listas;
create policy listas_rrpp_read on public.listas for select
  using (duenio_id = auth.uid()
         or auth.uid() = any(coalesce(co_duenios, '{}'::uuid[])));


-- ── Chequeo · qué políticas quedan vivas ───────────────────────────
select policyname   as politica,
       cmd          as operacion,
       coalesce(array_to_string(roles, ', '), 'todos') as para_quien,
       case when qual ilike '%auth.uid()%' then '✅ mira quién eres'
            when qual ilike '%true%'       then '⚠️ deja pasar a todos'
            else qual end                  as condicion
from pg_policies
where schemaname = 'public' and tablename = 'listas'
order by policyname;


-- ── SI SE ROMPIÓ LA INSCRIPCIÓN, devuélvela con esto ──────────────
-- (descoméntalo y córrelo solo si hace falta)
--
--   create policy listas_publico_aprobadas on public.listas
--     for select using (estado = 'aprobada');
