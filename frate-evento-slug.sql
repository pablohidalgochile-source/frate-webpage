-- FRATE — Columna slug en eventos (link directo frate.cl/e/<slug>). Correr en WEB (ydwlpra…).
alter table public.eventos add column if not exists slug text;
do $$ begin
  create unique index if not exists eventos_slug_uidx on public.eventos (lower(slug)) where slug is not null and slug <> '';
exception when others then null; end $$;
select 'evento_slug' as check, case when exists (select 1 from information_schema.columns where table_name='eventos' and column_name='slug') then 'OK' else 'FALTA' end as col;
