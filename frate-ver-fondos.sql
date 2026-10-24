-- 🖼️ ¿Alguna lista tiene fondo guardado, y qué hay en la config global?
-- Solo LEE. Esto dice si el problema es "no se guardó" o "no se pinta".

-- ① Listas con fondo propio (lo que escribe el modal 🖼️ o el de crear)
select l.id, l.codigo, l.nombre,
       l.condiciones->'portada'->>'modo'  as modo,
       coalesce(l.condiciones->'portada'->>'url',
                l.condiciones->'portada'->>'yt',
                l.condiciones->'portada'->>'color')  as fondo,
       l.condiciones->'portada'->>'velo'  as oscurecer,
       l.condiciones->'portada'->>'pos'   as encuadre
  from public.listas l
 where l.eliminada_at is null
   and l.condiciones ? 'portada'
 order by l.id desc
 limit 20;

-- ② El fondo por defecto del local (Configuración → link)
select clave, valor
  from public.config_valores
 where clave like 'link_%'
 order by clave;

-- ③ Resumen en una línea
select (select count(*) from public.listas
         where eliminada_at is null and condiciones ? 'portada')      as listas_con_fondo,
       (select count(*) from public.config_valores
         where clave = 'link_portada_url' and coalesce(valor,'') <> '') as hay_fondo_global;
