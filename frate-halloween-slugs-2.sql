-- ============================================================
-- FRATE · slugs con la temporada y el día
--
-- El NOMBRE queda corto —«CARNE FRESCA»— porque es lo que se lee en la
-- tarjeta y en el ticket. La URL, en cambio, se comparte suelta por WhatsApp
-- e Instagram, donde nadie ve la tarjeta: ahí conviene que la dirección
-- diga sola de qué se trata.
--
--   frate.cl/e/carne-fresca-halloween-jueves
--   frate.cl/e/beso-o-travesura-halloween-viernes
--   frate.cl/e/promedio-rojo-halloween-sabado
--
-- ⚠️ Cambia la URL pública otra vez. Las cortas estuvieron vivas unos
--    minutos, así que casi con seguridad nadie alcanzó a compartirlas.
-- ============================================================

begin;

update public.eventos set slug = 'carne-fresca-halloween-jueves'      where id = 59;
update public.eventos set slug = 'beso-o-travesura-halloween-viernes' where id = 60;
update public.eventos set slug = 'promedio-rojo-halloween-sabado'     where id = 61;

commit;

-- Control: los tres, y que ninguno se repita con otro evento.
select id, nombre, slug,
       (select count(*) from public.eventos e2 where e2.slug = e.slug) as veces
  from public.eventos e
 where id in (59,60,61)
 order by id;
