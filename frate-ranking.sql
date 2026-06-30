-- ============================================================
-- FRATE — Ranking Musical del Pueblo + Crédito por votar
-- Canciones votadas por la gente (vía Deezer) + $1.000 de crédito
-- por registrarse a votar (una vez por cuenta).
-- Correr en Supabase SQL Editor.
-- ============================================================

-- ── Canciones (catálogo de lo votado) ────────────────────────
create table if not exists public.canciones (
  id          serial primary key,
  deezer_id   text unique,
  titulo      text not null,
  artista     text,
  album       text,
  cover_url   text,
  preview_url text,
  votos       integer default 0,
  created_at  timestamptz default now()
);
alter table public.canciones enable row level security;
drop policy if exists "canciones_public_read" on public.canciones;
create policy "canciones_public_read" on public.canciones for select using (true);

-- ── Votos (quién votó qué) ───────────────────────────────────
create table if not exists public.votos (
  id          serial primary key,
  cancion_id  integer references public.canciones(id) on delete cascade,
  cliente_id  uuid references public.clientes(id) on delete set null,
  origen      text default 'ranking',  -- 'ranking' | 'post_pago'
  created_at  timestamptz default now()
);
alter table public.votos enable row level security;
drop policy if exists "votos_public_read" on public.votos;
create policy "votos_public_read" on public.votos for select using (true);

-- ── Crédito en la cuenta del cliente ─────────────────────────
alter table public.clientes add column if not exists credito       integer default 0;
alter table public.clientes add column if not exists credito_voto  boolean default false;  -- ya recibió el $1.000 por votar
alter table public.pedidos  add column if not exists credito_usado integer default 0;

-- ── RPC: votar una canción (upsert + voto + crédito 1 vez) ───
create or replace function public.votar_cancion(
  p_deezer_id text, p_titulo text, p_artista text, p_album text,
  p_cover text, p_preview text, p_cliente_id uuid, p_origen text default 'ranking'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_cancion_id int;
  v_credito_otorgado boolean := false;
  v_ya_credito boolean;
  v_ya_voto boolean;
begin
  -- upsert canción por deezer_id
  insert into canciones (deezer_id, titulo, artista, album, cover_url, preview_url)
  values (p_deezer_id, p_titulo, p_artista, p_album, p_cover, p_preview)
  on conflict (deezer_id) do update set titulo = excluded.titulo
  returning id into v_cancion_id;

  -- dedup: un usuario no suma 2 veces la misma canción
  if p_cliente_id is not null then
    select exists(select 1 from votos where cancion_id = v_cancion_id and cliente_id = p_cliente_id) into v_ya_voto;
  else
    v_ya_voto := false;
  end if;

  if not v_ya_voto then
    insert into votos (cancion_id, cliente_id, origen) values (v_cancion_id, p_cliente_id, p_origen);
    update canciones set votos = votos + 1 where id = v_cancion_id;
  end if;

  -- crédito $1.000 una sola vez por cuenta (al registrarse/votar)
  if p_cliente_id is not null then
    select coalesce(credito_voto, false) into v_ya_credito from clientes where id = p_cliente_id;
    if not v_ya_credito then
      update clientes set credito = coalesce(credito,0) + 1000, credito_voto = true where id = p_cliente_id;
      v_credito_otorgado := true;
    end if;
  end if;

  return json_build_object(
    'cancion_id', v_cancion_id,
    'ya_votaste', v_ya_voto,
    'credito_otorgado', v_credito_otorgado
  );
end;
$$;
grant execute on function public.votar_cancion(text,text,text,text,text,text,uuid,text) to anon, authenticated;

-- ============================================================
-- LISTO. Correr en Supabase SQL Editor.
-- ============================================================
