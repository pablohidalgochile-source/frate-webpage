-- ============================================================
-- FRATE · EMERGENCIA — recuperar acceso de admin
-- Córrelo en Supabase → SQL Editor. Ahí NO hay sesión, así que
-- el candado de rol no bloquea (auth.uid() es null → pasa directo).
-- ============================================================

-- 1) VER en qué estado quedaron las cuentas del equipo
select username, email, rol, created_at
from public.clientes
where rol <> 'usuario'
   or lower(username) in ('nanook','validadorfrate','invitafrate','javi','lina')
order by rol nulls last, created_at desc;

-- 2) RESTAURAR TU ADMIN  ← cambia el correo por el TUYO (con el que entras al panel)
update public.clientes
set rol = 'admin'
where lower(email) = lower('PON_AQUI_TU_CORREO');

-- (si entras por usuario en vez de correo, usa esta línea en cambio):
-- update public.clientes set rol='admin' where lower(username) = lower('nanook');

-- 3) CONFIRMAR que quedó admin
select username, email, rol from public.clientes where rol = 'admin';

-- 4) (si YA corriste el candado de lista blanca) deja tu correo autorizado
--    para que no se vuelva a revertir. Si la tabla no existe, ignora este error.
insert into public.admins_autorizados (email, rol)
select email, 'admin' from public.clientes where rol = 'admin'
on conflict (email) do nothing;
