-- ✅ ¿Quedaron bien los tres SQL de grupos? Solo LEE.

select 'columna grupo' as que,
       case when exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='rrpp_pago' and column_name='grupo')
            then '✅ existe' else '❌ falta · corre grupos-1' end as estado
union all
select 'informe devuelve grupo',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='rrpp_rendimiento'
                and pg_get_functiondef(p.oid) like '%as     grupo%')
            then '✅ sí' else '❌ no · corre grupos-2' end
union all
select 'la casa unida bajo @invitafrate',
       coalesce((select count(*)::text || ' identidades unidas'
                   from public.rrpp_alias where unido_por='clasificación automática'),'0')
union all
select 'nadie sin clasificar',
       case when exists (select 1 from public.v_rrpp_personas p
                          where p.clave is not null
                            and not exists (select 1 from public.rrpp_pago g where g.clave=p.clave))
            then '⚠️ hay identidades sin fila en rrpp_pago (salen en «Por clasificar»)'
            else '✅ todas clasificadas' end;

-- Cómo quedó cada grupo, y cuánto se paga
select g.grupo,
       count(*)                                as personas,
       count(*) filter (where g.paga)          as cobran,
       coalesce(sum(g.tarifa) filter (where g.paga), 0) as tarifa_suma,
       string_agg(g.nombre, ' · ' order by g.nombre) as quienes
  from public.rrpp_pago g
 group by g.grupo
 order by case g.grupo when 'rrpp' then 1 when 'equipo' then 2 else 3 end;
