-- ============================================================
-- FRATE · QUE EL PANEL SE ACTUALICE SOLO
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL PROBLEMA: hay que apretar refrescar para ver todo. El panel YA tiene
-- código de tiempo real (`initRealtime` escucha 10 tablas), pero Supabase
-- **no emite** cambios de una tabla si no está en la publicación
-- `supabase_realtime`. Si no está, el navegador se suscribe a un canal que
-- nunca dice nada, y todo queda dependiendo del respaldo de 18 segundos.
--
-- Este SQL agrega las tablas a la publicación. Es lo que enciende el aviso.
--
-- ⚠️ El tiempo real de Supabase RESPETA la RLS: solo llega el cambio a quien
--    ya podía leer esa fila. Nadie ve nada que no viera antes.
--
-- Idempotente.
-- ============================================================

-- ── 1) ¿Cuáles están hoy en la publicación? (míralo antes) ──
select tablename as ya_emite_cambios
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;


-- ── 2) Agregar las que el panel escucha ──
-- `replica identity full` hace que el aviso incluya la fila completa; sin eso
-- solo llega la clave primaria y el panel no puede decidir si le interesa.
do $$
declare t text;
begin
  foreach t in array array[
    'pedidos','items_pedido','qr_usados','listas','lista_inscritos',
    'reservas','conversaciones','mensajes','puerta_solicitudes'
  ] loop
    -- Saltar las que no existan todavía en esta base.
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      continue;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;


-- ── 3) Cómo quedó ──
select tablename as emite_cambios,
       case when c.relreplident = 'f' then '✅ fila completa' else '⚠️ solo la clave' end as detalle
from pg_publication_tables pt
join pg_class c on c.relname = pt.tablename
where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
order by tablename;

-- ============================================================
-- QUÉ CAMBIA
--
-- Antes: el panel se enteraba de un cambio en 18 segundos como MUCHO — y solo
--        si no había un modal abierto, ni el foco en un campo, ni estabas en
--        Comunidad o Configuración. En la práctica: casi nunca.
--
-- Ahora: llega el aviso al instante desde la base. El respaldo de 18 s sigue
--        ahí por si el canal se cae (Wi-Fi malo en la puerta, por ejemplo).
--
-- Si alguna tabla NO aparece en el bloque 3, es que no existe todavía en esta
-- base: corre su SQL primero y vuelve a pasar este.
-- ============================================================
