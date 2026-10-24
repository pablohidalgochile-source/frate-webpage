-- 🎁 PREMIOS · PARTE 2 de 2 — mirar y reclamar
-- Corre después de la parte 1. Idempotente.

-- ── Ver qué es el premio, SIN reclamarlo ──────────────────────────
-- Público a propósito: la persona tiene que poder ver qué ganó ANTES de
-- crearse una cuenta. Si le pidiéramos registrarse a ciegas, la mitad se
-- va. No expone nada sensible: solo el tipo, el detalle y si sigue vivo.
create or replace function public.premio_ver(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then jsonb_build_object('ok', false, 'motivo', 'no_existe')
              when p.vence_at is not null and p.vence_at < now()
                   then jsonb_build_object('ok', false, 'motivo', 'vencido')
              when p.usos >= coalesce(p.usos_max, 1)
                   then jsonb_build_object('ok', false, 'motivo', 'agotado')
              else jsonb_build_object('ok', true, 'tipo', p.tipo, 'detalle', p.detalle,
                     'valor', p.valor, 'origen', p.origen, 'vence_at', p.vence_at,
                     'evento', (select e.nombre from public.eventos e where e.id = p.evento_id),
                     'fecha',  (select e.fecha  from public.eventos e where e.id = p.evento_id))
         end
  from (select * from public.premios_link where upper(codigo) = upper(btrim(p_codigo))) p
  right join (select 1) x on true
$$;

grant execute on function public.premio_ver(text) to anon, authenticated;


-- ── Reclamarlo · deja el premio a nombre de quien está logueado ────
create or replace function public.premio_canjear(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.premios_link%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  -- `for update` para que dos personas que aprieten a la vez no se lleven
  -- el mismo cupo. Sin esto, un código de uso único se puede canjear dos
  -- veces si los clics caen en el mismo instante.
  select * into p from public.premios_link
   where upper(codigo) = upper(btrim(p_codigo)) for update;

  if p.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if p.vence_at is not null and p.vence_at < now() then
    return jsonb_build_object('ok', false, 'motivo', 'vencido'); end if;

  -- ¿Ya lo tenía? No es error: se le muestra igual, para que no piense
  -- que perdió el premio por apretar dos veces.
  if exists (select 1 from public.premios_link_canjes where premio_id = p.id and cliente_id = v_uid) then
    return jsonb_build_object('ok', true, 'repetido', true, 'tipo', p.tipo,
                              'detalle', p.detalle, 'valor', p.valor);
  end if;

  if p.usos >= coalesce(p.usos_max, 1) then
    return jsonb_build_object('ok', false, 'motivo', 'agotado'); end if;

  insert into public.premios_link_canjes (premio_id, cliente_id) values (p.id, v_uid);
  update public.premios_link set usos = coalesce(usos,0) + 1 where id = p.id;

  return jsonb_build_object('ok', true, 'tipo', p.tipo, 'detalle', p.detalle,
                            'valor', p.valor, 'evento_id', p.evento_id);
end $$;

revoke execute on function public.premio_canjear(text) from anon;
grant  execute on function public.premio_canjear(text) to authenticated;


-- ── Chequeo ────────────────────────────────────────────────────────
select public.premio_ver('NO-EXISTE-123') as prueba_codigo_falso;
