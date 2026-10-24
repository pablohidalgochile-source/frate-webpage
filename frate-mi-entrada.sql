-- 🎟️ MIS ENTRADAS · lo que sostiene frate.cl/mi-entrada
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- Busca las entradas de quien inició sesión por TRES caminos, porque la
-- gente compra de las tres formas:
--   1. La orden está pegada a su cuenta   (cliente_id)
--   2. Compró de invitada, con su correo  (email_cliente)
--   3. Otra persona le compró y su RUT quedó en el ticket  (personas[].rut)
--
-- ⚠️ EL CASO 3 ES EL DELICADO: la entrada es suya, pero LA PLATA NO. Si pide
--    devolución, MercadoPago le devuelve a QUIEN PAGÓ. Por eso cada fila
--    trae `pago_es_mio` y `comprador`, para poder decírselo en la cara antes
--    de que mande la solicitud.
--
-- El correo y el RUT los saca el SERVIDOR de auth.uid(). El navegador no
-- manda ningún identificador: si lo mandara, cualquiera pediría las
-- entradas de otro.

create or replace function public.mis_entradas()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text; v_rut text; v jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  select lower(btrim(email)), upper(regexp_replace(coalesce(rut,''), '[^0-9kK]', '', 'g'))
    into v_email, v_rut
    from public.clientes where id = v_id;
  v_rut := nullif(v_rut, '');

  select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha_evento desc nulls last, t.orden), '[]'::jsonb)
    into v
  from (
    select
      p.id                                            as pedido_id,
      'FCC-'||lpad(p.id::text,6,'0')                  as orden,
      p.nombre_cliente                                as comprador,
      p.email_cliente                                 as correo_comprador,
      p.estado                                        as estado_pedido,
      p.dev_estado,
      p.metodo_pago,
      -- ⭐ ¿la plata volvería a mí?
      (p.cliente_id = v_id
       or lower(btrim(coalesce(p.email_cliente,''))) = v_email)   as pago_es_mio,
      ip.nombre_ticket,
      ip.precio_unitario                              as precio,
      ip.evento_id,
      ev.nombre                                       as evento,
      ev.fecha                                        as fecha_evento,
      ev.hora,
      q.qr                                            as qr_id,
      per->>'nombre'                                  as persona,
      per->>'rut'                                     as persona_rut,
      (u.qr_id is not null)                           as ya_entro,
      (ev.fecha is not null and ev.fecha < current_date) as evento_paso
    from public.pedidos p
    join public.items_pedido ip on ip.pedido_id = p.id
    left join public.eventos ev on ev.id = ip.evento_id
    cross join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb))
               with ordinality q(qr, i)
    left join lateral (select coalesce(ip.personas -> (q.i-1)::int, '{}'::jsonb) as per) pp on true
    left join public.qr_usados u on u.qr_id = q.qr
    where p.estado = 'pagado'
      and (
        p.cliente_id = v_id
        or (v_email is not null and lower(btrim(coalesce(p.email_cliente,''))) = v_email)
        or (v_rut is not null
            and upper(regexp_replace(coalesce(per->>'rut',''), '[^0-9kK]', '', 'g')) = v_rut)
      )
  ) t;

  return jsonb_build_object('ok', true, 'correo', v_email, 'rut', v_rut, 'entradas', v);
end; $$;

revoke execute on function public.mis_entradas() from anon, public;
grant  execute on function public.mis_entradas() to authenticated;

comment on function public.mis_entradas is
  'Las entradas de quien inició sesión: por cuenta, por correo y por RUT en el ticket. pago_es_mio dice si la devolución le llegaría a esta persona o al comprador.';
