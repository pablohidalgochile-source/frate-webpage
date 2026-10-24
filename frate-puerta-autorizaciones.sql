-- ============================================================
-- FRATE · QUIÉN AUTORIZÓ UN INGRESO FUERA DE HORARIO
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- PROBLEMA: cuando una entrada llega pasada su hora, la puerta pide el
-- `admin_pin` — cuatro dígitos que sabe TODO el equipo. Se autoriza el
-- ingreso y no queda ningún registro de quién lo autorizó.
--
-- SOLUCIÓN: dos puertas, como en el ERP.
--   1. El admin entra con SU cuenta  → queda firmado con su nombre.
--   2. El PIN del equipo sigue existiendo → queda firmado como
--      «llave compartida», que es la verdad y por eso incomoda.
--
-- El PIN NO se elimina: si un sábado a las 3 AM nadie recuerda su clave,
-- la puerta tiene que abrir igual. Se desincentiva mostrando que no firma.
--
-- Es idempotente y NO bloquea nada: si esta tabla no existe, el validador
-- autoriza igual y solo se pierde el registro.
-- ============================================================

create table if not exists public.puerta_autorizaciones (
  id                bigserial primary key,
  qr_id             text,
  evento_id         int,
  nombre_invitado   text,
  motivo            text        not null default 'fuera_de_horario',
  via               text        not null,          -- 'ficha' | 'llave'
  autorizado_por    text        not null,          -- nombre real, o 'llave compartida'
  autorizado_por_id uuid,                          -- null cuando se usó el PIN
  registrado_por    uuid        default auth.uid(),-- el portero que estaba en la puerta
  creado_at         timestamptz default now()
);

create index if not exists idx_pauth_evento on public.puerta_autorizaciones(evento_id, creado_at desc);
create index if not exists idx_pauth_via    on public.puerta_autorizaciones(via, creado_at desc);

-- ── Quién puede escribir y leer ──
-- Escribe la puerta (portero o admin). Lee el equipo. Nadie de afuera.
alter table public.puerta_autorizaciones enable row level security;

drop policy if exists pauth_staff on public.puerta_autorizaciones;
create policy pauth_staff on public.puerta_autorizaciones for all
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero')))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero')));

-- Nadie puede reescribir la historia: una autorización se inserta y se queda.
drop policy if exists pauth_no_update on public.puerta_autorizaciones;
revoke update, delete on public.puerta_autorizaciones from anon, authenticated;


-- ── Vista de consulta ──
-- ⚠️ `security_invoker = on` NO es opcional. En PostgreSQL una vista corre con
--    los permisos de su DUEÑO (postgres), así que SIN esta opción la vista
--    IGNORA la RLS de la tabla de abajo: cualquiera con la llave pública del
--    sitio podría leer por acá los nombres de los invitados y quién autorizó.
--    Con la opción activada, la vista respeta la RLS de quien consulta.
--    (Desde el SQL Editor sigues viendo todo: postgres es dueño de la tabla.)
create or replace view public.v_puerta_autorizaciones
with (security_invoker = on) as
select a.id, a.creado_at, a.qr_id, a.evento_id, e.nombre as evento,
       a.nombre_invitado, a.motivo, a.via, a.autorizado_por,
       (a.via = 'llave') as sin_firma
from public.puerta_autorizaciones a
left join public.eventos e on e.id = a.evento_id
order by a.creado_at desc;


-- ── Verificación ──
select 'tabla puerta_autorizaciones' as chequeo,
       case when exists(select 1 from information_schema.tables
                        where table_schema='public' and table_name='puerta_autorizaciones')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'RLS activa',
       case when (select rowsecurity from pg_tables where tablename='puerta_autorizaciones')
            then '✅ ok' else '❌ abierta' end
union all
select 'política de staff',
       case when exists(select 1 from pg_policies where tablename='puerta_autorizaciones' and policyname='pauth_staff')
            then '✅ ok' else '❌ falta' end
union all
select 'vista del panel',
       case when exists(select 1 from information_schema.views
                        where table_schema='public' and table_name='v_puerta_autorizaciones')
            then '✅ ok' else '❌ falta' end
union all
-- La vista NO puede saltarse la RLS de la tabla. Si esto sale en 🚨, los
-- nombres de los invitados quedan legibles con la llave pública del sitio.
select 'vista respeta la RLS (security_invoker)',
       case when (select 'security_invoker=on' = any(reloptions)
                    from pg_class where relname='v_puerta_autorizaciones')
            then '✅ ok' else '🚨 la vista se salta la RLS' end;

-- ============================================================
-- CÓMO SE VE DESPUÉS:
--   select creado_at, nombre_invitado, via, autorizado_por
--     from v_puerta_autorizaciones where evento_id = 123;
--
--   2026-08-01 03:12  CATALINA MUÑOZ   ficha  Pablo Hidalgo
--   2026-08-01 03:40  MATÍAS ROJAS     llave  llave compartida   ← sin firma
-- ============================================================
