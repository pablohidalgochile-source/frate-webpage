-- ============================================================
-- FRATE — Anti-spam de formularios: MÁXIMO 1 solicitud por persona
-- (correo O teléfono) por TIPO por DÍA. A prueba de carreras (índice
-- único a nivel DB → aunque lleguen 18 clics juntos, entra 1 sola).
-- + limpia los duplicados YA creados. Correr en el Supabase WEB. Idempotente.
-- Día en zona America/Santiago (los eventos van 23:00→05:00; ver [[frate-eventos-horario]]).
-- ============================================================

-- 1) Llaves de deduplicación (las llena el edge en cada alta nueva; acá backfill del histórico)
alter table public.formularios add column if not exists dk_email text;
alter table public.formularios add column if not exists dk_tel   text;

update public.formularios set
  dk_email = case when coalesce(email,'') <> ''
                  then tipo || '|' || ((created_at at time zone 'America/Santiago')::date)::text || '|' || lower(trim(email))
                  else null end,
  dk_tel   = case when length(regexp_replace(coalesce(telefono,''),'\D','','g')) >= 7
                  then tipo || '|' || ((created_at at time zone 'America/Santiago')::date)::text || '|' || right(regexp_replace(telefono,'\D','','g'),8)
                  else null end
where dk_email is null and dk_tel is null;

-- 2) LIMPIEZA de duplicados existentes — deja 1 por grupo (prioriza el que YA se trabajó; si no, el más antiguo)
with r as (
  select id, row_number() over (partition by dk_email order by (case when estado='nuevo' then 1 else 0 end), id) rn
  from public.formularios where dk_email is not null
)
delete from public.formularios f using r where f.id = r.id and r.rn > 1;

with r as (
  select id, row_number() over (partition by dk_tel order by (case when estado='nuevo' then 1 else 0 end), id) rn
  from public.formularios where dk_tel is not null
)
delete from public.formularios f using r where f.id = r.id and r.rn > 1;

-- 3) Candados: 1 por (tipo, día, correo) y 1 por (tipo, día, teléfono). Aquí muere la carrera.
create unique index if not exists ux_form_dk_email on public.formularios(dk_email) where dk_email is not null;
create unique index if not exists ux_form_dk_tel   on public.formularios(dk_tel)   where dk_tel   is not null;

select 'formularios dedup' as check,
       (select count(*) from public.formularios) as filas,
       case when exists(select 1 from pg_indexes where indexname='ux_form_dk_email') then 'OK' else 'FALTA' end as idx_email,
       case when exists(select 1 from pg_indexes where indexname='ux_form_dk_tel') then 'OK' else 'FALTA' end as idx_tel;
