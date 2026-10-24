-- 💸 LIQUIDAR UN PERIODO COMPLETO · sin pagar dos veces
--
-- Hoy `rrpp_liquidar` liquida UNA noche. Para cerrar un mes hay que apretar
-- «marcar pagado» noche por noche.
--
-- ⚠️ POR QUÉ ESTO NO ES UNA SUMA
-- El candado contra pagos dobles de `rrpp_pagos` es la pareja
-- (clave, evento_id): una fila por persona y por noche. Si el mes se guardara
-- como UNA fila sin evento_id, ese candado no la vería como repetida de las
-- noches ya liquidadas y se pagaría dos veces lo mismo.
-- Por eso esto NO suma el mes: recorre las noches del periodo y liquida cada
-- una con la función que ya existe. El candado sigue haciendo su trabajo, y
-- una noche que ya estaba pagada NO vuelve a pendiente.

create or replace function public.rrpp_liquidar_periodo(
  p_clave   text,
  p_desde   date,
  p_hasta   date,
  p_tarifa  int,
  p_pagado  boolean default false,
  p_nota    text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_ev int; v_n int := 0; v_tot int := 0; v_r jsonb; v_ya int := 0;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo un admin liquida');
  end if;
  if p_clave is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la persona');
  end if;

  -- Las noches de esa persona dentro del periodo. `distinct` porque una
  -- persona puede tener varias listas en la misma noche.
  for v_ev in
    select distinct p.evento_id
      from public.v_rrpp_personas p
     where p.clave = p_clave
       and p.evento_id is not null
       and (p_desde is null or p.fecha >= p_desde)
       and (p_hasta is null or p.fecha <= p_hasta)
     order by p.evento_id
  loop
    -- Si esa noche YA está pagada, no se toca: ni el monto ni el estado.
    if exists (select 1 from public.rrpp_pagos g
                where g.clave = p_clave and g.evento_id = v_ev and g.estado = 'pagado') then
      v_ya := v_ya + 1;
      continue;
    end if;
    v_r := public.rrpp_liquidar(p_clave, v_ev, p_tarifa, p_pagado, p_nota);
    if coalesce((v_r->>'ok')::boolean, false) then
      v_n   := v_n + 1;
      v_tot := v_tot + coalesce((v_r->>'total')::int, 0);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'noches', v_n, 'ya_pagadas', v_ya,
                            'total', v_tot, 'desde', p_desde, 'hasta', p_hasta);
end; $$;

grant execute on function public.rrpp_liquidar_periodo(text, date, date, int, boolean, text) to authenticated;
