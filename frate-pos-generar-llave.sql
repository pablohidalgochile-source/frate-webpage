-- 🔑 GENERAR LA LLAVE DE UNA CAJA · córrelo UNA VEZ POR TERMINAL
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ LA LLAVE SE MUESTRA UNA SOLA VEZ, en el resultado de esta consulta.
--    Cópiala y mándasela a la sesión del POS por un canal privado.
--    Acá queda SOLO el hash: no hay forma de recuperarla después.
--    Si se pierde, se genera otra y se apaga la vieja.
--
-- 👉 CAMBIA 'caja1' por el `code` real del terminal (pos.terminals.code).

create extension if not exists pgcrypto with schema extensions;

with nueva as (
  select
    'caja1'::text as code,                       -- ⬅️ EDITA ESTO
    -- 32 bytes aleatorios en base64url (sin + / = para que viaje limpio
    -- en una cabecera HTTP)
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_') as secreto
),
armada as (
  select code, 'pos_' || code || '_' || secreto as llave from nueva
),
guardada as (
  insert into public.pos_llaves (code, key_hash, nota, creada_por)
  select code,
         encode(extensions.digest(llave, 'sha256'), 'hex'),
         'Generada desde el SQL editor',
         coalesce(current_setting('request.jwt.claim.email', true), 'admin')
  from armada
  returning id, code
)
select g.code                                   as terminal,
       a.llave                                  as "⚠️ COPIA ESTO AHORA",
       'Se guardó solo el hash. No se puede volver a ver.' as aviso
from guardada g cross join armada a;


-- ── Para apagar una llave vieja después de rotar ──────────────────
-- Descomenta cuando el POS confirme que ya está usando la nueva.
-- update public.pos_llaves
--    set activa = false, revocada_at = now()
--  where code = 'caja1' and activa
--    and id <> (select max(id) from public.pos_llaves where code = 'caja1');


-- ── Ver qué llaves hay (nunca muestra la llave, solo el hash) ──────
select code, activa, created_at::date as creada, last_used_at,
       left(key_hash, 10) || '…' as hash, nota
from public.pos_llaves
order by code, created_at desc;
