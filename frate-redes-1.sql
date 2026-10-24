-- 📱 LA RED SOCIAL EN LA FICHA + EL PREMIO A NOMBRE DE UN USUARIO
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · parte 1 de 2 · idempotente
--
-- POR QUÉ:
--   `clientes` no tenía NINGUNA columna de red social. El instagram se pedía
--   en formularios y listas y quedaba suelto: no había forma de saber que
--   @florenciasjournal es la persona que compró tres veces.
--
--   Y el link de premio no preguntaba nada: quien lo tuviera, lo cobraba.
--   Se lo reenviaban por whatsapp y lo usaba otro.
--
-- LA REGLA: el admin escribe a nombre de quién va el premio. La página pide
--   ese usuario antes de entregar nada.

-- ── 1 · La red en la ficha del cliente ────────────────────────────
alter table public.clientes
  add column if not exists red_social  text,          -- instagram | tiktok | otra
  add column if not exists usuario_red text;          -- SIN arroba, en minúsculas

-- Para buscar por @ en el admin y para cruzar premios.
create index if not exists clientes_usuario_red_idx
  on public.clientes (lower(usuario_red));


-- ── 2 · A nombre de quién va cada premio ──────────────────────────
alter table public.premios_link
  add column if not exists red         text,
  add column if not exists usuario_red text,
  add column if not exists liberado    boolean not null default false;
-- `liberado` = el admin lo soltó a mano. La gente se cambia el @ de
-- instagram seguido; sin esta salida, un premio legítimo queda muerto.

comment on column public.premios_link.usuario_red is
  'Usuario que ganó, sin arroba y en minúsculas. Vacío = lo cobra cualquiera.';


-- ── 3 · Normalizar siempre igual ──────────────────────────────────
-- La gente escribe @Florencias_Journal y florencias_journal. Se compara sin
-- arroba, sin espacios y en minúsculas. Los puntos y guiones bajos SÍ se
-- respetan: en instagram son parte del nombre y distinguen a dos personas.
create or replace function public.norm_usuario(p text)
returns text language sql immutable as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '^\s*@+', ''))), '')
$$;

grant execute on function public.norm_usuario(text) to anon, authenticated;


-- ── Chequeo ───────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_name='clientes' and column_name in ('red_social','usuario_red'))    as cols_cliente,
  (select count(*) from information_schema.columns
    where table_name='premios_link' and column_name in ('red','usuario_red','liberado')) as cols_premio,
  public.norm_usuario('  @Florencias_Journal ')                                     as ejemplo_normalizado;
