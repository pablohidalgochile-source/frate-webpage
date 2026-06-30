-- ============================================================
-- FRATE — Cumpleañero + Referidos (Contagia a tu amig@)
-- Correr en Supabase SQL Editor.
-- ============================================================

-- ── Columnas en clientes ─────────────────────────────────────
alter table public.clientes add column if not exists cumple_ultimo_anio     integer;      -- año en que ya recibió el regalo
alter table public.clientes add column if not exists referido_por_codigo    text;         -- username del que lo invitó
alter table public.clientes add column if not exists referido_recompensado  boolean default false;

-- ── Valores configurables ────────────────────────────────────
insert into public.config_valores (clave, valor, label) values
  ('cumple_credito', '5000', 'Crédito de regalo en el mes de cumpleaños ($)'),
  ('referido_monto', '1000', 'Crédito por referido — para ambos ($)')
on conflict (clave) do nothing;

-- ── RPC: regalo de cumpleaños (1 vez por año, en tu mes) ──────
create or replace function public.otorgar_cumple(p_cliente_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_nac date; v_anio_ot int; v_anio int := extract(year from now()); v_credito int;
begin
  select fecha_nacimiento, cumple_ultimo_anio into v_nac, v_anio_ot from clientes where id = p_cliente_id;
  if v_nac is null then return json_build_object('ok', false, 'reason', 'sin_fecha'); end if;
  if extract(month from v_nac) <> extract(month from now()) then return json_build_object('ok', false, 'reason', 'no_es_tu_mes'); end if;
  if coalesce(v_anio_ot, 0) = v_anio then return json_build_object('ok', false, 'reason', 'ya_recibido'); end if;
  select coalesce(valor, '5000')::int into v_credito from config_valores where clave = 'cumple_credito';
  v_credito := coalesce(v_credito, 5000);
  update clientes set credito = coalesce(credito, 0) + v_credito, cumple_ultimo_anio = v_anio where id = p_cliente_id;
  insert into movimientos (cliente_id, tipo, monto, concepto) values (p_cliente_id, 'credito', v_credito, 'Regalo de cumpleaños 🎂');
  return json_build_object('ok', true, 'credito', v_credito);
end; $$;
grant execute on function public.otorgar_cumple(uuid) to anon, authenticated;

-- ── RPC: cuántos amig@s invité (por mi username) ─────────────
create or replace function public.contar_referidos(p_username text)
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::int from clientes where referido_por_codigo = lower(trim(p_username));
$$;
grant execute on function public.contar_referidos(text) to anon, authenticated;

-- ============================================================
-- LISTO. Los regalos de referido se otorgan en mp-webhook
-- (al primer pago del invitado). Todo editable en config_valores.
-- ============================================================
