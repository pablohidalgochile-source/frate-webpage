-- ============================================================
-- FRATE — Planos / Disposición espacial (Fase 1, WEB)
-- Guarda el/los mapa(s) del local como JSON. El EDITOR vive en el
-- ERP (fuente única); la WEB los IMPORTA y los DIBUJA (visualizador
-- + selector de ZONA para el cliente en reservas). Fase 2: leerlos
-- en vivo del ERP por api-crm.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh). Idempotente.
-- ============================================================

create table if not exists public.planos (
  id         bigserial primary key,
  nombre     text not null,
  data       jsonb not null default '{}'::jsonb,  -- {w,h,espacios:[{tipo,forma,x,y,w,h,d,r,rot,nombre,color,cap,precio,sel}]}
  activo     boolean default true,
  orden      int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists planos_orden_idx on public.planos (orden, id) where activo;

alter table public.planos enable row level security;
-- Lectura pública (el formulario de reserva anónimo muestra el mapa)
drop policy if exists "planos_public_read" on public.planos;
create policy "planos_public_read" on public.planos for select using (activo = true);
-- Admin lee todo + administra
drop policy if exists "planos_admin_all" on public.planos;
create policy "planos_admin_all" on public.planos for all
  using (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from clientes where id = auth.uid() and rol = 'admin'));

-- Semilla: un mapa de ejemplo (bórralo/edítalo o reemplázalo importando el del ERP)
insert into public.planos (nombre, data, orden)
select 'Mapa referencial', $json${
  "w": 320, "h": 360,
  "espacios": [
    {"tipo":"escenario","forma":"rect","x":90,"y":14,"w":140,"h":26,"nombre":"ESCENARIO"},
    {"tipo":"zona","forma":"rect","x":70,"y":150,"w":180,"h":120,"nombre":"PISTA GENERAL","color":"#E8363D","sel":true},
    {"tipo":"zona","forma":"path","d":"M60 280 Q160 320 260 280 L250 340 Q160 372 70 340 Z","nombre":"ZONA B","color":"#E8363D","sel":true},
    {"tipo":"zona","forma":"path","d":"M256 60 L300 70 L300 250 L256 260 Z","nombre":"TERRAZA","color":"#3b82f6","sel":true},
    {"tipo":"mesa","forma":"rect","x":16,"y":70,"w":42,"h":30,"nombre":"VIP 1","color":"#D4A832","cap":8,"precio":120000,"sel":true},
    {"tipo":"mesa","forma":"rect","x":16,"y":108,"w":42,"h":30,"nombre":"VIP 2","color":"#D4A832","cap":8,"precio":120000,"sel":true},
    {"tipo":"mesa","forma":"rect","x":16,"y":146,"w":42,"h":30,"nombre":"VIP 3","color":"#D4A832","cap":10,"precio":150000,"sel":true},
    {"tipo":"mesa","forma":"rect","x":16,"y":184,"w":42,"h":30,"nombre":"VIP 4","color":"#D4A832","cap":8,"precio":120000,"sel":true},
    {"tipo":"mesa","forma":"rect","x":16,"y":222,"w":42,"h":30,"nombre":"VIP 5","color":"#D4A832","cap":8,"precio":120000,"sel":true}
  ]
}$json$::jsonb, 0
where not exists (select 1 from public.planos);

select 'planos' as check,
       case when exists(select 1 from pg_tables where tablename='planos') then 'OK' else 'FALTA' end,
       (select count(*) from public.planos) as mapas;
