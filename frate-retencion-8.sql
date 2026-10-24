-- 💸 RETENCIÓN DE DEVOLUCIÓN AL 8% · desde hoy
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- La regla que puso Pablo (2026-08-10):
--   · Por defecto SIEMPRE se devuelve parcial, reteniendo el cargo por servicio.
--   · El 100% existe, pero es la EXCEPCIÓN y hay que pedirla a mano.
--   · Las 11 solicitudes de esta semana se respetan al 4%, porque eso decía
--     la página cuando las pidieron. Esas se bajan a mano en el modal.
--
-- La clave ya existía (`devolucion_retencion_pct`) pero venía en 10.

insert into public.config_valores(clave, valor)
select 'devolucion_retencion_pct', '8'
where not exists (select 1 from public.config_valores
                   where clave = 'devolucion_retencion_pct');

update public.config_valores
   set valor = '8'
 where clave = 'devolucion_retencion_pct';


-- ── El texto que ve el cliente usa {RETENCION} ────────────────────
-- Se reemplaza solo con el número de arriba, así que no hay que tocarlo.
-- Este chequeo es para confirmar que el marcador está puesto.
select clave,
       case when valor like '%{RETENCION}%'
            then '✅ usa el marcador — se actualiza solo'
            else '⚠️ tiene el % escrito a mano — hay que corregirlo' end as estado
from public.config_valores
where clave in ('devoluciones_politica','politica_devoluciones');


-- ── Cómo quedó ────────────────────────────────────────────────────
select clave, valor from public.config_valores
where clave in ('devolucion_retencion_pct', 'comision_pct')
order by clave;
