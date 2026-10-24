-- ═══ La lista declara QUÉ REPARTE ═══════════════════════════════════
-- Hoy solo el tipo de ticket tiene clase. Una lista puede emitir cortesías
-- o entradas vendidas (la de VIP AIRE del 1 de agosto fue venta pura), y
-- sin este campo el tablero y los reportes lo tienen que adivinar otra vez.
-- Correr después de frate-clase-ticket.sql. Idempotente.

alter table public.listas add column if not exists clase text;

do $$ begin
  alter table public.listas
    add constraint listas_clase_ck
    check (clase is null or clase in ('venta','cortesia','puerta','prueba'));
exception when duplicate_object then null; end $$;

comment on column public.listas.clase is
  'Qué reparte la lista: venta / cortesia / puerta / prueba. Manda sobre el conteo, no impide emitir.';

-- Propuesta inicial: el cover manda, y el nombre desempata.
-- La inmensa mayoría de los FRATE LINK son cortesías; las excepciones son
-- las que cobran algo o las que dicen "venta"/"pagada" en el nombre.
update public.listas set clase =
  case
    when nombre ~* '(prueba|test)'          then 'prueba'
    when coalesce(cover_amount,0) > 0       then 'venta'
    when nombre ~* '\mventa\M|pagad'       then 'venta'
    else 'cortesia'
  end
where clase is null;

select coalesce(clase,'(sin clase)') as clase, count(*) as listas,
       string_agg(nombre, ' · ' order by id desc) filter (where clase <> 'cortesia') as cuales
from public.listas where eliminada_at is null group by 1 order by 2 desc;
