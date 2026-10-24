-- ============================================================
-- FRATE — Autocompletar de personas (CRM)
-- buscar_personas(q): busca en TODA la gente que ya pasó por el
-- sistema (clientes registrados + inscritos de listas + reservas +
-- compradores), deduplicada por RUT/correo. Solo admin/rrpp.
-- La usan los modales de invitación para no re-tipear todo.
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- ============================================================

create or replace function public.buscar_personas(q text)
returns table(nombre text, rut text, email text, telefono text, origen text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')) then
    return;   -- sin permiso → nada
  end if;
  if length(coalesce(q,'')) < 2 then return; end if;

  return query
  with base as (
    select li.nombre, li.rut, li.email, li.telefono, 'inscrito'::text as origen
      from lista_inscritos li
     where li.nombre ilike '%'||q||'%' or li.rut ilike '%'||q||'%' or li.email ilike '%'||q||'%'
    union all
    select r.nombre, r.rut, r.email, r.telefono, 'reserva'
      from reservas r
     where r.nombre ilike '%'||q||'%' or r.rut ilike '%'||q||'%' or r.email ilike '%'||q||'%'
    union all
    select p.nombre_cliente, null, p.email_cliente, null, 'venta'
      from pedidos p
     where p.nombre_cliente ilike '%'||q||'%' or p.email_cliente ilike '%'||q||'%'
    union all
    select btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')), null, c.email, null, 'cliente'
      from clientes c
     where (coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')) ilike '%'||q||'%' or c.email ilike '%'||q||'%'
  )
  select distinct on (coalesce(nullif(btrim(b.rut),''), lower(nullif(btrim(b.email),'')), lower(b.nombre)))
         b.nombre, b.rut, b.email, b.telefono, b.origen
    from base b
   where coalesce(btrim(b.nombre),'') <> ''
   order by coalesce(nullif(btrim(b.rut),''), lower(nullif(btrim(b.email),'')), lower(b.nombre)),
            (b.rut is not null) desc, (b.telefono is not null) desc
   limit 12;
end; $$;
grant execute on function public.buscar_personas(text) to authenticated;

select 'buscar_personas' as check, case when exists(select 1 from pg_proc where proname='buscar_personas') then 'OK' else 'FALTA' end;
