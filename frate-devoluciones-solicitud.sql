-- ============================================================
-- FRATE — Devoluciones AUTOSERVICIO: tabla de solicitudes
-- El cliente PIDE desde /devolucion (edge con service role valida
-- correo + N° de orden). El equipo APRUEBA en Órdenes → ↩️ Devoluciones.
-- Nada automático: esto solo guarda la solicitud.
-- Correr en el Supabase de la WEB (ydwlpra…). Idempotente.
-- ============================================================

create table if not exists public.solicitudes_devolucion (
  id             bigserial primary key,
  pedido_id      bigint,
  orden_ref      text,                              -- 'FCC-004821' (lo que ve el cliente)
  email          text,
  nombre         text,
  telefono       text,
  evento_id      int,
  evento_nombre  text,
  items          jsonb  default '[]'::jsonb,         -- [{qr,nombre_ticket,persona,monto}]
  qr_ids         jsonb  default '[]'::jsonb,         -- QRs a devolver
  monto_total    int    default 0,                  -- suma de los tickets pedidos
  monto_devolver int    default 0,                  -- tras retención (referencial; el equipo decide)
  preferencia    text   default 'dinero',           -- dinero | credito | cambio_dia
  motivo         text,
  comentario     text,
  estado         text   default 'pendiente',        -- pendiente | aprobada | rechazada | procesada
  resolucion     text,                              -- nota del equipo al cerrar
  acepto_politica boolean default false,            -- el cliente aceptó las condiciones (anti-reclamo)
  politica_texto text,                              -- snapshot EXACTO de la política que aceptó
  canal          text   default 'web',
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

create index if not exists idx_soldev_estado on public.solicitudes_devolucion(estado, created_at desc);
create index if not exists idx_soldev_pedido on public.solicitudes_devolucion(pedido_id);

alter table public.solicitudes_devolucion enable row level security;

-- Solo staff lee/gestiona. El ALTA va por edge (service role), NO anon directo → sin fuga de datos.
drop policy if exists soldev_admin_all on public.solicitudes_devolucion;
create policy soldev_admin_all on public.solicitudes_devolucion for all
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero','rrpp')))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero','rrpp')));

-- updated_at automático
create or replace function public.tg_soldev_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_soldev_touch on public.solicitudes_devolucion;
create trigger trg_soldev_touch before update on public.solicitudes_devolucion
  for each row execute function public.tg_soldev_touch();

-- Config: APAGADO por defecto (Pablo lo enciende cuando la política esté OK) + WhatsApp de aviso + política editable.
-- {RETENCION} se reemplaza por el % real al mostrarla.
insert into public.config_valores (clave, valor) values
  ('devoluciones_activo','false'),
  ('devoluciones_wsp',''),
  ('devoluciones_politica',
   E'POLÍTICA DE DEVOLUCIONES FRATE\n'
   || E'• La devolución es una SOLICITUD: el equipo la revisa y aprueba. No es automática.\n'
   || E'• Solo aplica a entradas NO USADAS (sin ingreso registrado) y solicitadas ANTES del inicio del evento.\n'
   || E'• Devolución de dinero: se descuenta una retención del {RETENCION}% por costos de gestión y transacción. Se paga por el mismo medio, hasta 5 días hábiles tras la aprobación.\n'
   || E'• Alternativas SIN retención: crédito FRATE (para otro evento) o cambio de día (según disponibilidad).\n'
   || E'• NO hay devolución por: entradas ya usadas, no presentarse (no-show), eventos ya realizados, ni por causas ajenas a FRATE.\n'
   || E'• Si FRATE cancela o reprograma el evento, se informa el procedimiento específico.\n'
   || E'Al enviar la solicitud declaras haber leído y aceptado esta política.')
  on conflict (clave) do nothing;

select 'solicitudes_devolucion' as tabla,
       case when exists(select 1 from information_schema.tables where table_name='solicitudes_devolucion') then 'OK' else 'FALTA' end as estado;
