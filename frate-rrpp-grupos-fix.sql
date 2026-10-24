-- 🔧 ARREGLO · @thiscotty quedó sin cobrar
--
-- Error mío en frate-rrpp-grupos-1.sql: `rrpp_norm()` devuelve el texto en
-- MAYÚSCULAS y yo lo comparé contra '%thiscotty%' en minúsculas, así que
-- `like` nunca calzó. La única RRPP que cobra quedó en «Equipo · no cobran».
-- Nadie perdió plata: el informe mostraba $0 donde debía mostrar su pago.
--
-- Esto NO toca a nadie más: solo mueve a thiscotty a su grupo y le pone
-- la tarifa. Lo que hayas editado a mano con ⚙️ pago queda igual.

update public.rrpp_pago
   set grupo  = 'rrpp',
       paga   = true,
       tarifa = coalesce(tarifa, 500),
       nota   = 'corregido: rrpp_norm devuelve mayúsculas'
 where nombre ilike '%thiscotty%'
    or public.rrpp_norm(nombre) = 'THISCOTTY';

-- Cómo quedó
select g.grupo,
       count(*)                                          as personas,
       count(*) filter (where g.paga)                    as cobran,
       coalesce(sum(g.tarifa) filter (where g.paga), 0)  as tarifa,
       string_agg(g.nombre, ' · ' order by g.nombre)     as quienes
  from public.rrpp_pago g
 group by g.grupo
 order by case g.grupo when 'rrpp' then 1 when 'equipo' then 2 else 3 end;
