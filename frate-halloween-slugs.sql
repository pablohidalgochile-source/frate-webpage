-- ============================================================
-- FRATE · arreglar los slugs de las tres noches de Halloween
--
-- Los slugs quedaron con el nombre viejo —el que llevaba el paréntesis de
-- temporada— y el del viernes además trae DOS nombres pegados:
--
--   id 59  carne-fresca-sensual-y-estupido-halloween-jueves
--   id 60  beso-o-travesura-carne-fresca-sensual-y-estupido-halloween-viernes   ← pegado
--   id 61  promedio-rojo                                                        ← ya estaba bien
--
-- El del viernes NO lo causó el renombre de hoy: ya venía así de un import
-- anterior, y el nombre largo lo disimulaba.
--
-- Los tres funcionan igual (la página busca por slug y lo encuentra), pero
-- son la URL que se comparte por WhatsApp e Instagram.
--
-- ⚠️ OJO: esto CAMBIA la URL pública. Un link viejo ya compartido deja de
--    funcionar. Se publicaron hace pocas horas y van 4 entradas vendidas,
--    así que el riesgo es mínimo — pero conviene saberlo antes de correrlo.
-- ============================================================

begin;

update public.eventos set slug = 'carne-fresca'     where id = 59;
update public.eventos set slug = 'beso-o-travesura' where id = 60;
update public.eventos set slug = 'promedio-rojo'    where id = 61;

commit;

-- Control: los tres cortos y sin repetirse con ningún otro evento.
select id, nombre, slug,
       (select count(*) from public.eventos e2 where e2.slug = e.slug) as veces
  from public.eventos e
 where id in (59,60,61)
 order by id;
