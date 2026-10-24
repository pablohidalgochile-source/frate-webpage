-- ============================================================
-- FRATE · FASES 1 y 2 — SQL en un solo archivo
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor. Idempotente.
--
--   BLOQUE A · Correos que rebotaron (para cazar al que puso mal su mail)
--   BLOQUE B · Notas de crédito con tabla propia (hoy una devolución
--              parcial pisa a la anterior → IVA subdeclarado)
--   BLOQUE C · Doble ingreso offline en la puerta (dos porteros sin señal)
--   BLOQUE D · Rate limiting (freno a los abusos por fuerza bruta)
-- ============================================================


-- ╔══════════════════════════════════════════════════════════╗
-- ║ A · CORREOS REBOTADOS                                    ║
-- ╚══════════════════════════════════════════════════════════╝
create table if not exists public.email_rebotes (
  email      text primary key,
  tipo       text,                    -- email.bounced | email.complained | ...
  motivo     text,
  asunto     text,
  veces      int  default 1,
  resuelto   boolean default false,   -- el equipo ya contactó a la persona
  ultimo_at  timestamptz default now()
);
create index if not exists idx_rebotes_fecha on public.email_rebotes(ultimo_at desc);

alter table public.email_rebotes enable row level security;
drop policy if exists rebotes_staff on public.email_rebotes;
create policy rebotes_staff on public.email_rebotes for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp','portero')))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));


-- ╔══════════════════════════════════════════════════════════╗
-- ║ B · NOTAS DE CRÉDITO — una fila por devolución            ║
-- ║ Antes se guardaban en columnas de `pedidos`, así que dos  ║
-- ║ devoluciones parciales de $8.000 quedaban como $8.000     ║
-- ║ (y el IVA a recuperar salía a la mitad).                  ║
-- ╚══════════════════════════════════════════════════════════╝
create table if not exists public.notas_credito (
  id          bigserial primary key,
  pedido_id   bigint not null,
  monto       int  not null default 0,     -- bruto devuelto
  neto        int  not null default 0,     -- monto / 1,19
  iva         int  not null default 0,     -- monto - neto  (esto es lo que se recupera)
  comision_reintegrada int default 0,
  tipo        text,                        -- automatico | manual | credito | credito_qr
  qrs         jsonb default '[]'::jsonb,   -- qué entradas se devolvieron
  motivo      text,
  emitida     boolean default false,       -- ya se emitió la NC en el SII
  folio       text,                        -- folio del SII
  fecha_folio date,
  creada_por  text,
  created_at  timestamptz default now()
);
create index if not exists idx_nc_pedido on public.notas_credito(pedido_id);
create index if not exists idx_nc_fecha  on public.notas_credito(created_at desc);

alter table public.notas_credito enable row level security;
drop policy if exists nc_admin on public.notas_credito;
create policy nc_admin on public.notas_credito for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));

-- Migrar lo que ya estaba guardado en `pedidos` (una sola vez, sin duplicar)
insert into public.notas_credito (pedido_id, monto, neto, iva, comision_reintegrada, tipo, emitida, folio, fecha_folio, created_at)
select p.id,
       coalesce(p.dev_monto,0), coalesce(p.dev_neto,0), coalesce(p.dev_iva,0),
       coalesce(p.dev_comision_reint,0), coalesce(p.dev_tipo,'manual'),
       coalesce(p.nc_emitida,false), p.nc_folio, p.nc_fecha, coalesce(p.dev_fecha, p.created_at)
from public.pedidos p
where coalesce(p.dev_monto,0) > 0
  and not exists (select 1 from public.notas_credito n where n.pedido_id = p.id);


-- ╔══════════════════════════════════════════════════════════╗
-- ║ C · DOBLE INGRESO OFFLINE                                 ║
-- ║ Dos porteros sin señal pueden dejar pasar el MISMO QR.    ║
-- ║ Al sincronizar se detecta, pero hoy solo sale un aviso    ║
-- ║ en pantalla y no queda registro para el admin.            ║
-- ╚══════════════════════════════════════════════════════════╝
create table if not exists public.puerta_conflictos (
  id          bigserial primary key,
  qr_id       text not null,
  evento_id   int,
  gate_id     text,                  -- qué dispositivo lo intentó
  detectado_at timestamptz default now(),
  primera_vez  timestamptz,          -- cuándo se había usado realmente
  nombre      text,
  nota        text
);
create index if not exists idx_conflictos_evento on public.puerta_conflictos(evento_id, detectado_at desc);

alter table public.puerta_conflictos enable row level security;
drop policy if exists conflictos_staff on public.puerta_conflictos;
create policy conflictos_staff on public.puerta_conflictos for all
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero')))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','portero')));

-- Registrar un intento de doble ingreso (la llama el validador al sincronizar)
create or replace function public.puerta_registrar_conflicto(
  p_qr text, p_evento int, p_gate text, p_nombre text, p_nota text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not puerta_rol_ok() then return; end if;
  insert into public.puerta_conflictos (qr_id, evento_id, gate_id, nombre, nota, primera_vez)
  values (p_qr, p_evento, p_gate, p_nombre, p_nota,
          (select min(created_at) from public.qr_usados where qr_id = p_qr));
end; $$;
grant execute on function public.puerta_registrar_conflicto(text,int,text,text,text) to authenticated;


-- ╔══════════════════════════════════════════════════════════╗
-- ║ D · RATE LIMITING                                         ║
-- ║ Ninguna función tenía freno: se podían recorrer órdenes    ║
-- ║ o inscribir gente en masa sin límite.                     ║
-- ╚══════════════════════════════════════════════════════════╝
create table if not exists public.rate_limit (
  clave      text primary key,        -- ej: 'devolucion:1.2.3.4'
  intentos   int default 0,
  ventana_at timestamptz default now()
);

-- Devuelve TRUE si puede seguir; FALSE si se pasó del límite.
create or replace function public.rate_ok(p_clave text, p_max int, p_seg int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_i int; v_at timestamptz;
begin
  select intentos, ventana_at into v_i, v_at from public.rate_limit where clave = p_clave;
  if v_at is null or now() - v_at > make_interval(secs => p_seg) then
    insert into public.rate_limit (clave, intentos, ventana_at) values (p_clave, 1, now())
      on conflict (clave) do update set intentos = 1, ventana_at = now();
    return true;
  end if;
  if v_i >= p_max then return false; end if;
  update public.rate_limit set intentos = intentos + 1 where clave = p_clave;
  return true;
end; $$;
revoke all on function public.rate_ok(text,int,int) from public, anon, authenticated;

-- Limpieza de claves viejas (para que la tabla no crezca)
create or replace function public.rate_limpiar() returns void language sql security definer set search_path = public as $$
  delete from public.rate_limit where ventana_at < now() - interval '1 day';
$$;


-- ── VERIFICACIÓN ──
select 'A · email_rebotes'        as bloque, case when exists(select 1 from information_schema.tables where table_name='email_rebotes')      then '✅' else '❌' end as estado
union all select 'B · notas_credito',        case when exists(select 1 from information_schema.tables where table_name='notas_credito')      then '✅' else '❌' end
union all select 'B · NC migradas',          (select coalesce(count(*)::text,'0') from public.notas_credito)
union all select 'C · puerta_conflictos',    case when exists(select 1 from information_schema.tables where table_name='puerta_conflictos')  then '✅' else '❌' end
union all select 'C · RPC conflicto',        case when exists(select 1 from pg_proc where proname='puerta_registrar_conflicto')              then '✅' else '❌' end
union all select 'D · rate_limit + rate_ok', case when exists(select 1 from pg_proc where proname='rate_ok')                                 then '✅' else '❌' end;
