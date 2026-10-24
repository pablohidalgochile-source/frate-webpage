-- ============================================================
-- FRATE CONNECT — Migración a un modelo ÚNICO de conversaciones
-- Consolida el WhatsApp (wsp_*) DENTRO de la tabla canónica multicanal
-- `conversaciones`/`mensajes` (que ya trae canal + media + cliente_id).
--
-- SEGURIDAD: aditivo, NO toca los flujos vivos. Un trigger DEFENSIVO espeja
-- wsp_* → conversaciones/mensajes y NUNCA bloquea la fuente (si el espejo
-- falla, la fila de WhatsApp igual se guarda). Idempotente.
--
-- ⚠️ CÓMO CORRERLO (importante para no frenar el WhatsApp en vivo):
--   • Córrelo de DÍA / sin evento (poco tráfico de WhatsApp).
--   • Corre PRIMERO el PASO 1 completo (crea los triggers). Espera el OK.
--   • DESPUÉS corre el PASO 2 (backfill). Así el trigger ya existe antes de
--     copiar lo viejo → cero hueco, y el backfill (solo lee wsp_*) no bloquea
--     el webhook. Si tus tablas mensajes/wsp_mensajes son MUY grandes, cambia
--     los CREATE INDEX por su versión CONCURRENTLY corriéndolos por separado.
-- Corre en el Supabase de la WEB (ydwlpra…).
-- ============================================================

-- ═══════════ PASO 1 — estructura + triggers (corre esto primero) ═══════════

-- 1a) Columnas puente (aditivas, metadata-only)
alter table public.conversaciones
  add column if not exists wsp_id       uuid,
  add column if not exists grupo        text,
  add column if not exists nombre       text,
  add column if not exists telefono     text,
  add column if not exists instagram    text,
  add column if not exists avatar_url   text,
  add column if not exists asignado_txt text,
  add column if not exists no_leidas    int not null default 0;
alter table public.mensajes
  add column if not exists wsp_msg_id     text,
  add column if not exists estado_entrega text;

-- 1b) Índices (para tablas grandes: usa CREATE INDEX CONCURRENTLY por separado)
create unique index if not exists idx_conv_wsp    on public.conversaciones (wsp_id)     where wsp_id     is not null;
create unique index if not exists idx_msg_wsp     on public.mensajes       (wsp_msg_id) where wsp_msg_id is not null;
create index        if not exists idx_conv_canal_ult on public.conversaciones (canal, ultimo_ts desc);

-- 1c) Helpers de mapeo (search_path fijo — endurecido)
create or replace function public.cx_estado(p_etapa text) returns text
  language sql immutable set search_path = public as $$
  select case p_etapa
    when 'esperando_anfitrion' then 'esperando_humano'
    when 'anfitrion'           then 'humano'
    when 'cerrada'             then 'cerrado'
    else 'bot' end;
$$;
create or replace function public.cx_msgkey(p_conv uuid, p_wa text, p_ts timestamptz, p_rol text) returns text
  language sql stable set search_path = public as $$
  select coalesce(nullif(p_wa,''), p_conv::text || '@' || extract(epoch from p_ts)::text || ':' || coalesce(p_rol,''));
$$;

-- 1d) Triggers DEFENSIVOS (espejan en vivo; jamás bloquean la fuente)
create or replace function public.cx_mirror_wconv() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.conversaciones (wsp_id, canal, estado, nombre, telefono, grupo, asignado_txt, ultimo_ts, created_at, contacto)
    values (NEW.id, 'whatsapp', public.cx_estado(NEW.etapa), NEW.nombre, NEW.telefono,
            nullif(NEW.canal,'general'), NEW.asignado_a, coalesce(NEW.ultimo_mensaje_at, now()), coalesce(NEW.created_at, now()),
            jsonb_build_object('nombre', NEW.nombre, 'telefono', NEW.telefono))
    on conflict (wsp_id) where wsp_id is not null do update
      set estado = public.cx_estado(NEW.etapa), nombre = NEW.nombre, telefono = NEW.telefono,
          grupo = nullif(NEW.canal,'general'), asignado_txt = NEW.asignado_a,
          ultimo_ts = coalesce(NEW.ultimo_mensaje_at, now()),
          contacto = jsonb_build_object('nombre', NEW.nombre, 'telefono', NEW.telefono);
  exception when others then null;   -- NUNCA bloquear el webhook de WhatsApp
  end;
  return NEW;
end; $$;
drop trigger if exists trg_cx_wconv on public.wsp_conversaciones;
create trigger trg_cx_wconv after insert or update on public.wsp_conversaciones
  for each row execute function public.cx_mirror_wconv();

create or replace function public.cx_mirror_wmsg() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  begin
    select id into v_conv from public.conversaciones where wsp_id = NEW.conversacion_id limit 1;
    if v_conv is null then   -- la conversación aún no está espejada: créala mínima
      insert into public.conversaciones (wsp_id, canal, estado, telefono, ultimo_ts, created_at, contacto)
      values (NEW.conversacion_id, 'whatsapp', 'bot', NEW.telefono, coalesce(NEW.ts, now()), now(),
              jsonb_build_object('telefono', NEW.telefono))
      on conflict (wsp_id) where wsp_id is not null do nothing;
      select id into v_conv from public.conversaciones where wsp_id = NEW.conversacion_id limit 1;
    end if;
    if v_conv is not null then
      insert into public.mensajes (conversacion_id, rol, texto, media, ts, wsp_msg_id)
      values (v_conv, coalesce(NEW.rol,'cliente'), NEW.texto,
              case when coalesce(NEW.tipo,'text') <> 'text' then jsonb_build_object('tipo', NEW.tipo) else null end,
              coalesce(NEW.ts, now()), public.cx_msgkey(v_conv, NEW.wa_message_id, coalesce(NEW.ts, now()), NEW.rol))
      on conflict (wsp_msg_id) where wsp_msg_id is not null do nothing;
      update public.conversaciones set ultimo_ts = coalesce(NEW.ts, now()) where id = v_conv;
    end if;
  exception when others then null;   -- NUNCA bloquear la ingesta de mensajes
  end;
  return NEW;
end; $$;
drop trigger if exists trg_cx_wmsg on public.wsp_mensajes;
create trigger trg_cx_wmsg after insert on public.wsp_mensajes
  for each row execute function public.cx_mirror_wmsg();


-- ═══════════ PASO 2 — backfill de lo YA existente (corre esto DESPUÉS) ═══════════
-- El trigger del PASO 1 ya espeja lo nuevo; esto copia el histórico. El
-- `on conflict do nothing` deduplica contra lo que el trigger ya trajo.

insert into public.conversaciones (wsp_id, canal, estado, nombre, telefono, grupo, asignado_txt, ultimo_ts, created_at, contacto)
select w.id, 'whatsapp', public.cx_estado(w.etapa), w.nombre, w.telefono,
       nullif(w.canal,'general'), w.asignado_a, coalesce(w.ultimo_mensaje_at, w.created_at, now()), coalesce(w.created_at, now()),
       jsonb_build_object('nombre', w.nombre, 'telefono', w.telefono)
from public.wsp_conversaciones w
on conflict (wsp_id) where wsp_id is not null do nothing;

insert into public.mensajes (conversacion_id, rol, texto, media, ts, wsp_msg_id)
select c.id, coalesce(m.rol,'cliente'), m.texto,
       case when coalesce(m.tipo,'text') <> 'text' then jsonb_build_object('tipo', m.tipo) else null end,
       coalesce(m.ts, now()), public.cx_msgkey(c.id, m.wa_message_id, coalesce(m.ts, now()), m.rol)
from public.wsp_mensajes m
join public.conversaciones c on c.wsp_id = m.conversacion_id
on conflict (wsp_msg_id) where wsp_msg_id is not null do nothing;

-- ── Verificar ──
select 'FRATE CONNECT' as check,
       (select count(*) from public.conversaciones where canal='whatsapp') as wsp_espejadas,
       (select count(*) from public.conversaciones) as conversaciones_total,
       (select count(*) from public.mensajes where wsp_msg_id is not null) as mensajes_wsp_espejados;
