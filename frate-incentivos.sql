-- ============================================================
-- FRATE · INCENTIVOS — la caja de herramientas para traer gente de vuelta
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- LA IDEA: no un beneficio fijo, sino VARIOS que tú escribes y activas según
-- el caso. Al que compró se le ofrece descuento en su próxima entrada; al que
-- vino de cortesía, descuento en covers. Y a un cliente puntual le puedes dar
-- el que quieras, con un mensaje tuyo.
--
-- 🔒 TODO NACE APAGADO. El interruptor maestro manda: aunque haya incentivos
--    escritos y activos, si `incentivos_on` está en false no sale nada. Es el
--    mismo patrón del BCC del correo, que ya está probado.
--
-- Idempotente.
-- ============================================================

-- ── 0) El interruptor maestro. APAGADO. ──
insert into public.config_valores(clave, valor)
select 'incentivos_on', 'false'
where not exists (select 1 from public.config_valores where clave='incentivos_on');


-- ── 1) La biblioteca ──
create table if not exists public.incentivos (
  id          serial primary key,
  clave       text unique not null,        -- 'socio_compra', 'cover_cortesia', ...
  nombre      text not null,               -- cómo lo llamas tú en el panel
  tipo        text not null default 'credito',   -- credito · descuento_cover · beneficio
  valor       integer default 0,           -- $ de crédito, o % / $ de descuento
  titulo      text,                        -- lo que ve el cliente
  texto       text,                        -- admite {nombre} {compras} {valor} {evento}
  boton       text default 'CREAR MI CUENTA',
  aplica_a    text not null default 'manual',    -- compra · cortesia · ambos · manual
  activo      boolean default false,       -- 🔒 apagado
  orden       integer default 0,
  creado_at   timestamptz default now()
);

-- Los dos que pediste, escritos y APAGADOS.
insert into public.incentivos(clave, nombre, tipo, valor, titulo, texto, boton, aplica_a, activo, orden)
select * from (values
  ('socio_compra', 'Socio · descuento próxima entrada', 'credito', 1000,
   'Ya eres parte de FRATE',
   '{nombre}, esta es tu entrada N° {compras} con nosotros. Crea tu cuenta y te dejamos {valor} de descuento en tu próxima entrada, más tu historial y tus beneficios en un solo lugar.',
   'CREAR MI CUENTA', 'compra', false, 1),
  ('cover_cortesia', 'Cortesía · descuento en covers', 'descuento_cover', 1000,
   'La próxima, con descuento en la barra',
   '{nombre}, gracias por venir. Si creas tu cuenta te dejamos {valor} de descuento en covers para tu próxima noche.',
   'CREAR MI CUENTA', 'cortesia', false, 2)
) v(clave, nombre, tipo, valor, titulo, texto, boton, aplica_a, activo, orden)
where not exists (select 1 from public.incentivos i where i.clave = v.clave);

alter table public.incentivos enable row level security;
drop policy if exists incentivos_lectura on public.incentivos;
create policy incentivos_lectura on public.incentivos for select using (true);   -- el cliente ve el suyo
drop policy if exists incentivos_admin on public.incentivos;
create policy incentivos_admin on public.incentivos for all
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol='admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol='admin'));


-- ── 2) Lo que se le dio a cada persona ──
-- Se puede asignar a una cuenta (cliente_id) o solo a un correo, para la
-- gente que todavía no se registra.
create table if not exists public.incentivos_dados (
  id            bigserial primary key,
  incentivo_id  int references public.incentivos(id),
  cliente_id    uuid,
  email         text,
  mensaje       text,                     -- el mensaje tuyo, personal
  estado        text not null default 'activo',   -- activo · usado · vencido
  vence_at      timestamptz,
  dado_por      uuid,
  dado_por_nom  text,
  creado_at     timestamptz default now(),
  usado_at      timestamptz,
  pedido_id     bigint
);
create index if not exists idx_incd_cliente on public.incentivos_dados(cliente_id, estado);
create index if not exists idx_incd_email   on public.incentivos_dados(lower(btrim(email)), estado);

alter table public.incentivos_dados enable row level security;
drop policy if exists incd_propio on public.incentivos_dados;
create policy incd_propio on public.incentivos_dados for select
  using (cliente_id = auth.uid()
         or exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp')));
-- Escribir solo por las funciones de abajo.
revoke insert, update, delete on public.incentivos_dados from anon, authenticated;


-- ── 3) Dárselo a alguien (admin) ──
create or replace function public.incentivo_dar(
  p_incentivo_id int, p_email text, p_mensaje text default null,
  p_cliente_id uuid default null, p_dias int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_nom text; v_id bigint; v_cli uuid;
begin
  select rol, coalesce(nullif('@'||username,'@'),
                       nullif(btrim(coalesce(nombres,'')||' '||coalesce(apellidos,'')),''), email)
    into v_rol, v_nom from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  if not exists (select 1 from public.incentivos where id = p_incentivo_id) then
    return jsonb_build_object('ok', false, 'error', 'Ese incentivo no existe');
  end if;

  v_cli := p_cliente_id;
  if v_cli is null and coalesce(btrim(p_email),'') <> '' then
    select id into v_cli from public.clientes
     where lower(btrim(email)) = lower(btrim(p_email)) limit 1;
  end if;
  if v_cli is null and coalesce(btrim(p_email),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el correo o la cuenta');
  end if;

  insert into public.incentivos_dados(incentivo_id, cliente_id, email, mensaje,
                                      vence_at, dado_por, dado_por_nom)
  values (p_incentivo_id, v_cli, nullif(btrim(lower(coalesce(p_email,''))),''),
          nullif(btrim(coalesce(p_mensaje,'')),''),
          case when p_dias is not null then now() + (p_dias || ' days')::interval end,
          auth.uid(), v_nom)
  returning id into v_id;

  perform public.bitacora_registrar('incentivo_dado', null, null, 0,
            jsonb_build_object('incentivo_id', p_incentivo_id, 'para', coalesce(p_email, v_cli::text)));

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.incentivo_dar(int,text,text,uuid,int) to authenticated;


-- ── 4) Los MÍOS (lo que ve el cliente en su pestaña) ──
create or replace function public.mis_incentivos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid(); v_email text; v_on boolean;
begin
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Sin sesión'); end if;
  select lower(coalesce(valor,'')) = 'true' into v_on
    from public.config_valores where clave='incentivos_on';
  if not coalesce(v_on, false) then
    return jsonb_build_object('ok', true, 'apagado', true, 'items', '[]'::jsonb);
  end if;
  select lower(btrim(email)) into v_email from public.clientes where id = v_id;

  return jsonb_build_object('ok', true, 'apagado', false, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'titulo', i.titulo, 'texto', i.texto, 'tipo', i.tipo,
             'valor', i.valor, 'mensaje', d.mensaje, 'vence_at', d.vence_at,
             'estado', d.estado) order by d.creado_at desc)
      from public.incentivos_dados d
      join public.incentivos i on i.id = d.incentivo_id
     where d.estado = 'activo'
       and (d.vence_at is null or d.vence_at > now())
       and (d.cliente_id = v_id or (v_email is not null and lower(btrim(d.email)) = v_email))
  ), '[]'::jsonb));
end; $$;
grant execute on function public.mis_incentivos() to authenticated;


-- ── 5) Verificación ──
select 'interruptor maestro' as chequeo,
       coalesce((select valor from public.config_valores where clave='incentivos_on'), '❌ falta') as estado
union all
select 'tabla incentivos',
       case when exists(select 1 from information_schema.tables where table_name='incentivos') then '✅ ok' else '❌ falta' end
union all
select 'tabla incentivos_dados',
       case when exists(select 1 from information_schema.tables where table_name='incentivos_dados') then '✅ ok' else '❌ falta' end
union all
select 'función incentivo_dar',
       case when exists(select 1 from pg_proc where proname='incentivo_dar') then '✅ ok' else '❌ falta' end
union all
select 'función mis_incentivos',
       case when exists(select 1 from pg_proc where proname='mis_incentivos') then '✅ ok' else '❌ falta' end;

select clave, nombre, tipo, valor, aplica_a,
       case when activo then '🟢 activo' else '⚪️ apagado' end as estado
from public.incentivos order by orden;

-- ============================================================
-- QUEDA TODO APAGADO. Para encenderlo:
--   Configuración → 🎁 Incentivos → interruptor de arriba,
--   y después el de cada incentivo por separado.
--
-- Dos interruptores a propósito: puedes tener el maestro encendido y
-- solo uno de los incentivos activo, o apagar todo de un golpe sin
-- perder lo que escribiste.
-- ============================================================
