-- 🔑 LLAVES DE ESTACIÓN DEL POS · idempotente
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- Formato acordado con la sesión del POS:
--   pos_<code>_<32 bytes base64url>
--   · <code> = `pos.terminals.code` de su base: text, único y NO editable
--     (el `name` sí lo es, por eso no se usa ese).
--   · El prefijo va en claro para poder saber QUÉ caja llamó sin
--     desencriptar nada, y para revocar una sola sin tumbar las demás.
--
-- 🔒 ACÁ SOLO SE GUARDA EL HASH. Nunca la llave. Si esta base se filtra,
--    no entrega llaves usables. El hash lo calcula la edge con SHA-256
--    (crypto.subtle de Deno) — así no hace falta pgcrypto.
--
-- 🔄 ROTACIÓN: se permiten VARIAS filas activas por code. Se crea la nueva,
--    el POS la adopta, y recién ahí se apaga la vieja. Cero ventana de caída.

create table if not exists public.pos_llaves (
  id           bigserial primary key,
  code         text        not null,          -- 'caja1'
  key_hash     text        not null unique,   -- SHA-256 hex de la llave completa
  activa       boolean     not null default true,
  nota         text,
  creada_por   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revocada_at  timestamptz
);

create index if not exists pos_llaves_code   on public.pos_llaves (code) where activa;
create index if not exists pos_llaves_activa on public.pos_llaves (activa, code);

comment on table public.pos_llaves is
  'Llaves por terminal del POS. Solo el hash. Varias activas por code = rotación sin caída.';

alter table public.pos_llaves enable row level security;

-- Nadie de afuera. La edge entra con service_role, que se salta la RLS.
drop policy if exists pos_llaves_admin on public.pos_llaves;
create policy pos_llaves_admin on public.pos_llaves for all
  using (exists (select 1 from public.clientes
                  where id = auth.uid() and rol = 'admin'));


-- ── Verificar una llave · la usa la edge ───────────────────────────
-- Devuelve el `code` de la caja si la llave sirve, o null.
-- Recibe el HASH, nunca la llave: si algo queda en un log, no sirve.
create or replace function public.pos_llave_code(p_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code
    from public.pos_llaves
   where key_hash = p_hash and activa
   limit 1;

  if v_code is not null then
    update public.pos_llaves set last_used_at = now() where key_hash = p_hash;
  end if;
  return v_code;
end; $$;

revoke execute on function public.pos_llave_code(text) from anon, authenticated, public;


-- ── Chequeo ────────────────────────────────────────────────────────
select code, activa, created_at::date as creada, last_used_at,
       left(key_hash, 8) || '…' as hash
from public.pos_llaves
order by code, created_at desc;
