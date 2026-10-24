-- 🎰 CONCURSOS · parte 2a de 3 — qué concurso me toca
-- Corre DESPUÉS de frate-concursos-1.sql.

-- ── Qué concurso puedo jugar ──────────────────────────────────────
create or replace function public.concurso_mio()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.concursos%rowtype; v_uid uuid := auth.uid(); v_giros int; v_ok boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'motivo', 'sin_sesion'); end if;

  select * into c from public.concursos
   where activo and (desde is null or desde <= now()) and (hasta is null or hasta >= now())
   order by id desc limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'motivo', 'sin_concurso'); end if;

  -- ¿Le toca a esta persona?
  v_ok := case c.quien_puede
    when 'todos'        then true
    when 'sin_red'      then (select public.norm_usuario(usuario_red) is null
                                from public.clientes where id = v_uid)
    when 'compradores'  then exists (select 1 from public.pedidos p
                                      where p.cliente_id = v_uid and p.estado='pagado'
                                        and coalesce(p.total_pagado,p.total,0) > 0)
    when 'una_sola_compra' then (select count(*) from public.pedidos p
                                  where p.cliente_id = v_uid and p.estado='pagado'
                                    and coalesce(p.total_pagado,p.total,0) > 0) = 1
    else false end;
  if not v_ok then return jsonb_build_object('ok', false, 'motivo', 'no_te_toca'); end if;

  select count(*) into v_giros from public.concurso_giros
   where concurso_id = c.id and cliente_id = v_uid;
  if v_giros >= c.giros_por_persona then
    return jsonb_build_object('ok', false, 'motivo', 'ya_jugaste',
      'codigo', (select codigo from public.concurso_giros
                  where concurso_id=c.id and cliente_id=v_uid order by id desc limit 1));
  end if;

  return jsonb_build_object('ok', true, 'id', c.id, 'nombre', c.nombre,
    'juego', c.juego, 'pide_red', c.pide_red, 'vence_dias', c.vence_dias,
    'premios', (select coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'detalle',detalle)
                        order by orden), '[]'::jsonb)
                  from public.concurso_premios
                 where concurso_id = c.id and (stock is null or entregados < stock)));
end $$;

grant execute on function public.concurso_mio() to authenticated;
