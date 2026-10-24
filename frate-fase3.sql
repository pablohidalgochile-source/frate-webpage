-- ============================================================
-- FRATE · FASE 3 — FRATE CONNECT: notas internas + estados de entrega
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor. Idempotente, aditivo.
--
--   A · Estados de entrega (✓ enviado · ✓✓ entregado · ✓✓ leído · ⚠️ falló)
--       Meta ya los manda; hasta ahora se tiraban a la basura.
--   B · Notas internas por conversación (lo que el equipo anota del cliente,
--       invisible para él).
-- ============================================================

-- ── A · Estado de cada mensaje enviado ──
alter table public.wsp_mensajes add column if not exists estado       text;   -- enviado | entregado | leido | fallido
alter table public.wsp_mensajes add column if not exists estado_error text;   -- motivo si falló (ej: número inválido)
create index if not exists idx_wsp_msg_waid on public.wsp_mensajes(wa_message_id);

-- ── B · Notas internas del equipo ──
alter table public.conversaciones  add column if not exists notas text;
alter table public.wsp_conversaciones add column if not exists notas text;

-- ── Verificación ──
select 'A · estado del mensaje' as bloque,
       case when exists(select 1 from information_schema.columns where table_name='wsp_mensajes' and column_name='estado')
            then '✅' else '❌' end as estado
union all
select 'B · notas en conversaciones',
       case when exists(select 1 from information_schema.columns where table_name='conversaciones' and column_name='notas')
            then '✅' else '❌' end
union all
select 'B · notas en wsp_conversaciones',
       case when exists(select 1 from information_schema.columns where table_name='wsp_conversaciones' and column_name='notas')
            then '✅' else '❌' end;
