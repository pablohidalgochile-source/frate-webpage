-- 🌐 ENCENDER LAS GESTIONES POR LA WEB
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- Desde ahora el interruptor `devoluciones_activo` manda sobre
-- **frate.cl/mi-entrada**, que es la única página que queda.
-- `frate.cl/devolución` pasó a ser un redirect hacia ella.
--
-- Apagado: la página carga pero dice «estamos ajustando esto, escríbenos
-- por Instagram» y no deja pedir nada. Se revalida también al enviar, por
-- si lo apagas con gente con la pestaña abierta.

update public.config_valores set valor = 'true'
 where clave = 'devoluciones_activo';

insert into public.config_valores(clave, valor)
select 'devoluciones_activo', 'true'
where not exists (select 1 from public.config_valores where clave='devoluciones_activo');


-- ── Chequeo ────────────────────────────────────────────────────────
select clave, valor,
       case clave
         when 'devoluciones_activo'      then 'true = la web acepta gestiones'
         when 'devolucion_retencion_pct' then 'lo que se retiene al devolver'
         when 'devolucion_dias_habiles'  then 'plazo que se le promete al cliente'
       end as que_es
from public.config_valores
where clave in ('devoluciones_activo','devolucion_retencion_pct','devolucion_dias_habiles')
order by clave;


-- ── Y que la política use el marcador, no el número a mano ────────
select case when valor like '%{RETENCION}%'
            then '✅ usa {RETENCION} — el % se actualiza solo'
            else '⚠️ REVISAR: tiene el porcentaje escrito a mano' end as estado_politica,
       left(valor, 120) || '…' as inicio_del_texto
from public.config_valores
where clave = 'devoluciones_politica';
