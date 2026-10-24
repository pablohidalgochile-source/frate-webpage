-- ═══════════════════════════════════════════════════════════════════
-- 🔐 SEGUNDA PASADA · PARTE 1 de 2 — votar_cancion
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
-- ═══════════════════════════════════════════════════════════════════
-- EL PROBLEMA: recibe `p_cliente_id` como parámetro y con eso abona
-- $1.000 de crédito. Cualquiera desde afuera puede pasarle el id de otra
-- persona, o el propio sin haber iniciado sesión, y acuñar plata. Además
-- se puede inflar el ranking votando en nombre de terceros.
--
-- EL ARREGLO: la cuenta sale SIEMPRE de auth.uid(), nunca del parámetro.
-- Se mantiene la firma para no tocar index.html ni pago-exitoso.html.
--
-- NO se revoca a anon: votar sin cuenta es una función pública de la web
-- y tiene que seguir andando. Lo que se corta es el crédito sin sesión.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.votar_cancion(
  p_deezer_id text, p_titulo text, p_artista text, p_album text,
  p_cover text, p_preview text, p_cliente_id uuid, p_origen text default 'ranking'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();   -- ← la verdad. p_cliente_id se ignora.
  v_cancion_id int;
  v_credito_otorgado boolean := false;
  v_ya_credito boolean;
  v_ya_voto boolean;
begin
  insert into canciones (deezer_id, titulo, artista, album, cover_url, preview_url)
  values (p_deezer_id, p_titulo, p_artista, p_album, p_cover, p_preview)
  on conflict (deezer_id) do update set titulo = excluded.titulo
  returning id into v_cancion_id;

  -- Sin sesión igual se vota, pero el voto queda sin dueño.
  if v_uid is not null then
    select exists(select 1 from votos
                   where cancion_id = v_cancion_id and cliente_id = v_uid)
      into v_ya_voto;
  else
    v_ya_voto := false;
  end if;

  if not v_ya_voto then
    insert into votos (cancion_id, cliente_id, origen)
    values (v_cancion_id, v_uid, p_origen);
    update canciones set votos = votos + 1 where id = v_cancion_id;
  end if;

  -- El crédito: solo con sesión iniciada, y una sola vez por cuenta.
  if v_uid is not null then
    select coalesce(credito_voto, false) into v_ya_credito
      from clientes where id = v_uid;
    if not coalesce(v_ya_credito, true) then
      update clientes
         set credito = coalesce(credito,0) + 1000, credito_voto = true
       where id = v_uid;
      v_credito_otorgado := true;
    end if;
  end if;

  return json_build_object(
    'cancion_id', v_cancion_id,
    'ya_votaste', v_ya_voto,
    'credito_otorgado', v_credito_otorgado
  );
end; $$;

-- Sigue abierta a anon a propósito: votar sin cuenta es público.
grant execute on function
  public.votar_cancion(text,text,text,text,text,text,uuid,text)
  to anon, authenticated;

-- Chequeo: cuántas cuentas recibieron ya el crédito del voto.
select count(*) filter (where coalesce(credito_voto,false)) as con_credito_voto,
       count(*)                                             as cuentas
from public.clientes;
