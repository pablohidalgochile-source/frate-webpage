-- ═══════════════════════════════════════════════════════════════════
-- 🚨 `personas_upsert` la puede ejecutar CUALQUIERA con la llave pública
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- CÓMO SE ENCONTRÓ (2026-08-05): la llamé desde afuera, sin sesión, con
-- la misma llave que va en el navegador. Respondió 204 y escribió.
--
-- POR QUÉ IMPORTA: es `security definer`, así que se salta la RLS por
-- diseño, y hace UPSERT por RUT y por correo. O sea, alguien podría
-- sobreescribirle el nombre, el teléfono o el Instagram a una persona
-- real del CRM, o llenar la tabla de basura. No hace falta ser hacker:
-- basta abrir el código del navegador, que es público como toda la web.
--
-- La auditoría anterior revisó tablas (todas dieron 401 al escribir) y
-- RPC de lectura, pero NO probó escribir por RPC. Los `security definer`
-- se saltan la RLS y necesitan su propio candado.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) Limpiar la fila que dejó la prueba ──────────────────────────
select id, nombre, rut, origen, updated_at
from public.personas where nombre = '__probe__';

delete from public.personas where nombre = '__probe__';


-- ── 2) Cerrarla ────────────────────────────────────────────────────
-- Busca la firma sola: si tiene más de una versión, las cierra todas.
-- Escribir la firma a mano falla con «function does not exist» al primer
-- argumento que no calce.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'personas_upsert'
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
    raise notice 'cerrada: %', r.sig;
  end loop;
end $$;


-- ── 3) El mismo problema en otras funciones que escriben ───────────
-- Lista los `security definer` que PUBLIC todavía puede ejecutar, para
-- revisarlas una por una. No las toca: solo las muestra.
select p.oid::regprocedure                                   as funcion,
       case when p.prosecdef then '⚠️ security definer' else 'invoker' end as tipo,
       has_function_privilege('anon', p.oid, 'EXECUTE')      as la_puede_llamar_un_anonimo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
