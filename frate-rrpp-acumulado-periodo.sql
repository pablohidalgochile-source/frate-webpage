-- 🏆 ACUMULADO POR PERIODO
--
-- `rrpp_acumulado()` suma TODO desde siempre. Para cerrar un mes hay que poder
-- pedirle ese mes.
--
-- ⚠️ Se agregan parámetros CON VALOR POR DEFECTO null, así que la llamada de
-- hoy —`rrpp_acumulado()` sin argumentos, que es la que hace el admin— sigue
-- funcionando igual y devuelve lo mismo que antes.
--
-- ⚠️ `create or replace` NO reemplaza cuando cambia la firma: crea una función
-- nueva al lado. Por eso primero se borra la vieja. Ya nos pasó con
-- `premio_canjear`, que quedó duplicada y rompía las llamadas por ambigüedad.

drop function if exists public.rrpp_acumulado();

create or replace function public.rrpp_acumulado(
  p_desde date default null,
  p_hasta date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v json;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select coalesce(json_agg(row_to_json(t) order by t.ganado desc), '[]'::json) into v from (
    select clave, max(rrpp_nombre) as rrpp,
           count(*)                                            as noches,
           sum(personas)                                       as entraron,
           sum(total)                                          as ganado,
           sum(total) filter (where estado='pagado')           as pagado,
           coalesce(sum(total) filter (where estado<>'pagado'),0) as se_le_debe,
           max(fecha)                                          as ultima
    from public.rrpp_pagos
    -- Se filtra por la fecha de la NOCHE, no por cuándo se liquidó: pagar en
    -- septiembre las noches de agosto tiene que contar como agosto.
    where (p_desde is null or fecha >= p_desde)
      and (p_hasta is null or fecha <= p_hasta)
    group by clave
  ) t;

  return jsonb_build_object('ok', true, 'rrpp', v, 'desde', p_desde, 'hasta', p_hasta);
end; $$;

grant execute on function public.rrpp_acumulado(date, date) to authenticated;

-- Que quedó UNA sola, no dos
select proname, pg_get_function_identity_arguments(oid) as argumentos
  from pg_proc where proname = 'rrpp_acumulado';
