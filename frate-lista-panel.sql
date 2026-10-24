-- ============================================================
-- FRATE — Panel de lista: notas internas + historial de cambios
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh. Idempotente.
-- ============================================================
alter table public.listas add column if not exists notas     text;
alter table public.listas add column if not exists historial jsonb not null default '[]'::jsonb;
alter table public.listas add column if not exists cierre_auto boolean not null default false;  -- cerrar sola al llegar a cupos

select 'listas.notas' as col, case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='notas') then 'OK' else 'FALTA' end as estado
union all select 'listas.historial', case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='historial') then 'OK' else 'FALTA' end
union all select 'listas.cierre_auto', case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='cierre_auto') then 'OK' else 'FALTA' end;
