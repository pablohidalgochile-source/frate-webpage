-- 💸 QUIÉN COBRA Y CUÁNTO · parte 1 de 2 · la tabla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente · NO cambia nada existente
--
-- HOY: la tarifa es una sola para todos ($500 en config_valores.rrpp_tarifa) y
--   no hay forma de decir «a este no se le paga». El informe calcula
--   a_pagar = escaneados × tarifa para TODA identidad que tenga listas —
--   incluidos los admins de la casa, que no cobran.
--
-- LA IDEA: una fila por identidad, con la MISMA CLAVE que el informe usa para
--   agrupar (`rrpp_clave_final`). Así sirve igual para quien tiene cuenta
--   (@thiscotty) y para quien está atribuido por texto (ANFITRIÓN CAMPUS,
--   FRATE · caja), que hoy son la mitad de la tabla.
--
-- ⚠️ La tarifa global NO se toca: sigue siendo el valor por defecto. Esto solo
--    la sobrescribe cuando hay una fila acá.

create table if not exists public.rrpp_pago (
  clave       text primary key,          -- la misma clave del informe
  paga        boolean not null default true,
  tarifa      int,                       -- null = usa la global
  nombre      text,                      -- para verlo en el admin sin cruzar
  nota        text,
  editado_por uuid references public.clientes(id),
  editado_at  timestamptz not null default now()
);

alter table public.rrpp_pago enable row level security;

drop policy if exists rrpp_pago_admin on public.rrpp_pago;
create policy rrpp_pago_admin on public.rrpp_pago for all
  using (exists (select 1 from public.clientes c
                  where c.id = auth.uid() and c.rol = 'admin'));


-- ── Chequeo ───────────────────────────────────────────────────────
select 'rrpp_pago' as tabla,
       (select count(*) from public.rrpp_pago)                        as filas,
       (select valor from public.config_valores where clave='rrpp_tarifa') as tarifa_global;
