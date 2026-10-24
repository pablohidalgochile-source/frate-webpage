-- ============================================================
-- FRATE — Menú & Opciones: covers (trago cortesía) + botellas
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- Idempotente (upsert por tipo+nombre).
-- ============================================================

create table if not exists public.catalogo_items (
  id          bigint generated always as identity primary key,
  tipo        text not null,              -- cover_cumple | cover_invitado | botella
  nombre      text not null,
  detalle     text,
  precio      integer,                    -- precio normal (botellas)
  precio_desc integer,                    -- precio con descuento cumpleañ@ (botellas)
  orden       integer not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists catalogo_items_tipo_nombre_key on public.catalogo_items (tipo, nombre);

-- RLS: lectura pública (como paquetes)
alter table public.catalogo_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='catalogo_items' and policyname='catalogo_items_public_read') then
    create policy catalogo_items_public_read on public.catalogo_items for select using (true);
  end if;
end $$;
drop policy if exists "catalogo_items_admin_write" on public.catalogo_items;
create policy "catalogo_items_admin_write" on public.catalogo_items for all
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

-- ── COVER CUMPLEAÑ@ (elige 1; se entrega al cumpleañ@ al llegar) ──
insert into public.catalogo_items (tipo, nombre, detalle, orden) values
('cover_cumple','2 shots de tequila',null,1),
('cover_cumple','Lata de RedBull',null,2),
('cover_cumple','Lata de bebida',null,3),
('cover_cumple','Botella de agua','con o sin gas',4),
('cover_cumple','Botella de cerveza',null,5),
('cover_cumple','Mojito','frasco 1L',6),
('cover_cumple','Adios Motherfucker','frasco 1L',7),
('cover_cumple','Ron Bacardi','frasco 1L',8),
('cover_cumple','Pisco Capel','frasco 1L',9),
('cover_cumple','Vodka','frasco 1L',10),
('cover_cumple','Johnnie Walker','500cc',11)
on conflict (tipo,nombre) do update set detalle=excluded.detalle, orden=excluded.orden;

-- ── COVER INVITAD@ (elige 1) ──
insert into public.catalogo_items (tipo, nombre, detalle, orden) values
('cover_invitado','Shot de tequila',null,1),
('cover_invitado','Lata de bebida',null,2),
('cover_invitado','Botella de agua','con o sin gas',3),
('cover_invitado','Botella de cerveza',null,4),
('cover_invitado','Ron Bacardi','vaso M',5),
('cover_invitado','Pisco Capel','vaso M',6),
('cover_invitado','Vodka','vaso M',7)
on conflict (tipo,nombre) do update set detalle=excluded.detalle, orden=excluded.orden;

-- ── MENÚ DE BOTELLAS (precio normal → precio cumpleañ@) ──
insert into public.catalogo_items (tipo, nombre, detalle, precio, precio_desc, orden) values
('botella','Espumante Chandon 750cc','+ 4 RedBull',45000,35000,1),
('botella','Licor Jägermeister 1L','+ 4 RedBull',60000,50000,2),
('botella','Tequila Jose Cuervo 750cc','+ limones y sal',55000,45000,3),
('botella','Pisco Alto del Carmen 1L',null,50000,40000,4),
('botella','Pisco Mistral 1L',null,50000,40000,5),
('botella','Pisco Mistral Apple 700cc',null,60000,50000,6),
('botella','Pisco Mistral Nobel 750cc',null,60000,50000,7),
('botella','Ron Havana Añejo Especial 700cc',null,50000,40000,8),
('botella','Vodka Absolut 750cc','normal o sabores',50000,40000,9),
('botella','Vodka Grey Goose 750cc',null,80000,70000,10),
('botella','Licor Fernet Branca 750cc',null,50000,40000,11),
('botella','Gin Bombay 750cc',null,60000,50000,12),
('botella','Whisky Johnnie Walker Etiqueta Roja 750cc',null,55000,45000,13),
('botella','Whisky Johnnie Walker Etiqueta Negra 750cc',null,70000,60000,14),
('botella','Whisky Chivas Regal 750cc',null,70000,60000,15),
('botella','Whisky Jack Daniel''s 750cc',null,70000,60000,16),
('botella','Whisky Jack Daniel''s Apple o Honey 750cc',null,70000,60000,17),
('botella','Gin Hendrick''s',null,80000,70000,18),
('botella','Tequila Don Julio',null,100000,90000,19),
('botella','Whisky Johnnie Walker Blue Label 750cc',null,500000,500000,20)
on conflict (tipo,nombre) do update set detalle=excluded.detalle, precio=excluded.precio, precio_desc=excluded.precio_desc, orden=excluded.orden;

-- ── Adjunta el flyer del pack de botellas a los paquetes de reserva (si no tienen foto propia) ──
update public.paquetes set foto_url = coalesce(foto_url, '/flyers/pack-reserva-espacio.jpg')
  where nombre in ('Carrete Reservados','Privado de Novi@');

select tipo, count(*) as items from public.catalogo_items group by tipo order by tipo;
