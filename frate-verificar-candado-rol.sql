-- ═══════════════════════════════════════════════════════════════════
-- 🔎 VERIFICAR EL CANDADO DEL ROL · solo lecturas, no cambia nada
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Son cuatro SELECT. No modifican ni una fila. Pégalos y mándame el
-- resultado de los cuatro.
--
-- POR QUÉ: la política `cliente_update_own` es
--     for update using (auth.uid() = id)
-- sin `with check`. Sola, esa política deja que cualquiera se cambie el
-- rol a 'admin' en su propia fila. Lo que lo impide es el trigger
-- `trg_proteger_rol`. Necesito confirmar que está PEGADO a la tabla,
-- no solo que el archivo se corrió alguna vez.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) ¿El trigger está puesto sobre clientes? ─────────────────────
-- Esperado: UNA fila, tgenabled = 'O' (activo).
-- Si sale vacío → EL CANDADO NO ESTÁ y hay que correr
-- frate-SEGURIDAD-admins.sql de inmediato.
select t.tgname                                as trigger,
       c.relname                               as tabla,
       p.proname                               as funcion,
       case t.tgenabled when 'O' then 'activo'
                        when 'D' then '⚠️ DESACTIVADO'
                        else t.tgenabled::text end as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where c.relname = 'clientes' and not t.tgisinternal;


-- ── 2) ¿Qué dice current_user_is_admin() por dentro? ───────────────
-- No está en ningún .sql (se creó desde el dashboard). Quiero ver que
-- lea el rol de la tabla y no algo del token, que sí se puede falsear.
select p.proname                                        as funcion,
       case when p.prosecdef then 'security definer'
            else 'invoker' end                          as tipo,
       pg_get_functiondef(p.oid)                        as cuerpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_user_is_admin','tg_proteger_rol');


-- ── 3) Las políticas de clientes, tal como quedaron ────────────────
-- Mira la de UPDATE: si `with_check` sale vacío, Postgres usa la misma
-- de `using`, que solo compara el id. O sea: la columna `rol` queda
-- suelta y el único freno es el trigger de arriba.
select policyname, cmd, qual as using_, with_check
from pg_policies
where schemaname = 'public' and tablename = 'clientes'
order by cmd, policyname;


-- ── 4) ¿Quiénes son admin hoy? ─────────────────────────────────────
-- Deberían ser solo los tuyos. Si aparece alguien que no reconoces,
-- avísame antes de tocar nada.
select id, username, email, rol, created_at
from public.clientes
where coalesce(rol,'usuario') <> 'usuario'
order by created_at desc;
