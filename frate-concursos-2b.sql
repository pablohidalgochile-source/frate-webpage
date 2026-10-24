-- 🎰 CONCURSOS · parte 2b de 3 — el giro
-- Corre DESPUÉS de frate-concursos-2a.sql.

-- ── Girar ─────────────────────────────────────────────────────────
create or replace function public.concurso_girar(p_usuario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.concursos%rowtype; pr public.concurso_premios%rowtype;
        v_uid uuid := auth.uid(); v_mio jsonb; v_cod text; v_u text;
begin
  v_mio := public.concurso_mio();
  if not (v_mio->>'ok')::boolean then return v_mio; end if;

  select * into c from public.concursos where id = (v_mio->>'id')::bigint for update;

  -- La red social, si el concurso la pide. Es la moneda de cambio del sorteo.
  if c.pide_red then
    v_u := public.norm_usuario(coalesce(p_usuario,
             (select usuario_red from public.clientes where id = v_uid)));
    if v_u is null then return jsonb_build_object('ok', false, 'motivo', 'falta_red'); end if;
    update public.clientes
       set usuario_red = coalesce(nullif(btrim(usuario_red),''), v_u),
           red_social  = coalesce(nullif(btrim(red_social),''), 'instagram')
     where id = v_uid;
  end if;

  -- 🎲 El bolsón: primero los limitados CON stock, en orden y por su
  --    probabilidad. Si ninguno sale, cae el que gana todo el mundo.
  --    Nunca puede entregar lo que no existe.
  select * into pr from public.concurso_premios
   where concurso_id = c.id and not para_todos
     and (stock is null or entregados < stock)
     and random() * 100 < probabilidad
   order by orden limit 1 for update;

  if pr.id is null then
    select * into pr from public.concurso_premios
     where concurso_id = c.id and para_todos order by orden limit 1 for update;
  end if;
  if pr.id is null then return jsonb_build_object('ok', false, 'motivo', 'sin_premios'); end if;

  -- El premio sale como CÓDIGO, a nombre de quien giró y con vencimiento.
  v_cod := upper(substr(md5(random()::text || v_uid::text || clock_timestamp()::text), 1, 8));
  insert into public.premios_link (codigo, tipo, detalle, valor, evento_id, origen,
                                   nota, vence_at, usuario_red, red, creado_por)
  values (v_cod, pr.tipo, pr.detalle, pr.valor, c.evento_id, 'otro',
          'Concurso: ' || c.nombre, now() + (c.vence_dias || ' days')::interval,
          v_u, 'instagram', v_uid);

  update public.concurso_premios set entregados = entregados + 1 where id = pr.id;
  insert into public.concurso_giros (concurso_id, cliente_id, premio_id, codigo)
  values (c.id, v_uid, pr.id, v_cod);

  return jsonb_build_object('ok', true, 'tipo', pr.tipo, 'detalle', pr.detalle,
    'codigo', v_cod, 'vence_dias', c.vence_dias);
end $$;

grant execute on function public.concurso_girar(text) to authenticated;
