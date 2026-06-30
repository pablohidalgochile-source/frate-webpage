-- ============================================================
-- FRATE — Arma tu grupo (descuento grupal por meta de personas)
-- Las reglas (meta y % de descuento) las define el ADMIN en
-- config_valores. Cuando un grupo llega a la meta, todos sus
-- miembros obtienen el descuento al comprar entradas del evento.
-- Correr en Supabase SQL Editor.
-- ============================================================

create table if not exists public.grupos (
  id         serial primary key,
  codigo     text unique not null,
  creador_id uuid references public.clientes(id) on delete set null,
  evento_id  integer references public.eventos(id) on delete cascade,
  nombre     text,
  created_at timestamptz default now()
);
create table if not exists public.grupo_miembros (
  id         serial primary key,
  grupo_id   integer references public.grupos(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  nombre     text,
  created_at timestamptz default now(),
  unique (grupo_id, cliente_id)
);
alter table public.grupos enable row level security;
alter table public.grupo_miembros enable row level security;
drop policy if exists "grupos_public_read" on public.grupos;
create policy "grupos_public_read" on public.grupos for select using (true);
drop policy if exists "grupo_miembros_public_read" on public.grupo_miembros;
create policy "grupo_miembros_public_read" on public.grupo_miembros for select using (true);

-- Reglas configurables
insert into public.config_valores (clave, valor, label) values
  ('grupo_meta',      '5',  'Arma tu grupo — personas para desbloquear descuento'),
  ('grupo_descuento', '15', 'Arma tu grupo — % de descuento al llegar a la meta')
on conflict (clave) do nothing;

-- ── RPC: crear grupo (lo crea el usuario, sin fijar el descuento) ──
create or replace function public.crear_grupo(p_creador uuid, p_evento int, p_nombre text)
returns json language plpgsql security definer set search_path = public as $$
declare v_cod text; v_id int;
begin
  v_cod := upper(substr(md5(random()::text), 1, 6));
  insert into grupos (codigo, creador_id, evento_id, nombre) values (v_cod, p_creador, p_evento, p_nombre) returning id into v_id;
  insert into grupo_miembros (grupo_id, cliente_id, nombre) values (v_id, p_creador, p_nombre)
    on conflict (grupo_id, cliente_id) do nothing;
  return json_build_object('ok', true, 'codigo', v_cod, 'grupo_id', v_id);
end; $$;
grant execute on function public.crear_grupo(uuid, int, text) to anon, authenticated;

-- ── RPC: unirse a un grupo ───────────────────────────────────
create or replace function public.unirse_grupo(p_codigo text, p_cliente uuid, p_nombre text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  select id into v_id from grupos where codigo = upper(trim(p_codigo));
  if v_id is null then return json_build_object('ok', false, 'error', 'Grupo no encontrado'); end if;
  insert into grupo_miembros (grupo_id, cliente_id, nombre) values (v_id, p_cliente, p_nombre)
    on conflict (grupo_id, cliente_id) do nothing;
  return json_build_object('ok', true, 'grupo_id', v_id);
end; $$;
grant execute on function public.unirse_grupo(text, uuid, text) to anon, authenticated;

-- ── RPC: estado de un grupo (miembros, meta, alcanzado) ──────
create or replace function public.estado_grupo(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare v record; v_meta int; v_desc int; v_count int; v_miembros json;
begin
  select g.*, e.nombre as evento_nombre into v from grupos g left join eventos e on e.id = g.evento_id where g.codigo = upper(trim(p_codigo));
  if v.id is null then return json_build_object('ok', false); end if;
  select coalesce(valor,'5')::int  into v_meta from config_valores where clave = 'grupo_meta';
  select coalesce(valor,'15')::int into v_desc from config_valores where clave = 'grupo_descuento';
  select count(*) into v_count from grupo_miembros where grupo_id = v.id;
  select json_agg(nombre) into v_miembros from grupo_miembros where grupo_id = v.id;
  return json_build_object('ok', true, 'codigo', v.codigo, 'nombre', v.nombre, 'evento', v.evento_nombre,
    'meta', v_meta, 'descuento', v_desc, 'miembros', coalesce(v_count,0),
    'alcanzado', coalesce(v_count,0) >= coalesce(v_meta,5), 'nombres', coalesce(v_miembros, '[]'::json));
end; $$;
grant execute on function public.estado_grupo(text) to anon, authenticated;

-- ── RPC: % de descuento del grupo para un cliente+evento ─────
create or replace function public.grupo_descuento_pct(p_cliente uuid, p_evento int)
returns int language plpgsql security definer set search_path = public as $$
declare v_meta int; v_desc int; v_grupo int; v_count int;
begin
  select coalesce(valor,'5')::int  into v_meta from config_valores where clave = 'grupo_meta';
  select coalesce(valor,'15')::int into v_desc from config_valores where clave = 'grupo_descuento';
  select g.id into v_grupo from grupos g join grupo_miembros m on m.grupo_id = g.id
    where g.evento_id = p_evento and m.cliente_id = p_cliente limit 1;
  if v_grupo is null then return 0; end if;
  select count(*) into v_count from grupo_miembros where grupo_id = v_grupo;
  if v_count >= coalesce(v_meta,5) then return coalesce(v_desc,15); else return 0; end if;
end; $$;
grant execute on function public.grupo_descuento_pct(uuid, int) to anon, authenticated, service_role;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
