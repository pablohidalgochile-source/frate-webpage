-- 🖼️ EL LOGO OFICIAL EN LOS CORREOS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- POR QUÉ SALÍAN LAS LETRAS:
--   Los dos correos —bienvenida y tickets— ya sabían usar un logo, pero
--   la llave `mail_logo_url` nunca se llenó. Sin valor, los dos caen al
--   respaldo, que es la palabra FRATE escrita con letras.
--
--   O sea no era que faltara programar: faltaba el dato.
--
-- UNA SOLA LLAVE PARA LOS DOS CORREOS. Si mañana cambias el logo, lo
-- cambias acá y cambia en todos lados.
--
-- ⚠️ La imagen es una versión LIVIANA (35 KB en vez de 451 KB) y del
--    tamaño en que se muestra. Gmail recorta los correos pesados, así que
--    no conviene mandar el archivo original.
--
-- ⚠️ NO uses el SVG: Gmail y Outlook no lo muestran. Tiene que ser PNG.

insert into public.config_valores (clave, valor)
select 'mail_logo_url', 'https://www.frate.cl/assets/logo-mail.png'
where not exists (select 1 from public.config_valores where clave = 'mail_logo_url');

update public.config_valores
   set valor = 'https://www.frate.cl/assets/logo-mail.png'
 where clave = 'mail_logo_url'
   and coalesce(btrim(valor), '') <> 'https://www.frate.cl/assets/logo-mail.png';


-- ── Chequeo ────────────────────────────────────────────────────────
select clave, valor,
       case when clave = 'mail_logo_url' and valor like 'https://%.png'
            then '✅ los correos van a mostrar el logo'
            else '⚠️ revisar' end as estado
from public.config_valores
where clave in ('mail_logo_url', 'mail_color')
order by clave;
