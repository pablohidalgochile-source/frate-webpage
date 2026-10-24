-- 📱 PARTE 2 de 2 · el premio exige el usuario que ganó
-- Corre DESPUÉS de frate-redes-1.sql. Reemplaza las dos funciones.

-- ── Ver el premio · ahora dice si pide usuario ────────────────────
-- Sigue siendo público a propósito: la persona tiene que ver QUÉ ganó antes
-- de crearse cuenta. No revela a quién pertenece — solo que hace falta uno.
create or replace function public.premio_ver(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then jsonb_build_object('ok', false, 'motivo', 'no_existe')
              when p.vence_at is not null and p.vence_at < now()
                   then jsonb_build_object('ok', false, 'motivo', 'vencido')
              when p.usos >= coalesce(p.usos_max, 1)
                   then jsonb_build_object('ok', false, 'motivo', 'agotado')
              else jsonb_build_object('ok', true, 'tipo', p.tipo, 'detalle', p.detalle,
                     'valor', p.valor, 'origen', p.origen, 'vence_at', p.vence_at,
                     'pide_usuario', (public.norm_usuario(p.usuario_red) is not null
                                      and not coalesce(p.liberado, false)),
                     'red', p.red,
                     'evento', (select e.nombre from public.eventos e where e.id = p.evento_id),
                     'fecha',  (select e.fecha  from public.eventos e where e.id = p.evento_id))
         end
  from (select * from public.premios_link where upper(codigo) = upper(btrim(p_codigo))) p
  right join (select 1) x on true
$$;

grant execute on function public.premio_ver(text) to anon, authenticated;


-- ── Reclamar · exige el usuario y lo guarda en la ficha ───────────
create or replace function public.premio_canjear(p_codigo text, p_usuario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.premios_link%rowtype; v_uid uuid := auth.uid();
        v_esperado text; v_dado text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'motivo', 'sin_sesion'); end if;

  select * into p from public.premios_link
   where upper(codigo) = upper(btrim(p_codigo)) for update;

  if p.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if p.vence_at is not null and p.vence_at < now() then
    return jsonb_build_object('ok', false, 'motivo', 'vencido'); end if;

  -- Ya lo tenía: se le muestra igual, no es error.
  if exists (select 1 from public.premios_link_canjes where premio_id = p.id and cliente_id = v_uid) then
    return jsonb_build_object('ok', true, 'repetido', true, 'tipo', p.tipo,
                              'detalle', p.detalle, 'valor', p.valor);
  end if;

  -- 🔒 El candado del usuario. Si el premio salió a nombre de alguien, solo
  --    esa persona lo cobra — aunque le reenvíen el link por whatsapp.
  v_esperado := public.norm_usuario(p.usuario_red);
  if v_esperado is not null and not coalesce(p.liberado, false) then
    v_dado := public.norm_usuario(p_usuario);
    if v_dado is null then
      return jsonb_build_object('ok', false, 'motivo', 'falta_usuario', 'red', p.red);
    end if;
    if v_dado <> v_esperado then
      return jsonb_build_object('ok', false, 'motivo', 'usuario_no_calza', 'red', p.red);
    end if;
  end if;

  if p.usos >= coalesce(p.usos_max, 1) then
    return jsonb_build_object('ok', false, 'motivo', 'agotado'); end if;

  insert into public.premios_link_canjes (premio_id, cliente_id) values (p.id, v_uid);
  update public.premios_link set usos = coalesce(usos,0) + 1 where id = p.id;

  -- El usuario queda pegado a la cuenta: la próxima vez ya sabes quién es.
  -- Solo se escribe si la ficha no lo tenía — nunca se pisa lo que la
  -- persona puso a mano en su perfil.
  if coalesce(v_esperado, public.norm_usuario(p_usuario)) is not null then
    update public.clientes
       set usuario_red = coalesce(nullif(btrim(usuario_red), ''), coalesce(v_esperado, public.norm_usuario(p_usuario))),
           red_social  = coalesce(nullif(btrim(red_social), ''),  coalesce(p.red, 'instagram'))
     where id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'tipo', p.tipo, 'detalle', p.detalle,
                            'valor', p.valor, 'evento_id', p.evento_id);
end $$;

grant execute on function public.premio_canjear(text, text) to authenticated;
