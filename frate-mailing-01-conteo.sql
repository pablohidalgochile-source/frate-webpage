-- FRATE · MAILING · ¿a cuántos miembros les llegaría? (SOLO LECTURA, no cambia nada)
-- Proyecto WEB · SQL Editor · correr completo y copiar el resultado (1 fila)
with b as (
  select c.id, lower(btrim(coalesce(c.email, ''))) as email, coalesce(c.rol, 'usuario') as rol, c.sexo,
         public.rut_limpio(c.rut) as rutn
    from public.clientes c
), m as (
  select b.*,
         b.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' as email_malo,
         b.rol not in ('usuario', 'cliente') as staff,
         exists (select 1 from public.email_rebotes r where lower(btrim(r.email)) = b.email) as reboto,
         exists (select 1 from public.baneados x where coalesce(x.activo, true) and b.rutn <> ''
                  and public.rut_limpio(x.rut) = b.rutn) as baneado,
         exists (select 1 from public.reservas_miembros rm where rm.cliente_id = b.id and rm.liberada_at is null) as ya_reservo
    from b
), ok as (
  select * from m where not email_malo and not staff and not reboto and not baneado
)
select jsonb_build_object(
  'cuentas_con_ficha',        (select count(*) from m),
  'fuera_correo_malo',        (select count(*) from m where email_malo),
  'fuera_staff',              (select count(*) from m where staff),
  'fuera_rebotaron',          (select count(*) from m where reboto),
  'fuera_baneados',           (select count(*) from m where baneado),
  'DESTINATARIOS',            (select count(distinct email) from ok),
  'de_ellos_sin_sexo',        (select count(distinct email) from ok where sexo is null),
  'de_ellos_ya_reservaron',   (select count(distinct email) from ok where ya_reservo),
  'cuentas_sin_ficha_con_correo', (select count(*) from auth.users u
                                    where coalesce(u.email, '') <> ''
                                      and not exists (select 1 from public.clientes c where c.id = u.id))
) as conteo;
