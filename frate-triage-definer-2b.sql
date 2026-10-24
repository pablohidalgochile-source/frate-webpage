-- ═══════════════════════════════════════════════════════════════════
-- 🔐 SEGUNDA PASADA · PARTE 2 de 2 — lealtad y códigos
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor · corre después de 2a
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) loyalty_de_rut · cerrar a anon ──────────────────────────────
-- Hoy cualquiera prueba RUT uno por uno y ve visitas y nivel de esa
-- persona. Dato personal, y encima enumerable.
-- La llama SOLO la edge `api-crm`, del lado del servidor con llave de
-- servicio: cerrarla a anon no rompe nada.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'loyalty_de_rut'
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    raise notice 'cerrada a anon: %', r.sig;
  end loop;
end $$;


-- ── 2) incrementar_uso_codigo · cerrar también a authenticated ─────
-- La primera pasada la cerró a anon. Pero un usuario con cuenta todavía
-- puede quemarle el tope a un código. Los dos webhooks la llaman con
-- llave de servicio, que se salta los grants: no necesita a nadie más.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'incrementar_uso_codigo'
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
  end loop;
end $$;


-- ── 3) canjear_premio · que no acepte el id de otra persona ────────
-- Hoy recibe p_cliente_id y descuenta puntos de esa cuenta. Está dormido
-- porque la lealtad está apagada, pero hay que cerrarlo ANTES de
-- encenderla: si no, el día que la prendas queda abierto.
create or replace function public.canjear_premio(p_cliente_id uuid, p_premio_id int)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_premio record; v_puntos int;
begin
  if not public.lealtad_activa() then
    return json_build_object('ok', false, 'error', 'Los premios están pausados por ahora');
  end if;
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  select * into v_premio from premios where id = p_premio_id and activo = true;
  if v_premio is null then
    return json_build_object('ok', false, 'error', 'Premio no disponible'); end if;
  if v_premio.stock is not null and v_premio.stock <= 0 then
    return json_build_object('ok', false, 'error', 'Sin stock'); end if;

  select puntos into v_puntos from clientes where id = v_uid;
  if coalesce(v_puntos, 0) < v_premio.costo_puntos then
    return json_build_object('ok', false, 'error', 'Puntos insuficientes'); end if;

  update clientes set puntos = puntos - v_premio.costo_puntos where id = v_uid;
  insert into movimientos (cliente_id, tipo, monto, concepto)
  values (v_uid, 'puntos', -v_premio.costo_puntos, 'Canje: ' || v_premio.nombre);

  if v_premio.tipo = 'credito' then
    update clientes set credito = coalesce(credito, 0) + v_premio.valor where id = v_uid;
    insert into movimientos (cliente_id, tipo, monto, concepto)
    values (v_uid, 'credito', v_premio.valor, 'Premio: ' || v_premio.nombre);
  end if;
  if v_premio.stock is not null then
    update premios set stock = stock - 1 where id = p_premio_id;
  end if;
  return json_build_object('ok', true, 'premio', v_premio.nombre);
end; $$;

revoke execute on function public.canjear_premio(uuid, int) from anon, public;
grant  execute on function public.canjear_premio(uuid, int) to authenticated;
