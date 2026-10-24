-- 🎫 TICKET DE DIFERENCIA · PARTE 1 de 2 — la tabla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- Alguien compró una entrada cuya condición no cumple (no es universitario,
-- se equivocó de género). En vez de devolverle todo o dejarlo afuera, el
-- anfitrión le cobra la diferencia.
--
-- 🔑 LA APP NO COBRA. Emite este documento; el POS lo cobra en caja.
--    Los anfitriones administran entradas, no manejan plata.

create table if not exists public.tickets_diferencia (
  id              bigserial primary key,
  codigo          text        not null unique,        -- DIF-000042
  pedido_id       int         references public.pedidos(id),
  qr_id           text        not null,               -- el ticket con el desajuste
  persona         text,
  rut             text,
  evento_id       int         references public.eventos(id),

  motivo          text        not null,               -- no_universitario | genero | otro
  ticket_actual   text,
  precio_actual   int,
  ticket_destino  text,
  precio_destino  int,
  monto           int         not null check (monto >= 0),

  estado          text        not null default 'pendiente',  -- pendiente|pagado|anulado
  nota            text,

  -- quién lo emitió: lo pone el SERVIDOR desde auth.uid(), nunca el navegador
  emitido_por     text,
  emitido_por_id  uuid        references public.clientes(id),
  emitido_at      timestamptz not null default now(),
  vence_at        timestamptz,

  -- el cobro
  ref_venta       text,                               -- la referencia del POS
  pagado_por      text,
  pagado_at       timestamptz,
  anulado_por     text,
  anulado_at      timestamptz,
  anulado_motivo  text
);

comment on table public.tickets_diferencia is
  'Cobros de diferencia emitidos en la puerta. La WEB emite, el POS cobra.';

-- Un mismo QR no puede tener dos cobros vivos a la vez.
create unique index if not exists tickets_diferencia_qr_vivo
  on public.tickets_diferencia (qr_id)
  where estado = 'pendiente';

create index if not exists tickets_diferencia_estado
  on public.tickets_diferencia (estado, emitido_at desc);
create index if not exists tickets_diferencia_evento
  on public.tickets_diferencia (evento_id, emitido_at desc);

-- El POS busca por ref_venta para no cobrar dos veces el mismo documento.
create unique index if not exists tickets_diferencia_ref
  on public.tickets_diferencia (ref_venta)
  where ref_venta is not null;

alter table public.tickets_diferencia enable row level security;

-- Nadie de afuera. El staff entra por los RPC, que verifican adentro.
drop policy if exists td_staff on public.tickets_diferencia;
create policy td_staff on public.tickets_diferencia for all
  using (exists (select 1 from public.clientes
                  where id = auth.uid() and rol in ('admin','portero')));

-- El correlativo, en su propia secuencia para que el código sea lindo.
create sequence if not exists public.tickets_diferencia_cod_seq;

create or replace function public.diferencia_codigo() returns text
language sql volatile set search_path = public as $$
  select 'DIF-' || lpad(nextval('public.tickets_diferencia_cod_seq')::text, 6, '0')
$$;

-- Chequeo
select 'tickets_diferencia' as objeto,
       (select count(*) from public.tickets_diferencia) as filas,
       public.diferencia_codigo()                       as proximo_codigo;
