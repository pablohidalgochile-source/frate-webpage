-- ============================================================
-- FRATE · el RÓTULO de las 32 entradas de Halloween
--
-- POR QUÉ: FRATE FLYER emite `rotulo` en el brief (GENERAL / PUERTA / VIP),
-- pero `api-evento-ingest` todavía no lo copia — no está en su whitelist, así
-- que el campo se cae en silencio al importar. Se agrega el lunes; esto lo
-- pone mientras tanto.
--
-- POR QUÉ IMPORTA Y NO ES COSMÉTICO: sin el campo, `rotuloDe()`
-- (frate-afiche.js:68) lo deduce del nombre — y los nombres nuevos le sacaron
-- la palabra GENERAL, así que la deducción falla:
--     PREV 1 MUJER + COVER HALLOWEEN  →  ''      las 24 preventas sin rótulo
--     MESA VIP + COVER HALLOWEEN      →  'PRO'   por el /VIP/ del regex
--
-- SEGURO DESPUÉS DE PUBLICAR: el blindaje del ingest bloquea un reimport, no
-- un UPDATE a una columna. Esto se puede correr con la venta ya abierta.
--
-- Empata por `ticket_uid` y no por nombre, a propósito: si alguien renombra
-- después, por uid sigue funcionando; por nombre no tocaría nada y no avisaría.
-- ============================================================

begin;

update public.tipos_ticket t
   set rotulo = v.rotulo
  from (values
    ('TK-FCC-2026-10-29-prev-mujer','GENERAL'),
    ('TK-FCC-2026-10-29-prev-mujer-cover','GENERAL'),
    ('TK-FCC-2026-10-29-prev-universitario','GENERAL'),
    ('TK-FCC-2026-10-29-prev-universitario-cover','GENERAL'),
    ('TK-FCC-2026-10-29-prev-hombre','GENERAL'),
    ('TK-FCC-2026-10-29-prev-hombre-cover','GENERAL'),
    ('TK-FCC-2026-10-30-prev-mujer','GENERAL'),
    ('TK-FCC-2026-10-30-prev-mujer-cover','GENERAL'),
    ('TK-FCC-2026-10-30-prev-universitario','GENERAL'),
    ('TK-FCC-2026-10-30-prev-universitario-cover','GENERAL'),
    ('TK-FCC-2026-10-30-prev-hombre','GENERAL'),
    ('TK-FCC-2026-10-30-prev-hombre-cover','GENERAL'),
    ('TK-FCC-2026-10-31-prev-1-mujer','GENERAL'),
    ('TK-FCC-2026-10-31-prev-1-universitario','GENERAL'),
    ('TK-FCC-2026-10-31-prev-1-hombre','GENERAL'),
    ('TK-FCC-2026-10-31-prev-2-mujer','GENERAL'),
    ('TK-FCC-2026-10-31-prev-2-universitario','GENERAL'),
    ('TK-FCC-2026-10-31-prev-2-hombre','GENERAL'),
    ('TK-FCC-2026-10-31-prev-3-mujer','GENERAL'),
    ('TK-FCC-2026-10-31-prev-3-universitario','GENERAL'),
    ('TK-FCC-2026-10-31-prev-3-hombre','GENERAL'),
    ('TK-FCC-2026-10-31-prev-4-mujer','GENERAL'),
    ('TK-FCC-2026-10-31-prev-4-universitario','GENERAL'),
    ('TK-FCC-2026-10-31-prev-4-hombre','GENERAL'),
    ('TK-FCC-2026-10-29-puerta','PUERTA'),
    ('TK-FCC-2026-10-29-puerta-cover','PUERTA'),
    ('TK-FCC-2026-10-30-puerta','PUERTA'),
    ('TK-FCC-2026-10-30-puerta-cover','PUERTA'),
    ('TK-FCC-2026-10-31-puerta-mujer','PUERTA'),
    ('TK-FCC-2026-10-31-puerta-universitario','PUERTA'),
    ('TK-FCC-2026-10-31-puerta-hombre','PUERTA'),
    ('TK-FCC-2026-10-31-mesa-muestra','VIP')
  ) as v(uid, rotulo)
 where t.ticket_uid = v.uid;

commit;

-- Control: tienen que salir 24 GENERAL, 7 PUERTA y 1 VIP, y cero vacíos.
select coalesce(nullif(t.rotulo,''),'(vacío)') as rotulo, count(*) as n
  from public.tipos_ticket t
  join public.eventos e on e.id = t.evento_id
 where e.fecha between date '2026-10-29' and date '2026-10-31'
 group by 1
 order by 2 desc;
