-- 📚 UNA SOLA BIBLIOTECA · PARTE 2 de 2 — traer las 5 plantillas
-- Corre después de la parte 1.
--
-- Las 5 de `plantillas_comunidad` pasan al catálogo como cortesías.
-- Idempotente: si ya está migrada (mismo origen_plantilla_id), la actualiza
-- en vez de duplicarla. Puedes correrlo dos veces sin miedo.
--
-- ⚠️ NO se borra `plantillas_comunidad`. Queda como estaba hasta que
--    confirmes que todo se ve bien en el admin.

insert into public.catalogo_tickets (
  nombre, descripcion, precio, clase, clase_confirmada, activo, orden,
  genero, hora_max_ingreso, instrucciones, rotulo, zona, transferible,
  cupos, max_acompanantes, permite_extranjero, chequear_edad, duenio,
  es_default, origen_plantilla_id, max_por_compra)
select
  p.nombre,
  coalesce(nullif(btrim(p.texto_condiciones),''), p.nombre),
  0,                                    -- cortesía: gratis
  'cortesia', true, coalesce(p.activo, true), coalesce(p.orden, 50),
  nullif(btrim(coalesce(p.genero,'')),''),
  p.hora_max,                           -- allá se llamaba hora_max
  p.texto_condiciones,                  -- allá era texto_condiciones
  nullif(btrim(coalesce(p.titulo_entrada,'')),''),   -- allá era titulo_entrada
  p.zona,
  coalesce(p.transferible, false),
  p.cupos, coalesce(p.max_acompanantes,0),
  coalesce(p.permite_extranjero, true), coalesce(p.chequear_edad, true),
  p.duenio, coalesce(p.es_default,false), p.id, 1
from public.plantillas_comunidad p
where not exists (select 1 from public.catalogo_tickets c
                   where c.origen_plantilla_id = p.id)
  -- Si ya existe una con el MISMO nombre, no se duplica: se actualiza abajo.
  and not exists (select 1 from public.catalogo_tickets c2
                   where upper(btrim(c2.nombre)) = upper(btrim(p.nombre)));


-- ── Las que ya existían con el mismo nombre: se completan ─────────
-- Ej: si el catálogo ya tenía «Lista Cumpleaños», no se duplica —
-- se le rellenan los campos de lista que le faltaban.
update public.catalogo_tickets c
   set cupos               = coalesce(c.cupos, p.cupos),
       max_acompanantes    = coalesce(nullif(c.max_acompanantes,0), p.max_acompanantes, 0),
       permite_extranjero  = coalesce(c.permite_extranjero, p.permite_extranjero, true),
       chequear_edad       = coalesce(c.chequear_edad, p.chequear_edad, true),
       duenio              = coalesce(c.duenio, p.duenio),
       genero              = coalesce(c.genero, nullif(btrim(coalesce(p.genero,'')),'')),
       hora_max_ingreso    = coalesce(c.hora_max_ingreso, p.hora_max),
       instrucciones       = coalesce(nullif(btrim(coalesce(c.instrucciones,'')),''), p.texto_condiciones),
       rotulo              = coalesce(c.rotulo, nullif(btrim(coalesce(p.titulo_entrada,'')),'')),
       origen_plantilla_id = coalesce(c.origen_plantilla_id, p.id)
  from public.plantillas_comunidad p
 where upper(btrim(c.nombre)) = upper(btrim(p.nombre))
   and c.origen_plantilla_id is null;


-- ── Chequeo · la biblioteca completa ──────────────────────────────
select id, nombre,
       case clase when 'venta' then '💰 se vende'
                  when 'cortesia' then '🎁 lista/cortesía'
                  when 'puerta' then '🚪 puerta'
                  else coalesce(clase,'—') end            as tipo,
       precio, genero, hora_max_ingreso as hasta,
       cupos, max_acompanantes as acomp,
       case when origen_plantilla_id is not null then '📚 vino de plantillas' else '' end as origen
from public.catalogo_tickets
where coalesce(activo, true)
order by clase, orden, nombre;


-- ── ¿Quedó alguna sin migrar? ─────────────────────────────────────
select p.id, p.nombre, '⚠️ NO migró — revisar' as aviso
from public.plantillas_comunidad p
where not exists (select 1 from public.catalogo_tickets c
                   where c.origen_plantilla_id = p.id
                      or upper(btrim(c.nombre)) = upper(btrim(p.nombre)));
