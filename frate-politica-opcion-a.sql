-- 📋 POLÍTICA · OPCIÓN A + comisión de MercadoPago real
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- ⚠️ POR QUÉ SE CAMBIA EL TEXTO: la política decía «se descuenta un 8%», pero
--    lo que el cliente pierde de verdad es más. Caso real (FCC-005822):
--      pagó $29.160 · se le devolvió $24.840 · quedaron $4.320 = 14,8%
--    Son DOS cosas sumadas: la retención del 8% sobre el subtotal ($2.160) y
--    el cargo por servicio que pagó al comprar ($2.160), que no se reintegra.
--    Pablo eligió la opción A: se mantiene el cobro y se dice claro.

update public.config_valores
   set valor = replace(valor,
     '• Devolución de dinero: se descuenta un {RETENCION}% por costos de gestión y
  procesamiento.',
     '• Devolución de dinero: se descuenta un {RETENCION}% por costos de gestión y
  procesamiento, y NO se reintegra el cargo por servicio que se cobró en la
  compra original. Antes de enviar la solicitud te mostramos el monto exacto
  que recibirías.')
 where clave = 'devoluciones_politica';


-- ── La comisión REAL de MercadoPago ────────────────────────────────
-- Estaba escrita a mano en el código como 3,5%. La real de tu cuenta es
-- 3,08%: en FCC-005822 cobró $898 sobre $29.160 y reintegró $765 sobre
-- $24.840. Sobreestimaba unos $104 por devolución.
-- ⬇️ CAMBIA ESTE NÚMERO cuando tengas las comisiones oficiales.
insert into public.config_valores(clave, valor)
select 'comision_mp_pct', '3.08'
where not exists (select 1 from public.config_valores where clave='comision_mp_pct');

update public.config_valores set valor = '3.08' where clave = 'comision_mp_pct';


-- ── Chequeo ────────────────────────────────────────────────────────
select clave, valor,
       case clave
         when 'comision_mp_pct'          then 'lo que te cobra MercadoPago por venta'
         when 'devolucion_retencion_pct' then 'lo que retienes al devolver'
         when 'comision_pct'             then 'el cargo por servicio que le cobras al cliente'
       end as que_es
from public.config_valores
where clave in ('comision_mp_pct','devolucion_retencion_pct','comision_pct')
order by clave;

select case when valor like '%NO se reintegra el cargo por servicio%'
            then '✅ la política ya lo dice'
            else '⚠️ el texto no cambió — revisa que calce exacto' end as estado
from public.config_valores where clave = 'devoluciones_politica';
