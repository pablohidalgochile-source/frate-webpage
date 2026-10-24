-- 🎁 CORTESÍAS DE MIEMBROS · paso 3 de 3 · solo toca tipos_ticket
-- Al crear un ticket de evento desde el catálogo, hereda los candados.
-- Vale para el admin, el ERP y el brief. Solo al crearse: en esa noche los
-- puedes apagar y no vuelven solos.
-- Espera máximo 5 s por la tabla; si avisa «lock timeout», vuelve a correrlo.
set lock_timeout = '5s';

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

select tgname as disparador_listo from pg_trigger
 where tgname = 'trg_tipos_ticket_hereda_miembros';
