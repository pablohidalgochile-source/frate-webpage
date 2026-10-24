-- Parte 3 · permisos y comprobación
revoke execute on function public.rrpp_mi_rendimiento(date,date) from anon, public;
grant  execute on function public.rrpp_mi_rendimiento(date,date) to authenticated;

-- Qué va a ver cada uno al abrir /rrpp
select g.grupo, g.nombre, g.paga as cobra,
       public.rrpp_mi_tarifa_de(g.clave) as por_persona,
       case when public.rrpp_mi_tarifa_de(g.clave) = 0
            then 'verá $0 · correcto, no cobra'
            else 'verá su monto real' end as en_el_portal
  from public.rrpp_pago g
 order by case g.grupo when 'rrpp' then 1 when 'equipo' then 2 else 3 end, g.nombre;
