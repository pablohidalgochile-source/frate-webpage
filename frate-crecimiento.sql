-- ============================================================
-- FRATE — CRECIMIENTO: recordatorios, panel RRPP, cross-sell,
-- analytics de visitas y cron.
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- ============================================================

-- ── 1) RECUPERAR CARRITOS: marca de recordatorio enviado ─────
alter table public.pedidos add column if not exists recordatorio_at timestamptz;

-- Cron: cada hora revisa pendientes y envía el correo (1 solo por orden).
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('frate-recordatorios'); exception when others then null; end $$;
select cron.schedule(
  'frate-recordatorios', '17 * * * *',
  $$ select net.http_post(
       url := 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/recordar-pendientes',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);

-- ── 2) PANEL RRPP: cada código puede tener DUEÑO ─────────────
alter table public.codigos add column if not exists duenio_id uuid references public.clientes(id) on delete set null;

-- El RRPP puede LEER sus propios códigos (la escritura sigue siendo del admin)
drop policy if exists "codigos_rrpp_read" on public.codigos;
create policy "codigos_rrpp_read" on public.codigos for select
  using (duenio_id = auth.uid());

-- Stats por código: admin ve todos, RRPP solo los suyos (con ventas y monto)
create or replace function public.stats_codigos() returns json
language plpgsql security definer set search_path = public as $$
declare v_rol text; v json;
begin
  select rol into v_rol from clientes where id = auth.uid();
  if v_rol not in ('admin','rrpp') then return json_build_object('error','Sin permiso'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.creado desc), '[]'::json) into v from (
    select c.id, c.codigo, c.tipo, c.rrpp_nombre, c.descuento_tipo, c.descuento_valor,
           c.evento_id, (select nombre from eventos e where e.id = c.evento_id) as evento_nombre,
           c.usos, c.max_usos, c.activo, c.created_at as creado, c.duenio_id,
           (select coalesce('@'||cl.username, cl.nombres) from clientes cl where cl.id = c.duenio_id) as duenio,
           coalesce((select count(*) from pedidos p where p.codigo_id = c.id and p.estado = 'pagado'), 0) as ventas,
           coalesce((select sum(p.total_pagado) from pedidos p where p.codigo_id = c.id and p.estado = 'pagado'), 0) as monto
    from codigos c
    where v_rol = 'admin' or c.duenio_id = auth.uid()
  ) t;
  return v;
end; $$;
grant execute on function public.stats_codigos() to authenticated;

-- ── 3) CROSS-SELL en el checkout (nace apagado) ──────────────
insert into public.config_sitio (clave, visible, label) values
  ('crosssell', false, 'Cross-sell 🍹 "Suma a tu noche" en el checkout')
on conflict (clave) do nothing;

-- ── 4) ANALYTICS PROPIO: visitas del sitio ───────────────────
create table if not exists public.visitas (
  id         bigserial primary key,
  uid        text,
  pagina     text,
  created_at timestamptz default now()
);
create index if not exists visitas_created_idx on public.visitas (created_at);
alter table public.visitas enable row level security;
-- sin policies públicas: se escribe/lee solo vía RPCs

create or replace function public.registrar_visita(p_uid text, p_pagina text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_uid,'')) between 6 and 64 then
    insert into visitas (uid, pagina) values (p_uid, left(coalesce(p_pagina,'/'), 80));
  end if;
end; $$;
grant execute on function public.registrar_visita(text, text) to anon, authenticated;

create or replace function public.visitas_stats() returns json
language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol = 'admin') then
    return json_build_object('error','Solo admin');
  end if;
  select json_build_object(
    'hoy',        (select count(*) from visitas where created_at > date_trunc('day', now() at time zone 'America/Santiago') at time zone 'America/Santiago'),
    'unicos_hoy', (select count(distinct uid) from visitas where created_at > date_trunc('day', now() at time zone 'America/Santiago') at time zone 'America/Santiago'),
    'semana',     (select count(*) from visitas where created_at > now() - interval '7 days'),
    'unicos_semana', (select count(distinct uid) from visitas where created_at > now() - interval '7 days')
  ) into v;
  return v;
end; $$;
grant execute on function public.visitas_stats() to authenticated;

-- ── 5) Verificación ──────────────────────────────────────────
select 'recordatorio_at' as check, case when exists(select 1 from information_schema.columns where table_name='pedidos' and column_name='recordatorio_at') then 'OK' else 'FALTA' end
union all select 'codigos.duenio_id', case when exists(select 1 from information_schema.columns where table_name='codigos' and column_name='duenio_id') then 'OK' else 'FALTA' end
union all select 'cron programado', case when exists(select 1 from cron.job where jobname='frate-recordatorios') then 'OK' else 'FALTA' end
union all select 'tabla visitas', case when exists(select 1 from pg_tables where tablename='visitas') then 'OK' else 'FALTA' end
union all select 'rpc stats_codigos', case when exists(select 1 from pg_proc where proname='stats_codigos') then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO.
-- ============================================================
