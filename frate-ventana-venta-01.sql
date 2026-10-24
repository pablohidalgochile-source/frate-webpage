-- FRATE · VENTANA DE VENTA 01 · tramos de preventa por fecha + el cover como campo propio
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · tipos_ticket (4 columnas + 1 índice) y
-- catalogo_tickets (2 columnas). Idempotente: córrelo las veces que quieras.
-- ADITIVO: venta_desde / venta_hasta en NULL = la entrada se vende siempre, igual que hoy.
-- Las fechas NO van al catálogo: son el tramo de un evento, no del producto reutilizable.
--   Al catálogo va solo el cover (incluye_cover / cover_cc), que sí es del producto.
-- vence_hora NO se toca: sigue siendo el corte DENTRO de la noche (HH:MM anclado a
--   eventos.fecha, con regla de madrugada). La ventana es un instante absoluto: conviven,
--   y el servidor chequea las dos.
-- ⚠️ Córrelo fuera de venta: la primera vez toma un lock cortito sobre tipos_ticket. Si sale
--   «lock timeout», vuelve a correrlo — es seguro, no deja nada a medias; la segunda vez ya no
--   pide el lock (la guardia mira information_schema primero). Los defaults son constantes,
--   así que Postgres NO reescribe la tabla.
-- Reversa (en este orden, nunca al revés):
--   1) vuelve las edges crear-pago, reanudar-pago y api-evento-ingest a su versión anterior;
--   2) recién ahí:
--      drop index  if exists public.tipos_ticket_ventana_idx;
--      alter table public.tipos_ticket drop column if exists venta_desde,
--        drop column if exists venta_hasta, drop column if exists incluye_cover,
--        drop column if exists cover_cc;
--      alter table public.catalogo_tickets drop column if exists incluye_cover,
--        drop column if exists cover_cc;   notify pgrst, 'reload schema';
-- -----------------------------------------------------------------------------------------

set lock_timeout = '2s';  -- corto a propósito: la cola detrás del lock no pasa los 3 s de anon

-- ① tipos_ticket: la ventana + el cover ───────────────────────────────────
--    Con guardia: «add column if not exists» pide el lock exclusivo ANTES de mirar si la
--    columna existe, así que correrlo de nuevo dejaría las ventas en cola. Un ALTER, un lock.
begin;
do $$ begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'tipos_ticket'
         and column_name in ('venta_desde', 'venta_hasta', 'incluye_cover', 'cover_cc')) < 4 then
    execute 'alter table public.tipos_ticket
               add column if not exists venta_desde   timestamptz,
               add column if not exists venta_hasta   timestamptz,
               add column if not exists incluye_cover boolean not null default false,
               add column if not exists cover_cc      integer';
  end if;
end $$;
commit;

-- ② catalogo_tickets: solo el cover (tabla chica y fría, va directo) ──────
begin;
alter table public.catalogo_tickets
  add column if not exists incluye_cover boolean not null default false,
  add column if not exists cover_cc      integer;
commit;

-- ③ Índice, con guardia por nombre: «create index if not exists» igual pide ShareLock
--    (bloquea escrituras) para mirar. Con to_regclass, la segunda vez no toca nada.
do $$ begin
  if to_regclass('public.tipos_ticket_ventana_idx') is null then
    execute 'create index tipos_ticket_ventana_idx
               on public.tipos_ticket (evento_id, venta_desde, venta_hasta)';
  end if;
end $$;

comment on column public.tipos_ticket.venta_desde   is 'Instante absoluto en que ABRE la venta de este tramo (el -03:00 del brief se guarda exacto). NULL = se vende desde siempre.';
comment on column public.tipos_ticket.venta_hasta   is 'Instante absoluto en que CIERRA la venta de este tramo. NULL = se vende hasta que lo cierre otra regla (estado, cupo, vence_hora, fin del evento).';
comment on column public.tipos_ticket.incluye_cover is 'La entrada trae cover incluido. Se copia al snapshot items_pedido.condiciones: lo leen el correo y la puerta.';
comment on column public.tipos_ticket.cover_cc      is 'Centímetros cúbicos del cover incluido (ej: 500). NULL = no se declara la medida.';
comment on column public.catalogo_tickets.incluye_cover is 'Default del producto: trae cover incluido. Se copia a tipos_ticket al usarlo en un evento.';
comment on column public.catalogo_tickets.cover_cc      is 'Default del producto: cc del cover incluido.';

notify pgrst, 'reload schema';  -- sin esto PostgREST no ve las columnas nuevas

-- ④ Verificación ──────────────────────────────────────────────────────────
select 'tipos_ticket · columnas nuevas (deben ser 4)' as chequeo,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'tipos_ticket'
           and column_name in ('venta_desde', 'venta_hasta', 'incluye_cover', 'cover_cc')) as valor
union all
select 'catalogo_tickets · columnas nuevas (deben ser 2)',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'catalogo_tickets'
           and column_name in ('incluye_cover', 'cover_cc'))
union all
select 'índice (evento_id, venta_desde, venta_hasta)',
       case when to_regclass('public.tipos_ticket_ventana_idx') is not null then 'OK' else 'FALTA' end
union all
select 'ventanas ya cargadas (0 es lo normal recién corrido)',
       (select count(*)::text from public.tipos_ticket
         where venta_desde is not null or venta_hasta is not null)
union all
select 'ventanas al revés (venta_hasta <= venta_desde) · debe ser 0',
       (select count(*)::text from public.tipos_ticket
         where venta_desde is not null and venta_hasta is not null and venta_hasta <= venta_desde);
