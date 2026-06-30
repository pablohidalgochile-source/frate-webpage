-- ============================================================
-- FRATE — SETUP PENDIENTE (todo en uno)
-- Corre este archivo COMPLETO una vez en Supabase → SQL Editor.
-- Todo es idempotente (se puede correr de nuevo sin romper nada).
-- ============================================================

-- ── 1) Login por username ────────────────────────────────────
create or replace function public.get_email_by_username(p_username text)
returns text language sql security definer stable set search_path = public as $$
  select email from clientes where username = lower(trim(p_username)) limit 1;
$$;
grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- ── 2) Trigger de stock COMPLETO (entradas + tiendita, anti-sobreventa) ──
create or replace function fn_descontar_stock()
returns trigger language plpgsql security definer as $$
declare ip record; rows_afectadas int; nombre_x text;
begin
  if new.estado = 'pagado' and (old.estado is null or old.estado <> 'pagado') then
    for ip in select tipo_ticket_id, cantidad from items_pedido
              where pedido_id = new.id and tipo_ticket_id is not null loop
      update tipos_ticket set disponible = disponible - ip.cantidad
        where id = ip.tipo_ticket_id and disponible >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0 then
        select nombre into nombre_x from tipos_ticket where id = ip.tipo_ticket_id;
        raise exception 'SIN_STOCK: % ya no tiene cupos disponibles', coalesce(nombre_x, 'Este ticket');
      end if;
    end loop;
    for ip in select producto_id, cantidad from items_pedido
              where pedido_id = new.id and producto_tipo = 'merch' and producto_id is not null loop
      update tiendita set stock = stock - ip.cantidad
        where id = ip.producto_id and stock >= ip.cantidad;
      get diagnostics rows_afectadas = row_count;
      if rows_afectadas = 0 then
        select nombre into nombre_x from tiendita where id = ip.producto_id;
        raise exception 'SIN_STOCK: % sin stock disponible', coalesce(nombre_x, 'Este producto');
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_descontar_stock on pedidos;
create trigger trg_descontar_stock after update on pedidos
  for each row execute function fn_descontar_stock();

-- ── 3) Toggle video de fondo (requiere config_sitio ya creada) ──
insert into public.config_sitio (clave, visible, label) values
  ('video_global', true, 'Video de fondo en TODO el sitio (apagado = solo portada)')
on conflict (clave) do nothing;

-- ── 4) Bucket de Storage para media (video, galería) ─────────
insert into storage.buckets (id, name, public)
values ('frate-media', 'frate-media', true)
on conflict (id) do update set public = true;
drop policy if exists "frate_media_public_read" on storage.objects;
create policy "frate_media_public_read" on storage.objects for select using (bucket_id = 'frate-media');
drop policy if exists "frate_media_auth_insert" on storage.objects;
create policy "frate_media_auth_insert" on storage.objects for insert with check (bucket_id = 'frate-media' and auth.role() = 'authenticated');
drop policy if exists "frate_media_auth_update" on storage.objects;
create policy "frate_media_auth_update" on storage.objects for update using (bucket_id = 'frate-media' and auth.role() = 'authenticated');
drop policy if exists "frate_media_auth_delete" on storage.objects;
create policy "frate_media_auth_delete" on storage.objects for delete using (bucket_id = 'frate-media' and auth.role() = 'authenticated');

-- ── 5) Códigos de descuento + RRPP ───────────────────────────
create table if not exists public.codigos (
  id serial primary key,
  codigo text unique not null,
  tipo text not null default 'descuento',
  descuento_tipo text,
  descuento_valor integer default 0,
  rrpp_nombre text,
  evento_id integer references eventos(id) on delete cascade,
  max_usos integer,
  usos integer default 0,
  activo boolean default true,
  created_at timestamptz default now()
);
alter table public.pedidos add column if not exists codigo_id    integer references public.codigos(id);
alter table public.pedidos add column if not exists codigo_texto text;
alter table public.pedidos add column if not exists descuento    integer default 0;
alter table public.codigos enable row level security;
drop policy if exists "codigos_select_public" on public.codigos;
create policy "codigos_select_public" on public.codigos for select using (true);
drop policy if exists "codigos_admin_write" on public.codigos;
create policy "codigos_admin_write" on public.codigos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

create or replace function public.validar_codigo(p_codigo text, p_evento_id integer)
returns table (id integer, codigo text, tipo text, descuento_tipo text, descuento_valor integer, rrpp_nombre text)
language sql security definer stable set search_path = public as $$
  select c.id, c.codigo, c.tipo, c.descuento_tipo, c.descuento_valor, c.rrpp_nombre
  from codigos c
  where c.codigo = upper(trim(p_codigo)) and c.activo = true
    and (c.evento_id is null or c.evento_id = p_evento_id)
    and (c.max_usos is null or c.usos < c.max_usos)
  limit 1;
$$;
grant execute on function public.validar_codigo(text, integer) to anon, authenticated;

create or replace function public.incrementar_uso_codigo(p_codigo_id integer)
returns void language sql security definer set search_path = public as $$
  update codigos set usos = usos + 1 where id = p_codigo_id;
$$;
grant execute on function public.incrementar_uso_codigo(integer) to anon, authenticated, service_role;

-- ============================================================
-- LISTO. Esto activa: login por username, stock anti-sobreventa,
-- toggle de video, subida de video/galería, y códigos+RRPP.
-- ============================================================
