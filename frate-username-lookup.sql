-- ============================================================
-- FRATE — Fix login por username
-- Crea una RPC que permite resolver username → email sin requerir
-- autenticación (la RLS de clientes bloquea SELECT anónimo).
-- ============================================================

-- Función pública: dado un username, devuelve solo el email
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer  -- bypasea RLS
stable
set search_path = public
as $$
  select email
  from clientes
  where username = lower(trim(p_username))
  limit 1;
$$;

-- Permitir que el rol anon ejecute la función (para login sin sesión)
grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- ============================================================
-- LISTO. Ejecutar.
-- ============================================================
