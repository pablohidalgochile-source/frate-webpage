-- 📚 UNA SOLA BIBLIOTECA · PARTE 1 de 2 — los campos que faltan
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- HOY HAY TRES TABLAS PARA LO MISMO:
--   · catalogo_tickets     15 filas · la biblioteca real
--   · plantillas_comunidad  5 filas · los presets de listas
--   · ticket_plantillas      0 filas · se programó y nunca se usó
--
-- Comparten 7 campos con distinto nombre (hora_max vs hora_max_ingreso,
-- texto_condiciones vs instrucciones, titulo_entrada vs rotulo…), y por eso
-- al armar un jueves hay que llenar lo mismo dos veces.
--
-- ⚠️ ESTA PARTE NO BORRA NI MUEVE NADA. Solo agrega columnas. Si algo sale
--    mal, `plantillas_comunidad` sigue intacta y el admin sigue leyéndola.

alter table public.catalogo_tickets
  -- Lo que hoy solo saben las plantillas de lista
  add column if not exists cupos               int,
  add column if not exists max_acompanantes    int     default 0,
  add column if not exists permite_extranjero  boolean default true,
  add column if not exists chequear_edad       boolean default true,
  add column if not exists duenio              text,
  add column if not exists es_default          boolean default false,
  -- De dónde vino, para poder revisar la migración después
  add column if not exists origen_plantilla_id int;

comment on column public.catalogo_tickets.cupos is
  'Solo para clase=cortesia: cupos de la lista. null = sin tope.';
comment on column public.catalogo_tickets.max_acompanantes is
  'Solo para clase=cortesia: cuántos puede llevar cada inscrito.';
comment on column public.catalogo_tickets.origen_plantilla_id is
  'Si vino de plantillas_comunidad, su id ahí. Para auditar la migración.';

create index if not exists catalogo_tickets_clase on public.catalogo_tickets (clase, activo);


-- ── Chequeo · así quedó la tabla ──────────────────────────────────
select column_name as columna, data_type as tipo
from information_schema.columns
where table_schema = 'public' and table_name = 'catalogo_tickets'
  and column_name in ('cupos','max_acompanantes','permite_extranjero',
                      'chequear_edad','duenio','es_default','origen_plantilla_id')
order by column_name;


-- ── Lo que se va a migrar en la parte 2 ───────────────────────────
select id, nombre, genero, hora_max, cupos, max_acompanantes,
       case when exists (select 1 from public.catalogo_tickets c
                          where c.origen_plantilla_id = p.id)
            then '✅ ya migrada' else '⏳ pendiente' end as estado
from public.plantillas_comunidad p
order by orden, id;
