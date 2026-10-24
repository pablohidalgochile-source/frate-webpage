-- 🎓 CONVENIOS UNIVERSITARIOS · PARTE 1 de 2 — la tabla
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- QUÉ RESUELVE:
--   Hoy los convenios no existen como dato. Hay una respuesta del bot con
--   categoría «convenio» y una página pública escrita a mano, pero nada
--   que diga qué universidad tiene convenio, con qué beneficio, ni hasta
--   cuándo. Cuando uno vence, nadie se entera.
--
--   Lo bueno: `clientes.universidad` YA está lleno. O sea ya sabes de qué
--   universidad es cada persona; lo que falta es el otro lado del cruce.
--
-- ⚠️ ESTO NO SE MUESTRA AL CLIENTE. La página pública de FRAT&FRIENDS
--    queda exactamente como está. Esta tabla es solo para el admin, y la
--    política de abajo la deja cerrada a staff.

create table if not exists public.convenios (
  id            bigserial primary key,
  institucion   text not null,              -- «Universidad del Desarrollo»
  alias         text,                       -- «UDD» — como la escribe la gente
  beneficio     text not null,              -- «Cover rebajado los jueves»
  detalle       text,
  desde         date,
  hasta         date,                       -- null = sin fecha de término
  contacto      text,                       -- con quién se habla allá
  activo        boolean not null default true,
  nota          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists convenios_inst_idx on public.convenios (lower(btrim(institucion)));
create index        if not exists convenios_activo_idx on public.convenios (activo, hasta);

alter table public.convenios enable row level security;

-- Solo staff. El cliente no ve esta tabla ni por asomo.
drop policy if exists convenios_staff on public.convenios;
create policy convenios_staff on public.convenios for all
  using (exists (select 1 from public.clientes c
                  where c.id = auth.uid() and c.rol in ('admin','rrpp')));


-- ── Cuánta gente trae cada institución ────────────────────────────
-- La cuenta la hace la BASE, no el navegador. Con miles de clientes,
-- traerlos todos para contarlos acá es justo el error que nos tuvo el
-- panel colgado media hora el viernes.
create or replace function public.convenios_alcance()
returns table (institucion text, personas bigint, con_compra bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(c.universidad), ''), '— sin universidad —'),
         count(*)::bigint,
         count(*) filter (where exists (
           select 1 from public.pedidos p
            where p.cliente_id = c.id and p.estado = 'pagado'))::bigint
  from public.clientes c
  where exists (select 1 from public.clientes s
                 where s.id = auth.uid() and s.rol in ('admin','rrpp'))
  group by 1
  order by 2 desc
$$;

revoke execute on function public.convenios_alcance() from anon, public;
grant  execute on function public.convenios_alcance() to authenticated;


-- ── Chequeo · qué universidades ya tienes en tu base ──────────────
select * from public.convenios_alcance() limit 15;
