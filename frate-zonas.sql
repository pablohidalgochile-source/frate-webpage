-- ============================================================
-- FRATE · ZONAS Y REGALÍAS — dónde va cada persona y qué trae
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- EL PROBLEMA: "tipo de entrada" son TRES cosas distintas y el sistema las
-- mezclaba en una sola:
--     · CÓMO se pagó   → venta / cortesía / puerta   (ya resuelto: es_venta)
--     · DÓNDE va       → General / VIP Fuego / ...   ← escondido en el NOMBRE
--     · QUÉ trae       → cover, descuento            ← escondido en un texto
--
-- Por eso no se podía preguntar "¿cuántos entraron a VIP Fuego anoche?".
--
-- ⚠️ ZONA y REGALÍA van SEPARADAS a propósito: alguien puede tener descuento
--    Y ser VIP Fuego. Si el descuento fuera una zona, esas dos cosas no
--    podrían coexistir.
--
-- Idempotente.
-- ============================================================

-- ── 1) Las zonas. Editables desde el panel. ──
create table if not exists public.zonas (
  id                serial primary key,
  clave             text unique not null,
  nombre            text not null,
  emoji             text,
  color             text default '#8b8b95',
  aforo             int,                    -- cupo normal (null = sin tope)
  aforo_max         int,                    -- hasta dónde puede ampliar un admin
  asigna_al_llegar  boolean default false,  -- el lugar se decide en la puerta
  activa            boolean default true,
  orden             int default 0,
  creado_at         timestamptz default now()
);

-- Las que definió el dueño. Los VIP: 80 normal, ampliable a 100 por un admin.
insert into public.zonas(clave, nombre, emoji, color, aforo, aforo_max, asigna_al_llegar, orden)
select * from (values
  ('general',   'General',              '🟦', '#60a5fa', null, null, false, 1),
  ('vip_fuego', 'VIP Fuego',            '🔥', '#FF3B3B',   80,  100, false, 2),
  ('vip_aire',  'VIP Aire',             '💨', '#06E5B0',   80,  100, false, 3),
  ('vip_disp',  'VIP a disponibilidad', '⏳', '#E6C860',   80,  100, true,  4)
) v(clave, nombre, emoji, color, aforo, aforo_max, asigna_al_llegar, orden)
where not exists (select 1 from public.zonas z where z.clave = v.clave);

alter table public.zonas enable row level security;
drop policy if exists zonas_lectura on public.zonas;
create policy zonas_lectura on public.zonas for select using (true);
drop policy if exists zonas_admin on public.zonas;
create policy zonas_admin on public.zonas for all
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol='admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol='admin'));


-- ── 2) La zona y la regalía viajan con la lista ──
alter table public.listas add column if not exists zona_id          int references public.zonas(id);
alter table public.listas add column if not exists descuento_monto  int default 0;
-- `cover_amount` y `benefit_text` ya existían (de frate-link.sql): se reusan.

-- Y también con la entrada emitida, para poder contar por zona.
alter table public.items_pedido add column if not exists zona_id int references public.zonas(id);
create index if not exists idx_items_zona on public.items_pedido(zona_id, evento_id);

-- El catálogo ya tenía `zona` como TEXTO libre; se le agrega el enlace real.
alter table public.catalogo_tickets add column if not exists zona_id int references public.zonas(id);
alter table public.tipos_ticket     add column if not exists zona_id int references public.zonas(id);


-- ── 3) Qué zona le toca a un QR (lo usa la puerta) ──
create or replace function public.zona_de_qr(p_qr text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; z record;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','portero','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  -- Prioridad: la entrada emitida → su tipo de ticket → la lista de donde salió.
  select z.* into z
    from public.items_pedido ip
    left join public.zonas z on z.id = coalesce(
        ip.zona_id,
        (select tt.zona_id from public.tipos_ticket tt where tt.id = ip.tipo_ticket_id),
        (select l.zona_id from public.lista_inscritos li
           join public.listas l on l.id = li.lista_id
          where li.pedido_cortesia_id = ip.pedido_id limit 1))
   where ip.qr_ids ? p_qr
   limit 1;

  if z.id is null then return jsonb_build_object('ok', true, 'zona', null); end if;
  return jsonb_build_object('ok', true, 'zona', jsonb_build_object(
    'id', z.id, 'nombre', z.nombre, 'emoji', z.emoji, 'color', z.color,
    'aforo', z.aforo, 'aforo_max', z.aforo_max, 'asigna_al_llegar', z.asigna_al_llegar));
end; $$;
grant execute on function public.zona_de_qr(text) to authenticated;


-- ── 4) Cuánta gente hay en cada zona AHORA (la puerta lo necesita en vivo) ──
create or replace function public.zonas_aforo(p_evento_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','portero','rrpp') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  return jsonb_build_object('ok', true, 'zonas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', z.id, 'clave', z.clave, 'nombre', z.nombre, 'emoji', z.emoji,
             'color', z.color, 'aforo', z.aforo, 'aforo_max', z.aforo_max,
             'asigna_al_llegar', z.asigna_al_llegar,
             'dentro', coalesce(d.n, 0),
             'lleno', z.aforo is not null and coalesce(d.n,0) >= z.aforo
           ) order by z.orden, z.id)
      from public.zonas z
      left join lateral (
        select count(*) as n
          from public.items_pedido ip
          join lateral jsonb_array_elements_text(coalesce(ip.qr_ids,'[]'::jsonb)) q(v) on true
          join public.qr_usados u on u.qr_id = q.v
         where ip.evento_id = p_evento_id and ip.zona_id = z.id
      ) d on true
     where z.activa
  ), '[]'::jsonb));
end; $$;
grant execute on function public.zonas_aforo(int) to authenticated;


-- ── 5) Verificación ──
select 'tabla zonas' as chequeo,
       case when exists(select 1 from information_schema.tables where table_name='zonas') then '✅ ok' else '❌ falta' end as estado
union all
select 'listas.zona_id',
       case when exists(select 1 from information_schema.columns where table_name='listas' and column_name='zona_id') then '✅ ok' else '❌ falta' end
union all
select 'items_pedido.zona_id',
       case when exists(select 1 from information_schema.columns where table_name='items_pedido' and column_name='zona_id') then '✅ ok' else '❌ falta' end
union all
select 'función zona_de_qr',
       case when exists(select 1 from pg_proc where proname='zona_de_qr') then '✅ ok' else '❌ falta' end
union all
select 'función zonas_aforo',
       case when exists(select 1 from pg_proc where proname='zonas_aforo') then '✅ ok' else '❌ falta' end;

select emoji || ' ' || nombre as zona, aforo, aforo_max,
       case when asigna_al_llegar then 'se asigna en la puerta' else 'viene definida' end as cuando
from public.zonas order by orden;

-- ============================================================
-- LO QUE ESTO DEJA LISTO
--   · Zonas editables desde el panel (nombre, emoji, color, aforo, tope).
--   · La zona viaja: lista → entrada emitida → puerta.
--   · `zonas_aforo(evento)` dice cuánta gente hay en cada zona AHORA MISMO.
--
-- LO QUE TODAVÍA NO HACE
--   · No BLOQUEA el ingreso cuando una zona está llena: por ahora AVISA.
--     Bloquear en la puerta es la fase siguiente — primero hay que ver los
--     números reales una noche, porque un bloqueo mal calibrado deja gente
--     afuera que sí cabía.
--   · El cover (elegirlo en la puerta y quemarlo en la barra) es aparte:
--     toca el POS, no solo la web.
-- ============================================================
