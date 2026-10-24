-- ═══════════════════════════════════════════════════════════════════
-- 🔌 UN INTERRUPTOR DE VERDAD PARA PUNTOS Y PREMIOS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Pablo, 2026-08-04: «no puedo empezar con membresías y lealtad esta semana».
--
-- Un interruptor que solo viva en la pantalla sería decorativo: la plata
-- y los puntos se reparten en CUATRO lugares, y ninguno pasa por el admin.
--
--   1. activar_socio()          → el crédito de bienvenida       (base)
--   2. canjear_premio()         → descuenta puntos y da el premio(base)
--   3. mp-webhook               → puntos al pagar con MercadoPago(edge)
--   4. khipu-webhook            → puntos al pagar por transferencia(edge)
--
-- Este archivo tapa los DOS de la base. Los dos webhooks van aparte,
-- en su propio despliegue.
--
-- ⚠️ Arranca APAGADO a propósito. Nadie recibe nada hasta que Pablo lo
--    encienda desde Puntos & Premios.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) El interruptor ──────────────────────────────────────────────
insert into public.config_valores(clave, valor)
select 'lealtad_on', 'false'
where not exists (select 1 from public.config_valores where clave='lealtad_on');

create or replace function public.lealtad_activa()
returns boolean language sql stable set search_path = public as $$
  select coalesce(
    (select lower(btrim(valor)) in ('true','1','si','sí','on')
     from public.config_valores where clave='lealtad_on'),
    false)   -- sin fila = apagado. Nunca se reparte plata por omisión.
$$;
grant execute on function public.lealtad_activa() to anon, authenticated;

comment on function public.lealtad_activa is
  'El interruptor maestro de lealtad. Lo consultan activar_socio, canjear_premio y los dos webhooks de pago.';


-- ── 2) El crédito de bienvenida respeta el interruptor ─────────────
-- Con la lealtad apagada NO se abona plata. El enlace del historial SÍ
-- se hace igual: es higiene de datos, no un regalo, y sirve para que
-- cuando enciendas ya tengas a la gente reconocida y con sus compras
-- pegadas. `socio_activado_at` tampoco se marca, así que al encender el
-- interruptor esa persona recibe su bono como corresponde.
create or replace function public.activar_socio()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v_ya timestamptz;
  v_enlazadas int := 0; v_gastado int := 0; v_credito int := 0;
  v_on boolean := public.lealtad_activa();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  select lower(btrim(email)), nullif(btrim(rut),''), socio_activado_at
    into v_email, v_rut, v_ya
    from public.clientes where id = v_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Esta cuenta no tiene correo');
  end if;

  -- Sus compras anteriores, por correo Y por RUT. Esto corre siempre.
  update public.pedidos p
     set cliente_id = v_id
   where p.cliente_id is null
     and ( lower(btrim(p.email_cliente)) = v_email
           or (v_rut is not null and nullif(btrim(p.rut_cliente),'') = v_rut) );

  select coalesce(count(*),0), coalesce(sum(coalesce(total_pagado,0)),0)
    into v_enlazadas, v_gastado
    from public.pedidos
   where cliente_id = v_id and estado = 'pagado' and coalesce(total_pagado,0) > 0;

  -- El crédito: UNA sola vez, solo si ya había comprado, y solo con la
  -- lealtad encendida.
  if v_on and v_ya is null and v_enlazadas > 0 then
    select coalesce(nullif(valor,'')::int, 0) into v_credito
      from public.config_valores where clave='socio_credito_bienvenida';
    if v_credito > 0 then
      update public.clientes
         set credito = coalesce(credito,0) + v_credito,
             socio_activado_at = now()
       where id = v_id;
      begin
        insert into public.movimientos(cliente_id, tipo, monto, concepto)
        values (v_id, 'credito', v_credito, 'Bienvenida · ya eras cliente');
      exception when others then null; end;
    else
      update public.clientes set socio_activado_at = now() where id = v_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lealtad_on', v_on,
    'compras', v_enlazadas,
    'gastado', v_gastado,
    'credito', case when v_on and v_ya is null then v_credito else 0 end,
    'ya_estaba', v_ya is not null
  );
end; $$;
grant execute on function public.activar_socio() to authenticated;

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
