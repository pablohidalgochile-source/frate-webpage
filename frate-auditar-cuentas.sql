-- ============================================================
-- FRATE · Auditoría de cuentas sospechosas (proyecto WEB)
-- Corre TODO este archivo en Supabase → SQL Editor.
-- Crea funciones para validar RUT y lista las cuentas con
-- RUT falso / sin RUT / teléfono falso. NO borra nada.
-- ============================================================

-- Limpia el RUT a solo dígitos + K
create or replace function public.rut_limpio(r text) returns text
language sql immutable as $$
  select regexp_replace(upper(coalesce(r,'')), '[^0-9K]', '', 'g')
$$;

-- Valida el dígito verificador (módulo 11)
create or replace function public.rut_dv_ok(r text) returns boolean
language plpgsql immutable as $$
declare c text := public.rut_limpio(r); body text; dv text; s int := 0; m int := 2; i int; calc text;
begin
  if c !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(c, length(c)-1); dv := right(c,1);
  for i in reverse length(body)..1 loop
    s := s + substr(body,i,1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  calc := case (11 - (s % 11)) when 11 then '0' when 10 then 'K' else (11 - (s % 11))::text end;
  return calc = dv;
end $$;

-- ¿RUT sospechoso? vacío / DV malo / todos los dígitos iguales / secuencia
create or replace function public.rut_sospechoso(r text) returns boolean
language plpgsql immutable as $$
declare c text := public.rut_limpio(r); body text;
begin
  if c = '' or length(c) < 8 then return true; end if;
  if not public.rut_dv_ok(r) then return true; end if;
  body := left(c, length(c)-1);
  if body ~ '^(.)\1+$' then return true; end if;                       -- 111..., 888...
  if body in ('12345678','23456789','1234567','7654321','87654321','98765432') then return true; end if;
  return false;
end $$;

-- ── LISTADO de cuentas sospechosas (lo que te importa ver) ──
select
  username,
  email,
  trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')) as nombre,
  rut,
  telefono,
  universidad,
  rol,
  created_at,
  (select count(*) from public.pedidos p where p.cliente_id = c.id and p.estado = 'pagado') as compras_pagadas,
  case
    when coalesce(rut,'') = ''            then 'SIN RUT'
    when not public.rut_dv_ok(rut)        then 'RUT dígito inválido'
    when public.rut_sospechoso(rut)       then 'RUT patrón falso'
    else ''
  end as motivo_rut,
  case when regexp_replace(coalesce(telefono,''),'[^0-9]','','g') ~ '(.)\1{7,}' then 'TEL falso' else '' end as motivo_tel
from public.clientes c
where public.rut_sospechoso(rut)
   or regexp_replace(coalesce(telefono,''),'[^0-9]','','g') ~ '(.)\1{7,}'
order by created_at desc;

-- ── Resumen: cuántas cuentas hay por estado de RUT ──
-- select
--   count(*) filter (where coalesce(rut,'')='')            as sin_rut,
--   count(*) filter (where rut is not null and rut<>'' and not public.rut_dv_ok(rut)) as dv_malo,
--   count(*) filter (where public.rut_dv_ok(rut) and public.rut_sospechoso(rut))       as patron_falso,
--   count(*) filter (where not public.rut_sospechoso(rut)) as rut_ok
-- from public.clientes;
