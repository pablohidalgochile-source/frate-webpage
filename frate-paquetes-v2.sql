-- ============================================================
-- FRATE — Paquetes v2: galería de fotos + destacado
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

alter table public.paquetes add column if not exists fotos     jsonb;               -- galería: ["url1","url2",...]
alter table public.paquetes add column if not exists destacado  boolean default false;

select 'paquetes.fotos'     as check, case when exists(select 1 from information_schema.columns where table_name='paquetes' and column_name='fotos')     then 'OK' else 'FALTA' end
union all select 'paquetes.destacado', case when exists(select 1 from information_schema.columns where table_name='paquetes' and column_name='destacado') then 'OK' else 'FALTA' end;
