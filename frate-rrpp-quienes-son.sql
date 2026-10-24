-- 🔎 ¿Quiénes son y a qué tienen acceso? Solo LEE, no cambia nada.
--
-- Aparecer en el informe NO da acceso a nada: el informe se arma leyendo el
-- campo «dueño» de cada lista, y ese campo es TEXTO LIBRE. El acceso real lo
-- da `clientes.rol`. Esto separa las dos cosas.

select
  g.nombre                                        as sale_en_el_informe,
  g.grupo,
  -- ¿Existe una cuenta con ese nombre o ese usuario?
  c.email,
  c.rol,
  case
    when c.id is null              then '✅ NO tiene cuenta · no entra a ninguna parte'
    when c.rol = 'admin'           then '⚠️ ADMIN · entra al panel completo'
    when c.rol = 'rrpp'            then '⚠️ RRPP · entra a frate.cl/rrpp'
    when c.rol = 'portero'         then '⚠️ PORTERO · entra al validador'
    else '✅ cuenta de cliente · solo su entrada, nada del panel'
  end                                             as acceso_real,
  -- ¿Por qué salió en el informe?
  (select count(*) from public.listas l
    where l.eliminada_at is null
      and public.rrpp_norm(l.duenio_nombre) = public.rrpp_norm(g.nombre))  as listas_a_su_nombre,
  (select string_agg(distinct l.tipo, ', ') from public.listas l
    where l.eliminada_at is null
      and public.rrpp_norm(l.duenio_nombre) = public.rrpp_norm(g.nombre))  as que_tipo_de_listas,
  (select max(l.fecha::text) from public.listas l
    where l.eliminada_at is null
      and public.rrpp_norm(l.duenio_nombre) = public.rrpp_norm(g.nombre))  as ultima
from public.rrpp_pago g
left join public.clientes c
  on public.rrpp_norm(c.username) = public.rrpp_norm(g.nombre)
  or public.rrpp_norm(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')) = public.rrpp_norm(g.nombre)
where g.grupo = 'equipo'
order by (c.rol is not null) desc, g.nombre;
