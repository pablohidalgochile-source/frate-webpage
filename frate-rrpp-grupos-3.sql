-- 🏠 UNIR LA CASA · parte 3 de 3 — "FRATE", "la caja" y @invitafrate son uno
-- Corre DESPUÉS de la parte 1 y la parte 2.
--
-- No borra nada. Usa el mismo mecanismo que el botón "unir" del panel
-- (tabla rrpp_alias), así que se revierte con frate-rrpp-grupos-revertir.sql.
-- NO toca "(sin dueño)": ese lo dejo aparte a propósito, para que lo mires tú.

do $$
declare v_final text; v_n int := 0;
begin
  -- La clave manda: si la cuenta @invitafrate existe, gana su id.
  select coalesce(c.id::text, 'txt:INVITAFRATE') into v_final
    from public.clientes c
   where public.rrpp_norm(c.username) = 'INVITAFRATE'
     and c.rol in ('admin','rrpp')
   limit 1;
  v_final := coalesce(v_final, 'txt:INVITAFRATE');

  insert into public.rrpp_alias (clave_origen, clave_final, nombre_final, unido_por)
  select distinct p.clave, v_final, '@invitafrate', 'clasificación automática'
    from public.v_rrpp_personas p
   where p.clave is not null
     and p.clave <> v_final
     and public.rrpp_norm(p.rrpp_nombre) in
         ('FRATE','FRATE CAJA','CAJA','LA CAJA','FRATE LA CAJA',
          'INVITAFRATE','FRATE INVITAFRATE','INVITA FRATE')
  on conflict (clave_origen) do update
     set clave_final = excluded.clave_final,
         nombre_final = excluded.nombre_final,
         unido_por = excluded.unido_por, unido_at = now();
  get diagnostics v_n = row_count;

  -- Igual que rrpp_unir: aplana la cadena y saca a la principal de la lista.
  update public.rrpp_alias set clave_final = v_final
   where clave_final in (select clave_origen from public.rrpp_alias where clave_final = v_final);
  delete from public.rrpp_alias where clave_origen = v_final;

  -- La casa no cobra, y queda en su grupo.
  insert into public.rrpp_pago (clave, nombre, paga, tarifa, grupo, nota)
  values (v_final, '@invitafrate', false, null, 'casa', 'la caja del local')
  on conflict (clave) do update
     set grupo = 'casa', paga = false, nombre = '@invitafrate';

  raise notice 'unidas % identidades bajo %', v_n, v_final;
end $$;

-- Qué quedó: la casa unida, y lo que NO uní para que lo revises.
select 'unido bajo @invitafrate' as que, a.clave_origen, a.nombre_final
  from public.rrpp_alias a
 where a.unido_por = 'clasificación automática'
union all
select 'quedó aparte · míralo', p.clave, max(p.rrpp_nombre)
  from public.v_rrpp_personas p
 where public.rrpp_norm(p.rrpp_nombre) like '%FRATE%'
    or public.rrpp_norm(p.rrpp_nombre) like '%CAJA%'
    or p.clave = 'sin-duenio'
 group by p.clave
 order by 1, 3;
