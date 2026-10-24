-- 👨 EL TIPO QUE FALTABA · HOMBRE NO UNIVERSITARIO
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- Hoy TODOS los tipos de hombre dicen «UNIVERSITARIO». Un hombre que no
-- estudia no tiene entrada que comprar, y por eso el cobro de diferencia
-- no tenía hacia dónde subirlo.
--
-- ⚠️ LOS PRECIOS DE ABAJO SON REFERENCIA. Los puse siguiendo tu escalera
--    (+2.000 sobre el universitario). Cámbialos en Configuración → Tipos
--    de Ticket, o directamente acá antes de correr. El precio real lo
--    pones por evento, como siempre.

-- ── 1) Los dos tipos nuevos, copiando TODO lo demás del universitario ──
-- Se copia la fila entera (max_por_compra, transferible, zona, horarios…)
-- para no inventar valores que después no calcen con el resto.
insert into public.catalogo_tickets (
  nombre, descripcion, precio, max_por_compra, activo, orden,
  hora_max_ingreso, instrucciones, zona, transferible, cierre_venta,
  genero, zona_id, clase, clase_confirmada)
select
  replace(c.nombre, 'HOMBRE UNIVERSITARIO', 'HOMBRE GENERAL'),
  replace(coalesce(c.descripcion, c.nombre), 'HOMBRE UNIVERSITARIO', 'HOMBRE GENERAL'),
  case when c.nombre like '%PRO%' then 14000 else 12000 end,   -- ← REFERENCIA
  c.max_por_compra, c.activo, c.orden,
  c.hora_max_ingreso, c.instrucciones, c.zona, c.transferible, c.cierre_venta,
  'M',                    -- hombre, SIN requisito de credencial
  c.zona_id, 'venta', true
from public.catalogo_tickets c
where c.nombre in ('Pre-Venta GRAL. HOMBRE UNIVERSITARIO',
                   'Pre-Venta PRO HOMBRE UNIVERSITARIO')
  and not exists (
    select 1 from public.catalogo_tickets x
    where x.nombre = replace(c.nombre, 'HOMBRE UNIVERSITARIO', 'HOMBRE GENERAL'));


-- ── 2) Rellenar el género del catálogo, que estaba TODO en null ────
-- Por eso cada evento nuevo nacía sin condición y había que ponerla a
-- mano (o se olvidaba). Ahora se hereda.
update public.catalogo_tickets set genero = 'F'
 where genero is null and upper(nombre) like '%MUJER%';

update public.catalogo_tickets set genero = 'U'
 where genero is null and upper(nombre) like '%HOMBRE UNIVERSITARIO%';

update public.catalogo_tickets set genero = 'M'
 where genero is null and upper(nombre) like '%HOMBRE GENERAL%';


-- ── 3) Cómo quedó ──────────────────────────────────────────────────
select id, nombre, precio, genero,
       case genero when 'F' then '👩 mujer'
                   when 'M' then '👨 hombre (sin credencial)'
                   when 'U' then '🎓 hombre universitario'
                   else '👥 sin condición' end as para_quien,
       clase
from public.catalogo_tickets
where coalesce(precio,0) > 0
order by genero nulls last, precio;


-- ═══════════════════════════════════════════════════════════════════
-- ── 4) OPCIONAL · agregarlo al evento de ESTA NOCHE ────────────────
-- Descomenta este bloque SOLO si quieres venderlo hoy mismo. Copia el
-- precio del catálogo; ajústalo después en Tipos de Ticket si el de hoy
-- es distinto.
-- ═══════════════════════════════════════════════════════════════════
-- insert into public.tipos_ticket (evento_id, catalogo_id, nombre, descripcion, precio,
--        genero, clase, disponible, estado, orden, max_por_compra, hora_max_ingreso, instrucciones)
-- select e.id, c.id, c.nombre, c.descripcion, c.precio,
--        c.genero, 'venta', 999999, 'Activo', 90, c.max_por_compra,
--        c.hora_max_ingreso, c.instrucciones
--   -- `disponible` es STOCK, no un sí/no. 999999 = sin tope, como los demás.
--   -- `estado` va con mayúscula: 'Activo' u 'Oculto'.
-- from public.eventos e
-- cross join public.catalogo_tickets c
-- where e.archivado = false
--   and e.fecha = current_date
--   and c.nombre like '%HOMBRE GENERAL%'
--   and not exists (select 1 from public.tipos_ticket t
--                    where t.evento_id = e.id and t.nombre = c.nombre);
