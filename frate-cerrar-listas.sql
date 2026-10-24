-- 🔒 CERRAR LA ÚNICA FILTRACIÓN ABIERTA  ·  proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- EL PROBLEMA:
--   `v_lista_publica` se creó con security_invoker = off, así que la vista
--   SE SALTA la RLS de la tabla. Cerrar `listas` no sirvió de nada: cualquiera
--   con la llave pública puede pedir la vista SIN filtro y recibir TODAS las
--   listas con su código. Con un código se entra gratis a una cortesía abierta.
--
--   Comprobado en vivo el 19-ago: saqué los códigos del jueves desde afuera.
--
-- LA IDEA:
--   La vista no desaparece — la usan dos páginas y la necesitan. Lo que cambia
--   es QUIÉN puede leerla: ya no el público, sino dos funciones que EXIGEN el
--   código. Sin código no hay respuesta, así que no se puede enumerar.
--
-- ⚠️ ORDEN: esto va DESPUÉS de desplegar la web (ya está desplegada). Las
--    páginas llaman primero a la función y solo caen a la vista si no existe.


-- ── 1 · La ficha de UNA lista, por su código ──────────────────────
-- `setof v_lista_publica` copia la forma exacta de la vista: si mañana le
-- agregas una columna, la función la entrega sola.
create or replace function public.lista_publica(p_codigo text)
returns setof public.v_lista_publica
language sql stable security definer set search_path = public as $$
  select * from public.v_lista_publica where codigo = p_codigo limit 1
$$;

revoke execute on function public.lista_publica(text) from public;
grant  execute on function public.lista_publica(text) to anon, authenticated;


-- ── 2 · El estado de un puñado de códigos ─────────────────────────
-- Lo usa /links para marcar "LISTA CERRADA" en el linktree. Tope de 40 para
-- que no se convierta en la misma puerta de enumeración por otro lado.
create or replace function public.listas_estado(p_codigos text[])
returns table (codigo text, estado text)
language sql stable security definer set search_path = public as $$
  select l.codigo::text, l.estado::text
  from public.listas l
  where l.codigo = any (p_codigos[1:40])
$$;

revoke execute on function public.listas_estado(text[]) from public;
grant  execute on function public.listas_estado(text[]) to anon, authenticated;


-- ── 3 · Y recién ahora se cierra la vista ─────────────────────────
revoke select on public.v_lista_publica from anon, authenticated;


-- ── Chequeo · quién puede leer la vista y quién las funciones ─────
select 'vista v_lista_publica' as objeto,
       coalesce(string_agg(g.grantee, ', ' order by g.grantee), 'NADIE — cerrada ✅') as puede_leer
from information_schema.role_table_grants g
where g.table_schema = 'public' and g.table_name = 'v_lista_publica'
  and g.privilege_type = 'select' and g.grantee in ('anon','authenticated')
union all
select 'función ' || p.proname,
       coalesce(string_agg(a.rolname, ', ' order by a.rolname), 'nadie ⚠️')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
left join pg_roles a on a.rolname in ('anon','authenticated')
  and has_function_privilege(a.rolname, p.oid, 'execute')
where p.proname in ('lista_publica','listas_estado')
group by p.proname;
