-- ============================================================
-- FRATE — JUEGOS ("¡Estás de suerte!") + EL ANFITRIÓN
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
--
-- · Toggle del chatbot "El Anfitrión" (nace APAGADO)
-- · Configs de juegos: modo, cuáles están activos, tiempos, premios
-- · Trivia Musical: banco de preguntas (CRUD en admin) + RPCs con
--   ANTI-TRAMPA: el navegador nunca ve la respuesta correcta y el
--   tiempo se valida en el servidor.
-- ============================================================

-- ── 1) El Anfitrión (chatbot vinilo) — nace apagado ──────────
insert into public.config_sitio (clave, visible, label) values
  ('anfitrion', false, 'El Anfitrión 🎧 (chatbot vinilo en frate.cl)')
on conflict (clave) do nothing;

-- ── 2) Configs de juegos ─────────────────────────────────────
insert into public.config_valores (clave, valor, label) values
  ('juegos_modo', 'cliente', 'Juegos — modo: cliente (elige) | azar | ruleta | raspe | trivia'),
  ('juego_ruleta_on', '1', 'Juego Ruleta-Vinilo activo (1/0)'),
  ('juego_raspe_on',  '1', 'Juego Raspe "Entrada Dorada" activo (1/0)'),
  ('juego_trivia_on', '1', 'Juego Trivia Musical activo (1/0)'),
  ('trivia_segundos_pregunta', '10', 'Trivia — segundos por pregunta'),
  ('trivia_premio3_credito', '3000', 'Trivia — crédito por 3/3 aciertos ($)'),
  ('trivia_premio2_credito', '1000', 'Trivia — crédito por 2/3 aciertos ($)')
on conflict (clave) do nothing;

-- ── 3) Banco de preguntas de la Trivia ───────────────────────
create table if not exists public.trivia_preguntas (
  id         serial primary key,
  categoria  text default 'musica',   -- 'musica' | 'fiestas' | 'frate'
  pregunta   text not null,
  alt_a      text not null,
  alt_b      text not null,
  alt_c      text not null,
  alt_d      text not null,
  correcta   text not null check (correcta in ('a','b','c','d')),
  activa     boolean default true,
  created_at timestamptz default now()
);
alter table public.trivia_preguntas enable row level security;
drop policy if exists "trivia_admin_all" on public.trivia_preguntas;
create policy "trivia_admin_all" on public.trivia_preguntas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));
-- (el público NUNCA lee la tabla directo — solo vía RPC sin la respuesta)

-- Sesiones de trivia (para validar tiempo y respuestas en el servidor)
create table if not exists public.trivia_sesiones (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.clientes(id) on delete cascade,
  preguntas   int[] not null,
  iniciada_at timestamptz default now(),
  terminada   boolean default false
);
alter table public.trivia_sesiones enable row level security;
-- solo vía RPCs (security definer); sin policies públicas

-- ── 4) RPC: iniciar trivia (3 preguntas al azar, SIN la correcta) ──
create or replace function public.trivia_iniciar() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_ids int[];
  v_seg int;
  v_sesion uuid;
  v_pregs json;
begin
  if auth.uid() is null then return json_build_object('error','Inicia sesión'); end if;
  if not exists (select 1 from giros where cliente_id = auth.uid() and not usado) then
    return json_build_object('error','sin_giros');
  end if;

  select array_agg(id) into v_ids from (
    select id from trivia_preguntas where activa order by random() limit 3
  ) q;
  if v_ids is null or array_length(v_ids,1) < 3 then
    return json_build_object('error','No hay suficientes preguntas activas (mínimo 3). Agrégalas en Admin → Juegos.');
  end if;

  select coalesce(nullif(valor,'')::int, 10) into v_seg from config_valores where clave='trivia_segundos_pregunta';
  v_seg := coalesce(v_seg, 10);

  insert into trivia_sesiones (cliente_id, preguntas) values (auth.uid(), v_ids) returning id into v_sesion;

  select json_agg(json_build_object(
    'id', p.id, 'categoria', p.categoria, 'pregunta', p.pregunta,
    'a', p.alt_a, 'b', p.alt_b, 'c', p.alt_c, 'd', p.alt_d
  ) order by array_position(v_ids, p.id)) into v_pregs
  from trivia_preguntas p where p.id = any(v_ids);

  return json_build_object('ok', true, 'sesion', v_sesion, 'segundos', v_seg, 'preguntas', v_pregs);
end; $$;
grant execute on function public.trivia_iniciar() to authenticated;

-- ── 5) RPC: responder trivia (valida tiempo + corrige + premia) ──
create or replace function public.trivia_responder(p_sesion uuid, p_respuestas text[]) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_s trivia_sesiones%rowtype;
  v_seg int; v_limite interval;
  v_aciertos int := 0;
  v_correctas json;
  v_giro giros%rowtype;
  v_p3 int; v_p2 int;
  v_premio text := 'Sigue participando'; v_tipo text := 'nada'; v_valor int := 0;
  i int; v_q trivia_preguntas%rowtype;
begin
  if auth.uid() is null then return json_build_object('error','Inicia sesión'); end if;
  select * into v_s from trivia_sesiones where id = p_sesion and cliente_id = auth.uid() for update;
  if not found then return json_build_object('error','Sesión no encontrada'); end if;
  if v_s.terminada then return json_build_object('error','Esta trivia ya se jugó'); end if;

  select coalesce(nullif(valor,'')::int, 10) into v_seg from config_valores where clave='trivia_segundos_pregunta';
  v_seg := coalesce(v_seg, 10);
  v_limite := make_interval(secs => (3 * v_seg) + 12);   -- 12s de gracia (red/animaciones)
  if now() - v_s.iniciada_at > v_limite then
    update trivia_sesiones set terminada = true where id = p_sesion;
    return json_build_object('error','tiempo', 'mensaje', '⏱️ Se acabó el tiempo — la trivia quedó nula. ¡La próxima será!');
  end if;

  -- Corregir (respuestas en el mismo orden que las preguntas)
  for i in 1..3 loop
    select * into v_q from trivia_preguntas where id = v_s.preguntas[i];
    if found and i <= coalesce(array_length(p_respuestas,1),0) and lower(coalesce(p_respuestas[i],'')) = v_q.correcta then
      v_aciertos := v_aciertos + 1;
    end if;
  end loop;

  -- Consumir el giro más antiguo
  select * into v_giro from giros where cliente_id = auth.uid() and not usado
    order by created_at limit 1 for update skip locked;
  if not found then return json_build_object('error','sin_giros'); end if;

  select coalesce(nullif(valor,'')::int, 3000) into v_p3 from config_valores where clave='trivia_premio3_credito';
  select coalesce(nullif(valor,'')::int, 1000) into v_p2 from config_valores where clave='trivia_premio2_credito';

  if v_aciertos >= 3 then
    v_premio := '$'||coalesce(v_p3,3000)||' de crédito'; v_tipo := 'credito'; v_valor := coalesce(v_p3,3000);
  elsif v_aciertos = 2 then
    v_premio := '$'||coalesce(v_p2,1000)||' de crédito'; v_tipo := 'credito'; v_valor := coalesce(v_p2,1000);
  end if;

  if v_tipo = 'credito' and v_valor > 0 then
    update clientes set credito = coalesce(credito,0) + v_valor where id = auth.uid();
    insert into movimientos (cliente_id, tipo, monto, concepto) values (auth.uid(), 'credito', v_valor, 'Trivia Musical '||v_aciertos||'/3');
  end if;

  update giros set usado = true, usado_at = now(), premio = 'Trivia '||v_aciertos||'/3 — '||v_premio, premio_tipo = v_tipo, premio_valor = v_valor
   where id = v_giro.id;
  update trivia_sesiones set terminada = true where id = p_sesion;

  select json_agg(json_build_object('id', p.id, 'correcta', p.correcta) order by array_position(v_s.preguntas, p.id))
    into v_correctas from trivia_preguntas p where p.id = any(v_s.preguntas);

  return json_build_object('ok', true, 'aciertos', v_aciertos, 'premio', v_premio, 'tipo', v_tipo, 'valor', v_valor, 'correctas', v_correctas);
end; $$;
grant execute on function public.trivia_responder(uuid, text[]) to authenticated;

-- ── 6) Semilla: 12 preguntas (edítalas en Admin → Juegos) ────
insert into public.trivia_preguntas (categoria, pregunta, alt_a, alt_b, alt_c, alt_d, correcta) values
  ('musica',  '¿Qué significa "DJ"?', 'Disc Jockey', 'Digital Jam', 'Dance Judge', 'Doble Juego', 'a'),
  ('musica',  '¿De qué país es Bad Bunny?', 'Colombia', 'Puerto Rico', 'México', 'República Dominicana', 'b'),
  ('musica',  '¿De qué país es Shakira?', 'Venezuela', 'Argentina', 'Colombia', 'Perú', 'c'),
  ('musica',  '¿Cómo se llama la aguja que lee un vinilo?', 'Púa', 'Pluma', 'Punta', 'Pinza', 'a'),
  ('musica',  '¿A cuántas RPM gira un vinilo LP clásico?', '78', '45', '33', '16', 'c'),
  ('musica',  '¿Qué género musical nació en Jamaica?', 'Salsa', 'Reggae', 'Cumbia', 'Tango', 'b'),
  ('fiestas', '¿Cómo se llama la mezcla continua de canciones que hace un DJ?', 'Un set', 'Un loop', 'Un demo', 'Un cover', 'a'),
  ('fiestas', '¿Cuál de estos es un género urbano?', 'Cueca', 'Vals', 'Bolero', 'Reggaetón', 'd'),
  ('fiestas', '¿Cómo se le dice en Chile a una fiesta?', 'Rumba', 'Carrete', 'Parranda', 'Juerga', 'b'),
  ('frate',   '¿En qué barrio de Santiago está FRATE?', 'Bellavista', 'Lastarria', 'Ñuñoa', 'Providencia', 'a'),
  ('frate',   '¿En qué calle está FRATE?', 'Suecia', 'Manuel Montt', 'Pío Nono', 'República', 'c'),
  ('frate',   '¿Cómo se llama el ranking donde votas canciones en frate.cl?', 'Top FRATE', 'La Rockola', 'Modo Fiesta', 'Ranking del Pueblo', 'd')
on conflict do nothing;

-- ── 7) Verificación ──────────────────────────────────────────
select 'toggle anfitrion' as check, (select count(*)::text from config_sitio where clave='anfitrion')
union all select 'preguntas trivia', count(*)::text from trivia_preguntas
union all select 'RPC trivia_iniciar', case when exists(select 1 from pg_proc where proname='trivia_iniciar') then 'OK' else 'FALTA' end
union all select 'RPC trivia_responder', case when exists(select 1 from pg_proc where proname='trivia_responder') then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO.
-- ============================================================
