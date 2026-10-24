-- 🎁 CORTESÍAS SOLO PARA MIEMBROS · en el catálogo
-- Corre esto UNA vez. Se puede repetir sin duplicar nada.
--
-- ① El catálogo aprende los dos candados (ya existían solo en los tickets
--    de cada evento).
alter table public.catalogo_tickets add column if not exists solo_miembros   boolean not null default false;
alter table public.catalogo_tickets add column if not exists uno_por_persona boolean not null default false;

-- ② Las dos cortesías, con el formato de las tuyas: $0, una por compra, no
--    transferibles, verifican edad, válidas hasta las 00:30 y sin día.
insert into public.catalogo_tickets
  (nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
   hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
   max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
select v.* from (values
  ('CORTESIA MUJER (MIEMBROS)',
   'TICKET GRATUITO solo para MIEMBROS de FRATE. Exclusivo para MUJERES (según sexo indicado en Cédula). Es PERSONALIZADO, NO TRANSFERIBLE y UNO POR PERSONA. Podrás CANJEARLO EN PUERTA hasta las 00:30 HRS presentando tu C.I. física.',
   E'Solo para miembros de FRATE (entra con tu cuenta)\nExclusivo para mujeres (según sexo indicado en Cédula)\nUno por persona · personalizado y no transferible\nPresenta tu C.I. física en la puerta\nVálido hasta las 00:30 hrs',
   0, 1, 'F', 'cortesia', true, '00:30', false, 'general', 'CORTESIA MUJER (MIEMBROS)',
   true, true, 0, true, false, 3, true, true),
  ('CORTESIA HOMBRE UNIVERSITARIO (MIEMBROS)',
   'TICKET GRATUITO solo para MIEMBROS de FRATE. Exclusivo para HOMBRES UNIVERSITARIOS (Al momento del INGRESO al local DEBERÁS PRESENTAR tu C.I. + tu ID de tu Institución de Educación Superior). Es PERSONALIZADO, NO TRANSFERIBLE y UNO POR PERSONA. Válido hasta las 00:30 HRS.',
   E'Solo para miembros de FRATE (entra con tu cuenta)\nExclusivo para hombres universitarios\nPresenta tu C.I. + credencial de tu institución al ingreso\nUno por persona · personalizado y no transferible\nVálido hasta las 00:30 hrs',
   0, 1, 'U', 'cortesia', true, '00:30', false, 'general', 'CORTESIA HOMBRE UNIVERSITARIO (MIEMBROS)',
   true, true, 0, true, false, 3, true, true)
) as v(nombre, descripcion, instrucciones, precio, max_por_compra, genero, clase, clase_confirmada,
       hora_max_ingreso, transferible, zona, rotulo, chequear_edad, permite_extranjero,
       max_acompanantes, activo, es_default, orden, solo_miembros, uno_por_persona)
where not exists (select 1 from public.catalogo_tickets c where upper(c.nombre) = upper(v.nombre));

-- ③ Al crear un ticket de evento a partir del catálogo, hereda los candados.
--    Vale para el admin, el ERP y el brief, sin tocar el ERP. Solo al crearse:
--    en esa noche los puedes apagar y no vuelven solos.
create or replace function public.tipos_ticket_hereda_miembros()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.catalogo_id is not null then
    select solo_miembros, uno_por_persona into c from public.catalogo_tickets where id = new.catalogo_id;
    if found then
      new.solo_miembros   := coalesce(new.solo_miembros, false)   or coalesce(c.solo_miembros, false);
      new.uno_por_persona := coalesce(new.uno_por_persona, false) or coalesce(c.uno_por_persona, false);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_tipos_ticket_hereda_miembros on public.tipos_ticket;
create trigger trg_tipos_ticket_hereda_miembros
  before insert on public.tipos_ticket
  for each row execute function public.tipos_ticket_hereda_miembros();

-- ✅ Comprobación
select id, nombre, genero, precio, max_por_compra, hora_max_ingreso, solo_miembros, uno_por_persona
  from public.catalogo_tickets where nombre ilike '%(MIEMBROS)%' order by id;
