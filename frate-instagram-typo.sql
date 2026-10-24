-- 📸 ARREGLAR EL LINK DE INSTAGRAM DE /links
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- El botón de Instagram del linktree apunta a
--     instagram.com/frateridadcampuscentral      ← le falta la N
-- cuando la cuenta real es
--     instagram.com/fraternidadcampuscentral
--
-- El typo NO está en el código: links.html arma la URL con el valor de
-- `config_valores.links_instagram`, así que se arregla en la base.
-- (En Configuración también lo puedes editar a mano; esto es lo mismo
--  pero sin buscar la pantalla.)


-- ── 1) Ver cómo está ──────────────────────────────────────────────
select clave, valor as ahora,
       'https://instagram.com/' || ltrim(valor,'@') as link_que_arma
from public.config_valores
where clave in ('links_instagram','instagram');


-- ── 2) Corregirlo ─────────────────────────────────────────────────
-- Solo toca el que está mal escrito. Si ya está bueno, no hace nada.
update public.config_valores
   set valor = 'fraternidadcampuscentral'
 where clave = 'links_instagram'
   and ltrim(coalesce(valor,''),'@') <> 'fraternidadcampuscentral';

-- Por si el linktree nunca tuvo el valor puesto.
insert into public.config_valores(clave, valor)
select 'links_instagram', 'fraternidadcampuscentral'
where not exists (select 1 from public.config_valores where clave = 'links_instagram');


-- ── 3) Chequeo ────────────────────────────────────────────────────
select 'https://instagram.com/' || ltrim(valor,'@') as link_final,
       case when ltrim(valor,'@') = 'fraternidadcampuscentral'
            then '✅ correcto' else '❌ sigue mal' end as estado
from public.config_valores
where clave = 'links_instagram';
