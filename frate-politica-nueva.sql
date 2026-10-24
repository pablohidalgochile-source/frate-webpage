-- 📋 POLÍTICA DE CAMBIOS Y DEVOLUCIONES · versión de Pablo, afinada
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- QUÉ SE LE AGREGÓ A TU TEXTO:
--  · {RETENCION} y {DIAS} en vez de «8%» y «5 días» escritos a mano, para que
--    cuando cambies el número en Configuración el texto se actualice solo.
--  · Los motivos que el portero SÍ marca hoy en la puerta (ebriedad, menor de
--    edad, carnet que no coincide, veto). Estaban en el sistema pero no en la
--    política, y son justamente los que más se discuten.
--  · Que la devolución llega a QUIEN PAGÓ. Es lo que más nos preguntan por
--    Instagram y no estaba dicho en ninguna parte.
--  · Que hay que tener cuenta para gestionar por la web.

update public.config_valores
   set valor = 'POLÍTICA DE CAMBIOS Y DEVOLUCIONES FRATE
Queremos que sea simple y justo para todos.

CUÁNDO PUEDES PEDIRLA
• Solo si tu entrada NO ha sido usada.
• Hasta antes de que comience el evento.
• Necesitas tu cuenta FRATE: entra a frate.cl/mi-entrada. Si te compró otra
  persona, créala con tu RUT y encontramos tu entrada igual.

QUÉ PUEDES ELEGIR
• Cambio de fecha o evento: sin retención, sujeto a disponibilidad.
• Crédito FRATE: recibes el 100% del valor para usar en otro evento.
• Devolución de dinero: se descuenta un {RETENCION}% por costos de gestión y
  procesamiento.

A QUIÉN LLEGA EL DINERO
• La devolución vuelve SIEMPRE a quien pagó, por el mismo medio de pago. Si tu
  entrada la compró otra persona, el dinero le llega a ella. Les avisamos a
  ambos por correo.

CUÁNDO NO CORRESPONDE
• Si tu entrada ya fue utilizada o registra ingreso.
• Una vez iniciado el evento, por cambio de planes, imposibilidad de asistir u
  otros motivos personales.
• Si no asististe y el evento se realizó normalmente.
• Si no se te permitió el ingreso por estado de ebriedad, por ser menor de
  edad, porque el carnet no coincidía con la entrada, o por encontrarte
  vetado. En esos casos el ingreso se rechaza por causa ajena a FRATE.

CUÁNDO SÍ, SIEMPRE
• Si FRATE cancela el evento: devolución del 100%, sin retención.
• Si hubo cobro duplicado o error de pago comprobable: revisamos y devolvemos
  el monto que corresponda.
• Si el evento cambia de fecha o hay un cambio importante, te informamos las
  opciones disponibles, incluida la devolución cuando corresponda.

PLAZOS
• Las devoluciones aprobadas se procesan dentro de {DIAS} días hábiles. El
  banco o medio de pago puede demorar algunos días adicionales en reflejarlo.

• Cada solicitud la revisa una persona del equipo: no es automática. Podemos
  pedirte información para comprobar la compra, verificar que la entrada no
  haya sido utilizada y prevenir fraudes.

Esta política no limita los derechos que tienes como consumidor según la
legislación chilena.
Al comprar tu entrada declaras haber leído y aceptado esta política.'
 where clave = 'devoluciones_politica';


-- ── Chequeo ────────────────────────────────────────────────────────
select case when valor like '%{RETENCION}%' and valor like '%{DIAS}%'
            then '✅ los dos marcadores puestos — se actualizan solos'
            else '⚠️ falta algún marcador' end                as estado,
       length(valor)                                          as largo,
       (select valor from public.config_valores where clave='devolucion_retencion_pct') as retencion_hoy,
       (select valor from public.config_valores where clave='devolucion_dias_habiles')  as dias_hoy
from public.config_valores where clave = 'devoluciones_politica';
