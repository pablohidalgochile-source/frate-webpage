-- 💸 LA TARIFA DE CADA PERSONA · parte 1 de 3
--
-- Corrección: en la versión anterior `rrpp_mi_tarifa_de` estaba en la parte 2
-- y la parte 3 la necesitaba. Ahora las dos funciones nacen acá. Correr esto
-- de nuevo no hace daño: reemplaza lo que ya exista.

-- La tarifa de una persona: 0 si no cobra · la suya si cobra · la global si
-- nadie la clasificó todavía.
create or replace function public.rrpp_mi_tarifa_de(p_clave text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when g.clave is null then coalesce((select nullif(valor,'')::int
                                          from public.config_valores
                                         where clave='rrpp_tarifa'), 500)
    when not g.paga then 0
    else coalesce(g.tarifa, (select nullif(valor,'')::int
                               from public.config_valores
                              where clave='rrpp_tarifa'), 500)
  end
  from (select 1) _
  left join public.rrpp_pago g on g.clave = p_clave
$$;

-- La de quien está mirando, para usarla desde el portal sin pasar la clave.
create or replace function public.rrpp_mi_tarifa()
returns int language sql stable security definer set search_path = public as $$
  select public.rrpp_mi_tarifa_de(public.rrpp_clave_final(auth.uid()::text))
$$;

grant execute on function public.rrpp_mi_tarifa_de(text) to authenticated;
grant execute on function public.rrpp_mi_tarifa()      to authenticated;

-- Comprueba que quedaron las dos
-- `oid` está en pg_proc Y en pg_namespace: hay que decir de cuál.
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('rrpp_mi_tarifa','rrpp_mi_tarifa_de')
 order by p.proname;
