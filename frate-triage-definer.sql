-- ═══════════════════════════════════════════════════════════════════
-- 🔐 TRIAGE de las ~95 `security definer` · solo lo que de verdad falla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- Revisadas una por una CONTRA EL CÓDIGO, no por el nombre (2026-08-05).
--
-- Los `admin_*` están BIEN: validan auth.uid() + rol adentro. Igual
-- anular_pedido, editar_asistente, puerta_capturar_cliente, rrpp_liquidar,
-- incentivo_dar, buscar_personas, stats_codigos y puerta_buscar_rut.
-- NO se tocan.
--
-- registrar_visita y contar_referidos son anónimas a propósito.
-- NO se tocan.
--
-- Acá van SOLO las dos que fallan de verdad y se arreglan sin romper nada.
-- La tercera (get_email_by_username) NO va: necesita decisión de Pablo,
-- está explicada abajo.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1) incrementar_uso_codigo · cerrar a anon ──────────────────────
-- Hoy cualquiera puede inflarle el contador de usos a un código de
-- descuento. Si el código tiene tope, se lo queman y deja de servir.
-- La llaman SOLO mp-webhook y khipu-webhook, del lado del servidor y con
-- llave de servicio. El navegador no la necesita: cerrarla no rompe nada.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'incrementar_uso_codigo'
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    raise notice 'cerrada a anon: %', r.sig;
  end loop;
end $$;


-- ── 2) otorgar_cumple · que no acepte el id de otra persona ────────
-- Hoy recibe un p_cliente_id cualquiera. index.html le pasa el propio
-- (session.id), pero nada impide pasarle el de otro y dispararle el
-- regalo de cumpleaños a gente ajena.
--
-- El arreglo: ignora el parámetro y usa SIEMPRE auth.uid(). Se mantiene
-- la firma para no romper la llamada que ya está en index.html.
create or replace function public.otorgar_cumple(p_cliente_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();          -- el que pide, no el que le mandaron
  v_nac date; v_anio_ot int;
  v_anio int := extract(year from now())::int;
  v_credito int;
begin
  if v_id is null then
    return json_build_object('ok', false, 'reason', 'sin_sesion');
  end if;

  select fecha_nacimiento, cumple_ultimo_anio into v_nac, v_anio_ot
    from clientes where id = v_id;

  if v_nac is null then
    return json_build_object('ok', false, 'reason', 'sin_fecha');
  end if;
  if extract(month from v_nac) <> extract(month from now()) then
    return json_build_object('ok', false, 'reason', 'no_es_tu_mes');
  end if;
  if coalesce(v_anio_ot, 0) = v_anio then
    return json_build_object('ok', false, 'reason', 'ya_recibido');
  end if;

  select coalesce(nullif(valor,'')::int, 5000) into v_credito
    from config_valores where clave = 'cumple_credito';
  v_credito := coalesce(v_credito, 5000);

  update clientes
     set credito = coalesce(credito, 0) + v_credito,
         cumple_ultimo_anio = v_anio
   where id = v_id;

  insert into movimientos (cliente_id, tipo, monto, concepto)
  values (v_id, 'credito', v_credito, 'Regalo de cumpleaños 🎂');

  return json_build_object('ok', true, 'credito', v_credito);
end; $$;

revoke execute on function public.otorgar_cumple(uuid) from anon, public;
grant  execute on function public.otorgar_cumple(uuid) to authenticated;
