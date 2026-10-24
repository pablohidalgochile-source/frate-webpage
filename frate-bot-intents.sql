-- ============================================================
-- FRATE — Bot administrable: disparadores + comportamiento por respuesta
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh. Idempotente.
-- ============================================================
alter table public.respuestas add column if not exists disparadores   text;                       -- palabras clave separadas por coma
alter table public.respuestas add column if not exists bot_auto        boolean not null default false; -- el bot lo manda solo al detectar
alter table public.respuestas add column if not exists tras_responder  text not null default 'nada';   -- 'nada' (sigue el bot) | 'escalar' (pasa a humano)

-- Disparadores base (editables desde Admin → Chat). El bot responde estos SOLO, sin pasar a humano.
update public.respuestas set disparadores='cumple,cumpleaños,cumpleanos,cumplir años,celebrar,celebrar mi,mi cumple,torta,agenda de cumple', bot_auto=true, tras_responder='nada' where clave='cumple_bienvenida';
update public.respuestas set disparadores='despedida,soltera,soltero,solter,novia,novio,bachelorette,bachelor,chao solteria', bot_auto=true, tras_responder='nada' where clave='despedida';
update public.respuestas set disparadores='convenio,universidad,universitario,instituto,embajador,centro de alumnos,federacion,frat&friends,fratandfriends,planes universitarios', bot_auto=true, tras_responder='nada' where clave='convenio';
update public.respuestas set disparadores='comprar,entrada,entradas,ticket,tickets,preventa,cuanto cuesta,cuanto vale,valor,precio,cuanto sale,donde compro', bot_auto=true, tras_responder='nada' where clave='comprar_entrada';
update public.respuestas set disparadores='horario,a que hora,hasta que hora,que hora abren,que hora cierran,cierran,abren', bot_auto=true, tras_responder='nada' where clave='horario_disco';
update public.respuestas set disparadores='pasaporte,sin cedula,sin carnet,no tengo cedula,que documento,documento,reimpresion', bot_auto=true, tras_responder='nada' where clave='documento_sin_cedula';
update public.respuestas set disparadores='dresscode,vestimenta,como ir,que ropa,codigo de vestimenta', bot_auto=true, tras_responder='nada' where clave='dresscode';
update public.respuestas set disparadores='estacionamiento,parking,donde dejo el auto,estacionar', bot_auto=true, tras_responder='nada' where clave='estacionamiento';
update public.respuestas set disparadores='guardarropia,custodia,dejar mis cosas,mochila,bolso', bot_auto=true, tras_responder='nada' where clave='guardarropia';
update public.respuestas set disparadores='prohibido,puedo entrar con,puedo ingresar con,se puede ingresar,se puede entrar con', bot_auto=true, tras_responder='nada' where clave='prohibido';
update public.respuestas set disparadores='acreditar,credencial,tne,soy estudiante,como demuestro,soy universitari', bot_auto=true, tras_responder='nada' where clave='acreditar_universitario';
update public.respuestas set disparadores='trabajar,cv,curriculum,influencer,pauta,colaborar', bot_auto=true, tras_responder='nada' where clave='trabajar';
update public.respuestas set disparadores='perdi,se me perdio,perdido,objeto perdido,olvide algo', bot_auto=true, tras_responder='nada' where clave='objeto_perdido';
update public.respuestas set disparadores='saludo,hola,buenas,que tal', bot_auto=false, tras_responder='nada' where clave='saludo';

select clave, bot_auto, tras_responder, left(coalesce(disparadores,''),40) as disparadores from public.respuestas where bot_auto order by orden;
