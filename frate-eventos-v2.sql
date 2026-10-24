-- ============================================================
-- FRATE — EVENTOS V2: estados, horario nocturno, vencimientos,
-- devoluciones solicitadas, incidencias de puerta y ruleta.
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
-- ============================================================

-- ── 1) EVENTOS: estado + hora de término ─────────────────────
-- estado: 'creado' (borrador) | 'publicado' (a la venta) | 'en_vivo'
alter table public.eventos add column if not exists estado       text default 'publicado';
alter table public.eventos add column if not exists hora_termino text default '05:00';
-- por si no corriste el SQL anterior:
alter table public.eventos add column if not exists video_url    text;
alter table public.eventos add column if not exists external_id  text;
create unique index if not exists eventos_external_id_key
  on public.eventos (external_id) where external_id is not null;

-- Migración: lo activo queda publicado, lo inactivo queda creado
update public.eventos set estado = case when activo then 'publicado' else 'creado' end;

-- ── 2) TICKETS: hora de vencimiento por tipo ─────────────────
-- Regla nocturna: 12:00–23:59 = el día del evento; 00:00–11:59 = la
-- madrugada siguiente. Vacío = vende hasta la hora de término.
alter table public.tipos_ticket add column if not exists vence_hora text;

-- ── 3) DEVOLUCIONES solicitadas por el cliente ───────────────
alter table public.pedidos add column if not exists dev_solicitada_at timestamptz;
alter table public.pedidos add column if not exists dev_motivo        text;
alter table public.pedidos add column if not exists dev_estado        text;  -- 'pendiente' | 'aprobada' | 'rechazada'
alter table public.pedidos add column if not exists dev_respuesta     text;

-- ── 4) INCIDENCIAS de puerta (quemado pero no entró) ─────────
alter table public.qr_usados add column if not exists incidencia      text;  -- 'posible_devolucion'
alter table public.qr_usados add column if not exists incidencia_nota text;

-- ── 5) RPCs de PUERTA (admin y portero validan sin abrir RLS) ─
create or replace function public.puerta_rol_ok() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from clientes where id = auth.uid() and rol in ('admin','portero'));
$$;

-- Revisa un QR (no lo quema): devuelve todo lo que la puerta necesita ver
create or replace function public.puerta_check_qr(p_qr text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_usado qr_usados%rowtype;
  v_idx int;
  v_persona json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;

  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;

  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then
    return json_build_object('ok', false, 'motivo', 'Pedido no pagado (estado: '||coalesce(v_pedido.estado,'—')||')');
  end if;

  -- posición del QR dentro del item → persona correspondiente
  select i-1 into v_idx from jsonb_array_elements_text(v_item.qr_ids) with ordinality t(qr, i) where t.qr = p_qr;
  v_persona := coalesce(v_item.personas -> v_idx, 'null'::jsonb)::json;

  select * into v_usado from qr_usados where qr_id = p_qr;

  return json_build_object(
    'ok', true,
    'ya_usado', found,
    'usado_at', v_usado.created_at,
    'incidencia', v_usado.incidencia,
    'pedido_id', v_pedido.id,
    'orden', 'FCC-'||lpad(v_pedido.id::text, 6, '0'),
    'comprador', v_pedido.nombre_cliente,
    'email', v_pedido.email_cliente,
    'evento_id', v_item.evento_id,
    'nombre_evento', v_item.nombre_evento,
    'nombre_ticket', v_item.nombre_ticket,
    'condiciones', v_item.condiciones,
    'persona', v_persona
  );
end; $$;

-- Quema un QR (registra el ingreso)
create or replace function public.puerta_quemar_qr(p_qr text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item items_pedido%rowtype;
  v_pedido pedidos%rowtype;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;
  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then return json_build_object('ok', false, 'motivo', 'Pedido no pagado'); end if;
  if exists (select 1 from qr_usados where qr_id = p_qr) then
    return json_build_object('ok', false, 'motivo', 'Ya fue escaneado');
  end if;
  insert into qr_usados (qr_id, pedido_id, escaneado_por) values (p_qr, v_pedido.id, auth.uid());
  return json_build_object('ok', true);
end; $$;

-- Marca un QR YA QUEMADO como posible devolución (no entró: ebriedad, etc.)
create or replace function public.puerta_incidencia(p_qr text, p_nota text default null) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;
  update qr_usados set incidencia = 'posible_devolucion', incidencia_nota = p_nota where qr_id = p_qr;
  if not found then
    return json_build_object('ok', false, 'motivo', 'Ese QR no está quemado. Si no entró y no se quemó, el cliente pide la devolución desde su cuenta.');
  end if;
  return json_build_object('ok', true);
end; $$;

grant execute on function public.puerta_rol_ok() to authenticated;
grant execute on function public.puerta_check_qr(text) to authenticated;
grant execute on function public.puerta_quemar_qr(text) to authenticated;
grant execute on function public.puerta_incidencia(text, text) to authenticated;

-- ── 6) RULETA "Gira y gana" ──────────────────────────────────
create table if not exists public.giros (
  id           serial primary key,
  cliente_id   uuid references public.clientes(id) on delete cascade,
  pedido_id    integer references public.pedidos(id) on delete set null,
  origen       text default 'compra',
  usado        boolean default false,
  premio       text,
  premio_tipo  text,     -- 'credito' | 'puntos' | 'beneficio' | 'nada'
  premio_valor integer default 0,
  created_at   timestamptz default now(),
  usado_at     timestamptz
);
alter table public.giros enable row level security;
drop policy if exists "giros_own_read" on public.giros;
create policy "giros_own_read" on public.giros for select using (auth.uid() = cliente_id);

-- Girar: el SERVIDOR elige el premio (nadie puede tramposear)
create or replace function public.girar_ruleta() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_giro giros%rowtype;
  v_r numeric := random();
  v_premio text; v_tipo text; v_valor int := 0;
begin
  if auth.uid() is null then return json_build_object('error','Inicia sesión'); end if;
  select * into v_giro from giros where cliente_id = auth.uid() and not usado
    order by created_at limit 1 for update skip locked;
  if not found then return json_build_object('error','sin_giros'); end if;

  if     v_r < 0.30 then v_premio := '$1.000 de crédito';  v_tipo := 'credito';   v_valor := 1000;
  elsif  v_r < 0.45 then v_premio := '$2.000 de crédito';  v_tipo := 'credito';   v_valor := 2000;
  elsif  v_r < 0.70 then v_premio := '50 puntos';          v_tipo := 'puntos';    v_valor := 50;
  elsif  v_r < 0.80 then v_premio := 'Trago de la casa';   v_tipo := 'beneficio'; v_valor := 0;
  else                   v_premio := 'Sigue participando'; v_tipo := 'nada';      v_valor := 0;
  end if;

  if v_tipo = 'credito' then
    update clientes set credito = coalesce(credito,0) + v_valor where id = auth.uid();
    insert into movimientos (cliente_id, tipo, monto, concepto) values (auth.uid(), 'credito', v_valor, 'Ruleta Gira y gana');
  elsif v_tipo = 'puntos' then
    update clientes set puntos = coalesce(puntos,0) + v_valor where id = auth.uid();
    insert into movimientos (cliente_id, tipo, monto, concepto) values (auth.uid(), 'puntos', v_valor, 'Ruleta Gira y gana');
  end if;

  update giros set usado = true, usado_at = now(), premio = v_premio, premio_tipo = v_tipo, premio_valor = v_valor
   where id = v_giro.id;

  return json_build_object('ok', true, 'premio', v_premio, 'tipo', v_tipo, 'valor', v_valor);
end; $$;
grant execute on function public.girar_ruleta() to authenticated;

-- Config de la ruleta (aparece sola en tu panel de Configuración)
insert into public.config_sitio (clave, visible, label) values
  ('ruleta', false, 'Ruleta "Gira y gana" (giro por compra sobre el mínimo)')
on conflict (clave) do nothing;
insert into public.config_valores (clave, valor, label) values
  ('ruleta_monto_minimo', '10000', 'Ruleta — compra mínima para ganar un giro ($)')
on conflict (clave) do nothing;

-- ── 7) Verificación ──────────────────────────────────────────
select 'eventos con estado' as check, count(*)::text as valor from eventos where estado is not null
union all select 'RPC puerta_check_qr', case when exists(select 1 from pg_proc where proname='puerta_check_qr') then 'OK' else 'FALTA' end
union all select 'RPC girar_ruleta',    case when exists(select 1 from pg_proc where proname='girar_ruleta')    then 'OK' else 'FALTA' end
union all select 'tabla giros',         case when exists(select 1 from pg_tables where tablename='giros')        then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO.
-- ============================================================
