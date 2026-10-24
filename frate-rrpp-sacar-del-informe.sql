-- 🚪 SACAR DEL INFORME A QUIEN NO ES DEL EQUIPO · parte 1 de 2
--
-- Antonia, Constanza, Danna, Nayaret y Thais aparecían en «Equipo · no cobran»
-- porque el informe lee el campo «dueño» de TODAS las listas, y ese campo es
-- texto libre. Mi sql de grupos las metió en equipo por descarte.
-- Verificado: ninguna tiene cuenta, no entran a ninguna parte.
--
-- NO se borran las filas: si se borran, la próxima carga las vuelve a meter
-- como «por clasificar», porque el informe las regenera desde las listas.
-- Se marcan como `fuera`, que la pantalla ya no muestra.

alter table public.rrpp_pago drop constraint if exists rrpp_pago_grupo_check;
alter table public.rrpp_pago
  add constraint rrpp_pago_grupo_check
  check (grupo in ('rrpp','equipo','casa','fuera'));

update public.rrpp_pago
   set grupo = 'fuera',
       paga  = false,
       nota  = 'no es del equipo · invitada de una lista'
 where clave in (
   select g.clave from public.rrpp_pago g
   left join public.clientes c
     on public.rrpp_norm(c.username) = public.rrpp_norm(g.nombre)
     or public.rrpp_norm(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')) = public.rrpp_norm(g.nombre)
   where g.grupo = 'equipo'
     and c.id is null                    -- sin cuenta = no es del equipo
 );

-- Cómo quedó
select g.grupo,
       count(*) as personas,
       string_agg(g.nombre, ' · ' order by g.nombre) as quienes
  from public.rrpp_pago g
 group by g.grupo
 order by case g.grupo when 'rrpp' then 1 when 'equipo' then 2
                       when 'casa' then 3 else 4 end;
