-- ============================================================
-- FRATE — Tiempo real (opcional pero recomendado)
-- Habilita Supabase Realtime en las tablas clave para que varias
-- computadoras vean los cambios AL INSTANTE (sin esperar el sondeo
-- de respaldo de 18s que ya funciona igual).
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- Si alguna tabla ya está en la publicación, ignora ese error puntual.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'pedidos','items_pedido','qr_usados','listas','lista_inscritos',
    'reservas','conversaciones','mensajes','invitaciones_rrpp','crm_webhooks_pendientes'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when others then null;
    end;
  end loop;
end $$;

select 'realtime' as check, string_agg(tablename, ', ') as tablas
from pg_publication_tables where pubname = 'supabase_realtime';
