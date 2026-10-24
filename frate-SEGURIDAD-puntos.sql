-- 🔒 TRES HOYOS · el de puntos es el que revienta al encender la lealtad
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- ⚠️ NADA DE ESTO TOCA LA LEALTAD NI EL CANON. Es higiene: cierra
--    puertas que ya están abiertas. Se puede correr con la lealtad
--    apagada, hoy, sin decidir nada del programa.
--
-- VERIFIQUÉ ANTES DE ESCRIBIR, para no romperte nada:
--   · `api-crm` llama loyalty_de_rut con la LLAVE DE SERVICIO, que
--     ignora los permisos de rol → revocarla a usuarios no la afecta.
--   · `lista.html` lee primero `v_lista_publica`, que existe y responde
--     → cerrar la tabla base no rompe la página de inscripción.


-- ── 1) El grande: cualquiera con cuenta puede escribirse puntos ────
-- La política de update no tiene `with check`, así que Postgres reusa
-- la condición de lectura y deja pasar la escritura. Y el trigger que
-- protege rol, crédito y membresía NO incluye `puntos`.
-- Hoy no duele porque la economía está apagada. El día que la enciendas:
-- alguien se pone puntos desde el navegador y los canjea por crédito.

drop policy if exists cliente_update_own on public.clientes;
create policy cliente_update_own on public.clientes
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.tg_proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; es_admin boolean;
begin
  uid := auth.uid();
  if uid is null then return new; end if;          -- backend confiable
  select exists(select 1 from public.clientes where id = uid and rol = 'admin') into es_admin;
  if es_admin then return new; end if;
  if tg_op = 'INSERT' then
    new.rol := 'usuario';
  else
    new.rol             := old.rol;
    new.credito         := old.credito;
    new.membresia_id    := old.membresia_id;
    new.membresia_hasta := old.membresia_hasta;
    new.puntos          := old.puntos;             -- ← lo que faltaba
  end if;
  return new;
end; $$;

drop trigger if exists trg_proteger_rol on public.clientes;
create trigger trg_proteger_rol before insert or update on public.clientes
  for each row execute function public.tg_proteger_rol();


-- ── 2) Preguntar por el RUT de cualquiera ─────────────────────────
-- Se revocó a anónimos pero el permiso original decía `authenticated,
-- anon`. Con una cuenta cualquiera todavía se puede preguntar cuántas
-- veces vino una persona dando solo su RUT.
revoke execute on function public.loyalty_de_rut(text) from authenticated;


-- ── 3) La tabla `listas` se lee sin sesión ────────────────────────
-- Comprobado en vivo: devuelve código, nombre, DUEÑA y fecha a
-- cualquiera. La página pública no la necesita — usa la vista.
alter table public.listas enable row level security;

drop policy if exists listas_public_read on public.listas;
drop policy if exists listas_anon_select on public.listas;
drop policy if exists listas_select_all  on public.listas;
drop policy if exists "listas visibles"  on public.listas;

drop policy if exists listas_staff on public.listas;
create policy listas_staff on public.listas for all
  using (exists (select 1 from public.clientes c
                  where c.id = auth.uid() and c.rol in ('admin','rrpp','portero')));


-- ── Chequeo ────────────────────────────────────────────────────────
select 'puntos protegido' as que,
       case when pg_get_functiondef(p.oid) like '%new.puntos%' then '✅' else '❌' end as estado
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tg_proteger_rol'
union all
select 'update con with check',
       case when qual is not null and with_check is not null then '✅' else '❌' end
from pg_policies where tablename='clientes' and policyname='cliente_update_own';
