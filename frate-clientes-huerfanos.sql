-- ════════════════════════════════════════════════════════════════
-- FRATE — Cuentas huérfanas: existen en auth.users pero NO en clientes
--
-- EL PROBLEMA (20-oct-2026): 170 personas con cuenta no podían comprar.
-- `pedidos.cliente_id` tiene FK a `clientes.id`, pero el registro crea la
-- fila de clientes en un SEGUNDO paso desde el navegador (index.html:3839).
-- Si ese paso falla, la cuenta queda huérfana y revienta:
--     insert or update on table "pedidos" violates foreign key constraint
--     "pedidos_cliente_id_fkey"
-- Hay 22 tablas con FK a clientes: tampoco podían votar, ni entrar a grupos.
--
-- YA ARREGLADO EN CÓDIGO (crear-pago v55, 20-oct): si al comprar falta la
-- fila, se crea al vuelo. Las ventas ya NO se pierden. Esto de acá es el
-- arreglo de raíz, OPCIONAL, y con dos efectos secundarios: léelos.
-- ════════════════════════════════════════════════════════════════

-- ── PARTE A · ¿cuántos hay ahora? (solo mira, no cambia nada) ──
select (select count(*) from auth.users)                         as en_auth,
       (select count(*) from public.clientes)                    as en_clientes,
       (select count(*) from auth.users u
          left join public.clientes c on c.id = u.id
         where c.id is null)                                     as huerfanos;


-- ── PARTE B · rellenar las 170 que ya están huérfanas ──────────
-- ⚠️ EFECTO SECUNDARIO QUE TIENES QUE DECIDIR:
--    hoy "miembros" en las campañas de correo = filas de `clientes` (948).
--    Si corres esto, pasan a ser 1.118. La PRÓXIMA campaña a "miembros"
--    le llegaría a 170 personas más, que nunca habían recibido correo.
--    Si eso te parece bien, córrelo. Si no, déjalo: el arreglo de
--    crear-pago ya evita que se pierdan ventas.

insert into public.clientes (id, email)
select u.id, coalesce(u.email, '')
  from auth.users u
  left join public.clientes c on c.id = u.id
 where c.id is null
on conflict (id) do nothing;

-- comprobación: debe quedar en 0
select count(*) as huerfanos_despues
  from auth.users u
  left join public.clientes c on c.id = u.id
 where c.id is null;


-- ── PARTE C · que no vuelva a pasar nunca ──────────────────────
-- ⚠️ NO CORRAS ESTO SOLO. Necesita un cambio en index.html primero.
--    Hoy el registro hace `insert` en clientes (index.html:3839). Si este
--    trigger ya creó la fila, ESE insert falla por llave duplicada y la
--    persona se queda SIN nombres, apellidos ni username.
--    El cambio es de una palabra: insert → upsert con onConflict:'id'.
--    Avísame y lo hago; después corres esto.

create or replace function public.fn_cliente_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clientes (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
exception when others then
  -- pase lo que pase, el registro NO se bloquea
  return new;
end;
$$;

drop trigger if exists tg_cliente_al_registrarse on auth.users;

create trigger tg_cliente_al_registrarse
after insert on auth.users
for each row execute function public.fn_cliente_al_registrarse();

-- ── Para revertir la PARTE C ───────────────────────────────────
-- drop trigger if exists tg_cliente_al_registrarse on auth.users;
-- drop function if exists public.fn_cliente_al_registrarse();
