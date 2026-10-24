-- ============================================================
-- FRATE — Fix chats: permitir BORRAR + asegurar columna de GRUPO
-- Las políticas de conversaciones/mensajes tenían SELECT/UPDATE/INSERT
-- pero NO DELETE → por eso "borrar chat" no hacía nada (RLS lo bloquea
-- en silencio). Agrega DELETE para admin y asegura la columna grupo.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

-- Columna de grupo (idempotente, por si el otro SQL no alcanzó a correr)
alter table public.conversaciones add column if not exists grupo text;
create index if not exists conversaciones_grupo_idx on public.conversaciones (grupo) where grupo is not null;

-- DELETE para admin (faltaba)
drop policy if exists "conv_staff_del" on public.conversaciones;
create policy "conv_staff_del" on public.conversaciones for delete
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

drop policy if exists "msg_staff_del" on public.mensajes;
create policy "msg_staff_del" on public.mensajes for delete
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Verificación
select 'conversaciones DELETE policy' as check, case when exists(select 1 from pg_policies where tablename='conversaciones' and cmd='DELETE') then 'OK' else 'FALTA' end
union all
select 'mensajes DELETE policy',              case when exists(select 1 from pg_policies where tablename='mensajes'       and cmd='DELETE') then 'OK' else 'FALTA' end
union all
select 'conversaciones.grupo',                case when exists(select 1 from information_schema.columns where table_name='conversaciones' and column_name='grupo') then 'OK' else 'FALTA' end;
