-- === interruptor de lealtad · PARTE 3 de 3 ===
-- En orden. Arranca APAGADO.

-- ── 3) Canjear un premio se bloquea entero ─────────────────────────
-- Acá sí se corta todo: canjear con la lealtad apagada le quemaría los
-- puntos a alguien por un premio que no está operando.
create or replace function public.canjear_premio(p_cliente_id uuid, p_premio_id int)
returns json language plpgsql security definer set search_path = public as $$
declare v_premio record; v_puntos int;
begin
  if not public.lealtad_activa() then
    return json_build_object('ok', false, 'error', 'Los premios están pausados por ahora');
  end if;
  select * into v_premio from premios where id = p_premio_id and activo = true;
  if v_premio is null then return json_build_object('ok', false, 'error', 'Premio no disponible'); end if;
  if v_premio.stock is not null and v_premio.stock <= 0 then return json_build_object('ok', false, 'error', 'Sin stock'); end if;
  select puntos into v_puntos from clientes where id = p_cliente_id;
  if coalesce(v_puntos, 0) < v_premio.costo_puntos then return json_build_object('ok', false, 'error', 'Puntos insuficientes'); end if;

  update clientes set puntos = puntos - v_premio.costo_puntos where id = p_cliente_id;
  insert into movimientos (cliente_id, tipo, monto, concepto) values (p_cliente_id, 'puntos', -v_premio.costo_puntos, 'Canje: ' || v_premio.nombre);

  if v_premio.tipo = 'credito' then
    update clientes set credito = coalesce(credito, 0) + v_premio.valor where id = p_cliente_id;
    insert into movimientos (cliente_id, tipo, monto, concepto) values (p_cliente_id, 'credito', v_premio.valor, 'Premio: ' || v_premio.nombre);
  end if;
  if v_premio.stock is not null then
    update premios set stock = stock - 1 where id = p_premio_id;
  end if;
  return json_build_object('ok', true, 'premio', v_premio.nombre);
end; $$;
grant execute on function public.canjear_premio(uuid, int) to authenticated;


-- ── 4) Chequeo ─────────────────────────────────────────────────────
select public.lealtad_activa()                                    as lealtad_encendida,
       (select valor from public.config_valores where clave='lealtad_on')            as interruptor,
       (select valor from public.config_valores where clave='socio_credito_bienvenida') as bono;
