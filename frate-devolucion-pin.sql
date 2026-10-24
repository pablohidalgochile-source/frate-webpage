-- 🔒 LA VENTANA DE DEVOLUCIÓN + EL PIN DE EXCEPCIÓN
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- LA REGLA (Pablo, 2026-08-11):
--   · Hasta que TERMINA la noche → devolución abierta para todos, sin PIN.
--   · Después → cerrada. Solo con el PIN que sabe el equipo.
--   · Cambiar de día y dejar la entrada abierta siguen SIEMPRE disponibles:
--     son las salidas que no cuestan plata y las queremos empujar.
--
-- ⚠️ El PIN NO viaja al navegador. La página manda lo que el cliente
--    escribió y el SERVIDOR compara. Si lo mandáramos para comparar en el
--    navegador, cualquiera lo leería en el código de la página.

insert into public.config_valores(clave, valor)
select 'devolucion_pin', '4729'
where not exists (select 1 from public.config_valores where clave='devolucion_pin');


-- ── Registro de cada excepción ─────────────────────────────────────
create table if not exists public.devolucion_excepciones (
  id          bigserial primary key,
  pedido_id   int         references public.pedidos(id),
  cliente_id  uuid        references public.clientes(id),
  evento_id   int,
  fecha_evento date,
  motivo      text,
  created_at  timestamptz not null default now()
);

create index if not exists dev_exc_fecha on public.devolucion_excepciones (created_at desc);

comment on table public.devolucion_excepciones is
  'Cada vez que alguien usó el PIN para pedir devolución con el evento ya terminado. Si esto crece, la regla no se está respetando.';

alter table public.devolucion_excepciones enable row level security;

drop policy if exists dev_exc_admin on public.devolucion_excepciones;
create policy dev_exc_admin on public.devolucion_excepciones for select
  using (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'));


-- ── Verificar el PIN · el servidor compara, nunca el navegador ─────
create or replace function public.devolucion_pin_ok(p_pin text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select btrim(valor) = btrim(coalesce(p_pin,''))
       from public.config_valores where clave = 'devolucion_pin'
       and coalesce(btrim(valor),'') <> ''),
    false)
$$;

revoke execute on function public.devolucion_pin_ok(text) from anon, public;
grant  execute on function public.devolucion_pin_ok(text) to authenticated;


-- ── Cuántas excepciones van este mes ───────────────────────────────
create or replace function public.devolucion_excepciones_mes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v int; v_tot int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  select count(*) into v from public.devolucion_excepciones
   where created_at >= date_trunc('month', now());
  select count(*) into v_tot from public.devolucion_excepciones;
  return jsonb_build_object('ok', true, 'mes', v, 'total', v_tot);
end; $$;

revoke execute on function public.devolucion_excepciones_mes() from anon, public;
grant  execute on function public.devolucion_excepciones_mes() to authenticated;


-- ── Chequeo ────────────────────────────────────────────────────────
select 'PIN configurado' as que,
       repeat('•', length(coalesce((select valor from public.config_valores where clave='devolucion_pin'),''))) as pin,
       'Cámbialo en Configuración cuando quieras' as nota;
