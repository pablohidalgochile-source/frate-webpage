-- ============================================================
-- FRATE — CRM Personas (tabla persistente + auto-población)
-- Una ficha por persona (dedupe por RUT, si no por email), que se
-- llena SOLA cada vez que alguien: va en una lista, reserva, compra,
-- recibe cortesía o hace check-in en la puerta. Alimenta el
-- autocompletar (buscar_personas) y la vista CRM del admin.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- Idempotente. Incluye BACKFILL de lo ya existente.
-- ============================================================

create table if not exists public.personas (
  id          bigserial primary key,
  rut         text,
  nombre      text,
  email       text,
  telefono    text,
  instagram   text,
  origen      text[] default '{}',      -- inscrito | reserva | venta | cortesia | cliente | visita
  visitas     int default 0,            -- check-ins reales en la puerta
  primera_vez timestamptz default now(),
  ultima_vez  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists personas_nombre_idx on public.personas (lower(nombre));
create index if not exists personas_rut_idx    on public.personas (lower(rut));
create index if not exists personas_email_idx  on public.personas (lower(email));

-- ── Upsert con dedupe (rut → email) ─────────────────────────
create or replace function public.personas_upsert(
  p_nombre text, p_rut text default null, p_email text default null,
  p_telefono text default null, p_instagram text default null,
  p_origen text default null, p_visita boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rut text; v_email text;
begin
  v_rut   := nullif(btrim(coalesce(p_rut,'')),'');
  v_email := lower(nullif(btrim(coalesce(p_email,'')),''));
  if coalesce(btrim(p_nombre),'')='' and v_rut is null and v_email is null then return; end if;

  if v_rut is not null then
    select id into v_id from public.personas where lower(rut)=lower(v_rut) limit 1;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from public.personas where lower(email)=v_email limit 1;
  end if;

  if v_id is null then
    insert into public.personas(rut,nombre,email,telefono,instagram,origen,visitas,ultima_vez)
    values (v_rut,
            nullif(btrim(coalesce(p_nombre,'')),''),
            v_email,
            nullif(btrim(coalesce(p_telefono,'')),''),
            nullif(btrim(coalesce(p_instagram,'')),''),
            case when p_origen is null then '{}'::text[] else array[p_origen] end,
            case when p_visita then 1 else 0 end,
            now());
  else
    update public.personas set
      nombre    = coalesce(nullif(btrim(coalesce(p_nombre,'')),''), nombre),
      rut       = coalesce(rut, v_rut),
      email     = coalesce(email, v_email),
      telefono  = coalesce(telefono, nullif(btrim(coalesce(p_telefono,'')),'')),
      instagram = coalesce(instagram, nullif(btrim(coalesce(p_instagram,'')),'')),
      origen    = case when p_origen is null or p_origen = any(origen) then origen else origen || p_origen end,
      visitas   = visitas + case when p_visita then 1 else 0 end,
      ultima_vez= now(), updated_at = now()
    where id = v_id;
  end if;
end; $$;

-- ── Triggers de auto-población ──────────────────────────────
create or replace function public.tg_persona_inscrito() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, null, 'inscrito', false); return NEW; end; $$;
drop trigger if exists trg_persona_inscrito on public.lista_inscritos;
create trigger trg_persona_inscrito after insert on public.lista_inscritos for each row execute function public.tg_persona_inscrito();

create or replace function public.tg_persona_reserva() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.personas_upsert(NEW.nombre, NEW.rut, NEW.email, NEW.telefono, null, 'reserva', false); return NEW; end; $$;
drop trigger if exists trg_persona_reserva on public.reservas;
create trigger trg_persona_reserva after insert on public.reservas for each row execute function public.tg_persona_reserva();

create or replace function public.tg_persona_pedido() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.personas_upsert(NEW.nombre_cliente, null, NEW.email_cliente, null, null,
         case when NEW.metodo_pago='cortesia' then 'cortesia' else 'venta' end, false); return NEW; end; $$;
drop trigger if exists trg_persona_pedido on public.pedidos;
create trigger trg_persona_pedido after insert on public.pedidos for each row execute function public.tg_persona_pedido();

-- cliente web registrado (trae RUT + teléfono desde el formulario)
create or replace function public.tg_persona_cliente() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.personas_upsert(btrim(coalesce(NEW.nombres,'')||' '||coalesce(NEW.apellidos,'')),
         NEW.rut, NEW.email, NEW.telefono, null, 'cliente', false); return NEW; end; $$;
drop trigger if exists trg_persona_cliente on public.clientes;
create trigger trg_persona_cliente after insert or update on public.clientes for each row execute function public.tg_persona_cliente();

-- check-in real en la puerta → suma una visita a la ficha del comprador
create or replace function public.tg_persona_checkin() returns trigger language plpgsql security definer set search_path=public as $$
declare v_nombre text; v_email text;
begin
  select nombre_cliente, email_cliente into v_nombre, v_email from public.pedidos where id = NEW.pedido_id;
  if v_nombre is not null or v_email is not null then
    perform public.personas_upsert(v_nombre, null, v_email, null, null, 'visita', true);
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_persona_checkin on public.qr_usados;
create trigger trg_persona_checkin after insert on public.qr_usados for each row execute function public.tg_persona_checkin();

-- ── BACKFILL de lo ya existente (una vez; idempotente por dedupe) ──
do $$ declare r record; begin
  for r in select nombre,rut,email,telefono from public.lista_inscritos loop
    perform public.personas_upsert(r.nombre,r.rut,r.email,r.telefono,null,'inscrito',false); end loop;
  for r in select nombre,rut,email,telefono from public.reservas loop
    perform public.personas_upsert(r.nombre,r.rut,r.email,r.telefono,null,'reserva',false); end loop;
  for r in select nombre_cliente,email_cliente,metodo_pago from public.pedidos loop
    perform public.personas_upsert(r.nombre_cliente,null,r.email_cliente,null,null,
      case when r.metodo_pago='cortesia' then 'cortesia' else 'venta' end,false); end loop;
  for r in select nombres,apellidos,rut,email,telefono from public.clientes loop
    perform public.personas_upsert(btrim(coalesce(r.nombres,'')||' '||coalesce(r.apellidos,'')),
      r.rut,r.email,r.telefono,null,'cliente',false); end loop;
end $$;

-- ── buscar_personas ahora lee la tabla (rápido + trae instagram/visitas) ──
create or replace function public.buscar_personas(q text)
returns table(nombre text, rut text, email text, telefono text, origen text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')) then return; end if;
  if length(coalesce(q,'')) < 2 then return; end if;
  return query
    select p.nombre, p.rut, p.email, p.telefono,
           coalesce(p.origen[array_length(p.origen,1)],'') as origen
      from public.personas p
     where p.nombre ilike '%'||q||'%' or coalesce(p.rut,'') ilike '%'||q||'%'
        or coalesce(p.email,'') ilike '%'||q||'%' or coalesce(p.telefono,'') ilike '%'||q||'%'
     order by p.ultima_vez desc nulls last
     limit 12;
end; $$;
grant execute on function public.buscar_personas(text) to authenticated;

-- ── RLS: staff lee, admin administra ────────────────────────
alter table public.personas enable row level security;
drop policy if exists "personas_staff_read" on public.personas;
create policy "personas_staff_read" on public.personas for select
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));
drop policy if exists "personas_admin_upd" on public.personas;
create policy "personas_admin_upd" on public.personas for update
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));
drop policy if exists "personas_admin_del" on public.personas;
create policy "personas_admin_del" on public.personas for delete
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

select 'personas' as check,
       case when exists(select 1 from pg_tables where tablename='personas') then 'OK' else 'FALTA' end,
       (select count(*) from public.personas) as fichas;
