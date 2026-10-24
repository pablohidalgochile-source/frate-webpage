-- ============================================================
-- FRATE · SEGURIDAD — Blindar el rol (nadie se auto-hace admin)
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · correr en el SQL Editor
--
-- Problema: un usuario logueado podía editar su propia ficha en
-- 'clientes' y, como el rol no estaba protegido, cambiarse a admin
-- vía la API (con la llave pública). Así apareció "frateia" admin.
--
-- Fix: un trigger que impide que un NO-admin cambie su rol (ni
-- crédito / membresía). El backend (crear-pago, service_role) y los
-- admins siguen funcionando igual.
-- ============================================================

create or replace function public.tg_proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  es_admin boolean;
begin
  uid := auth.uid();
  -- Backend confiable (service_role: crear-pago, edge functions) → uid es NULL → permitir
  if uid is null then
    return new;
  end if;
  -- ¿quien ejecuta es admin? (puede cambiar roles de otros desde el panel)
  select exists(select 1 from public.clientes where id = uid and rol = 'admin') into es_admin;
  if es_admin then
    return new;
  end if;
  -- Usuario normal: no puede tocar columnas privilegiadas
  if tg_op = 'INSERT' then
    new.rol := 'usuario';                       -- nadie se registra como admin
  else
    new.rol             := old.rol;             -- no puede cambiar su propio rol
    new.credito         := old.credito;         -- ni su crédito
    new.membresia_id    := old.membresia_id;    -- ni su membresía
    new.membresia_hasta := old.membresia_hasta;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_rol on public.clientes;
create trigger trg_proteger_rol
  before insert or update on public.clientes
  for each row execute function public.tg_proteger_rol();

-- ── Contención inmediata: quitar admin a la cuenta sospechosa ──
update public.clientes set rol = 'usuario' where email = 'frateia@gmail.com';

-- ── Auditoría: ¿quiénes quedan como admin? Revisa que sean SOLO los tuyos ──
select id, username, email, rol, created_at
from public.clientes
where rol = 'admin'
order by created_at desc;
