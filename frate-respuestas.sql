-- ============================================================
-- FRATE — Respuestas rápidas (bot + inbox humano) — biblioteca completa
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- Idempotente (upsert por clave). Textos con dollar-quoting ($t$...$t$).
-- ============================================================

create table if not exists public.respuestas (
  id         bigint generated always as identity primary key,
  clave      text not null unique,
  titulo     text not null,
  texto      text not null,
  categoria  text not null default 'general',   -- cumple | despedida | convenio | general
  orden      integer not null default 0,
  activo     boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.respuestas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='respuestas' and policyname='respuestas_public_read') then
    create policy respuestas_public_read on public.respuestas for select using (true);
  end if;
end $$;
drop policy if exists "respuestas_admin_write" on public.respuestas;
create policy "respuestas_admin_write" on public.respuestas for all
  using (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from clientes where id = auth.uid() and rol in ('admin','rrpp')));

insert into public.respuestas (clave, titulo, texto, categoria, orden) values

-- ══════════════ GENERALES ══════════════
('saludo', 'Saludo / bienvenida',
$t$¡Hola! 👋 Bienvenid@ a FRATE — Fraternidad Campus Central 🎓
Estamos en Pío Nono 430, Bellavista. Jueves a sábado desde las 23:00.
¿En qué te ayudo? Puedo contarte de cumpleaños 🎂, despedidas de solter@ 👰, reservas/botellas 🍾 o convenios universitarios 🎓.$t$,
'general', 1),

('comprar_entrada', '¿Dónde compro entrada?',
$t$Para adquirir tu entrada a Fraternidad Campus Central tienes 2 opciones:

1) Preventa universitaria (mujeres y hombres) en frate.cl
2) Entrada general (todo público) en puerta el día del evento, sujeta a disponibilidad y horario.

Valor entrada general: $10.000 con cover el jueves · $14.000 con cover viernes y sábado (toda la noche).$t$,
'general', 2),

('guardarropia', '¿Tienen guardarropía?',
$t$No contamos con custodia en el local. Te recomendamos no traer bolsos ni ropa voluminosa para que estés cómod@ y segur@. 🙌$t$,
'general', 3),

('documento_sin_cedula', '¿Qué documento presento si no tengo cédula?',
$t$Puedes presentar tu Pasaporte o el Comprobante de Reimpresión del Carnet de Identidad. Cualquiera de esos documentos sirve. 🪪$t$,
'general', 4),

('estacionamiento', '¿Tienen estacionamiento?',
$t$Por el momento no tenemos estacionamiento propio. En la calle Dominica hay estacionamiento cerca del local, y si prefieres uno cerrado, está el del Patio Bellavista. 🅿️$t$,
'general', 5),

('horario_disco', '¿Cuál es el horario de la disco?',
$t$Nuestro horario de funcionamiento:
• Jueves: 23:00 a 04:00 hrs
• Viernes, sábado y festivos: 23:00 a 05:00 hrs

Venta de entradas online hasta las 23:00 hrs. En puerta, hasta una hora antes del cierre. Puedes ingresar con tu entrada hasta una hora antes del cierre.$t$,
'general', 6),

('prohibido', '¿Qué está prohibido ingresar?',
$t$Está prohibido ingresar alimentos, bebidas (con y sin alcohol), drogas, elementos que puedan considerarse armas y animales. 🚫$t$,
'general', 7),

('acreditar_universitario', '¿Cómo acredito que soy universitari@?',
$t$Si compraste entrada universitaria, en puerta puedes mostrar cualquiera de estos: credencial universitaria, TNE, o la app/portal web de tu institución. 🎓$t$,
'general', 8),

('dresscode', '¿Tienen dresscode?',
$t$Nuestro código de vestimenta es "Sé tú mism@" 😎 Ven lo más cómod@ posible para disfrutar al máximo. ¡Te esperamos!$t$,
'general', 9),

('trabajar', 'Me gustaría trabajar con ustedes',
$t$¡Genial! Envíanos tu CV, o si eres Influencer tu propuesta, al correo staff.campuscentral@gmail.com 📩$t$,
'general', 10),

('objeto_perdido', 'Se me perdió algo en la disco',
$t$Gracias por avisar. Coméntanos las características de lo que perdiste; si aparece, te contactamos para coordinar la entrega. 🙏$t$,
'general', 11),

('contenido', '¿Puedo hacer contenido en la disco?',
$t$Gracias por tu propuesta y disculpa la demora. Con el equipo revisamos los detalles y objetivos de tu contenido, y por el momento no podemos avanzar con la colaboración, ya que no se alinea con los principios y valores del local. Agradecemos tu comprensión y te deseamos mucho éxito. 🙌$t$,
'general', 12),

('horario_atencion', '¿Están disponibles ahora? (horario)',
$t$En este momento estamos cerrados. Nuestro horario de atención:
Lunes a miércoles: 12:00 - 20:00 hrs
Jueves a sábado: 13:00 - 18:00 hrs
Domingo: cerrado
Te respondemos apenas abramos. 😉$t$,
'general', 13),

-- ══════════════ CUMPLEAÑOS ══════════════
('cumple_bienvenida', 'Cumpleaños — bienvenida / agenda',
$t$¡Hola! Bienvenid@ a nuestra agenda de cumpleaños 🎂🐵
La agenda funciona con reserva previa. Cuéntanos y completamos juntos:
• Mail oficial (para enviar la info)
• Nombre completo del/la cumpleañer@ + Instagram
• Nombre de quien hace la gestión
• Fecha de nacimiento del/la cumpleañer@
• Fecha que desea celebrar
• ¿Es estudiante de educación superior?

📌 Puedes celebrar uno de los días de evento de la semana de tu cumpleaños. Este es el único número para agendar cumple, nunca te hablaremos de otro 😉$t$,
'cumple', 20),

('cumple_4_jueves', 'Cumpleaños — 4 opciones (jueves +14)',
$t$🎂 CUMPLEAÑOS

Tenemos 4 opciones disponibles:

1️⃣ CARRETEO SOLITO
Si cumples años la semana del evento, ingresas gratis + 1 acompañante llegando antes de las 00:30 hrs (luego pierdes el beneficio). Presenta tu cédula en puerta, presencial (no sirve foto). Trago de cortesía para el/la cumpleañer@.

2️⃣ CARRETE LISTA GRATUITA
a) Jueves: cumpleañer@ + 14 personas gratis hasta las 00:30 hrs.
b) Viernes y sábado: cumpleañer@ + 4 personas gratis hasta las 00:30 hrs.
Trago de cortesía para el/la cumpleañer@.

3️⃣ CARRETE LOW COST
Cumpleañer@ + 9 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 acompañante entran gratis. Hasta las 00:30 hrs.

4️⃣ CARRETE RESERVADOS
¿Reservar espacio y pack de botella? Coméntanos.

📌 Hasta las 18:00 hrs del mismo día del evento se envía la lista y el pago.$t$,
'cumple', 21),

('cumple_4', 'Cumpleaños — 4 opciones (+4)',
$t$🎂 CUMPLEAÑOS

Tenemos 4 opciones disponibles:

1️⃣ CARRETEO SOLITO
Gratis + 1 acompañante antes de las 00:30 hrs. Cédula en puerta, presencial. Trago de cortesía.

2️⃣ CARRETE LISTA GRATUITA
Cumpleañer@ + 4 personas gratis hasta las 00:30 hrs. Trago de cortesía.

3️⃣ CARRETE LOW COST
Cumpleañer@ + 9 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 gratis. Hasta las 00:30 hrs.

4️⃣ CARRETE RESERVADOS
¿Reservar espacio y pack de botella? Coméntanos.

📌 Hasta las 18:00 hrs del mismo día se envía la lista y el pago.$t$,
'cumple', 22),

('cumple_3_reservados', 'Cumpleaños — 3 opciones (con Reservados)',
$t$🎂 CUMPLEAÑOS

Tenemos 3 opciones disponibles:

1️⃣ CARRETEO SOLITO
Gratis + 1 acompañante antes de las 00:30 hrs. Cédula en puerta, presencial. Trago de cortesía.

2️⃣ CARRETE LOW COST
Cumpleañer@ + 9 personas, $7.000 c/u con cover. Cumpleañer@ + 1 gratis. Hasta las 00:30 hrs.

3️⃣ CARRETE RESERVADOS
¿Reservar espacio y pack de botella? Coméntanos.

📌 Hasta las 18:00 hrs del mismo día se envía la lista y el pago.$t$,
'cumple', 23),

('cumple_2', 'Cumpleaños — 2 opciones (Solito + Low Cost)',
$t$🎂 CUMPLEAÑOS

Tenemos 2 opciones disponibles:

1️⃣ CARRETEO SOLITO
Gratis + 1 acompañante antes de las 00:30 hrs. Cédula en puerta, presencial. Trago de cortesía.

2️⃣ CARRETE LOW COST
Cumpleañer@ + 4 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 gratis. Hasta las 00:30 hrs.

📌 Hasta las 18:00 hrs del mismo día se envía la lista y el pago.$t$,
'cumple', 24),

('cumple_3_lista', 'Cumpleaños — 3 opciones (con Lista Gratuita jue/vie/sáb)',
$t$🎂 CUMPLEAÑOS

Tenemos 3 opciones disponibles:

1️⃣ CARRETEO SOLITO
Gratis + 1 acompañante antes de las 00:30 hrs. Cédula en puerta, presencial. Trago de cortesía.

2️⃣ CARRETE LISTA GRATUITA
Cumpleañer@ + 4 personas los jueves, viernes y sábado gratis hasta las 00:30 hrs. Trago de cortesía.

3️⃣ CARRETE LOW COST
Cumpleañer@ + 9 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 gratis. Hasta las 00:30 hrs.

📌 Hasta las 18:00 hrs del mismo día se envía la lista y el pago.$t$,
'cumple', 25),

('cumple_mas_opciones', 'Cumpleaños — ¿tienen más opciones?',
$t$La agenda de cumpleaños funciona por reserva previa. Cuéntanos los datos de tu celebración y te comentamos si tenemos opciones disponibles para tu fecha (o si puedes usar el beneficio en otro momento). 🎂$t$,
'cumple', 26),

('cumple_demora', 'Cumpleaños — ¿por qué se demoran?',
$t$Disculpa la demora 🙏 Tenemos varios chats a los que estamos respondiendo, pero no te preocupes: te ayudo con todo lo que necesites. 💛$t$,
'cumple', 27),

('cumple_agendado', 'Cumpleaños — ¿quedó agendado?',
$t$¡Listo! Tu cumple queda agendado para el día X 🎉
Cuando estés en la puerta, contáctanos por este mismo medio para recibirte y entregarte tu cover de trago de cortesía. Ingresas por el acceso de cumpleañeros y muestras las entradas con código QR que te enviaremos.
📌 Todos deben ingresar antes de las 00:30 hrs. El/la cumpleañer@ ingresa primero. Todos con carnet físico.$t$,
'cumple', 28),

('cumple_instagram', 'Cumpleaños — ¿les envío mi Instagram?',
$t$¡Sí! Envíanos tu Instagram y te seguimos. El nuestro es https://www.instagram.com/cumple.campuscentral mientras revisamos disponibilidad. 📸$t$,
'cumple', 29),

('cumple_disponibilidad', 'Cumpleaños — sin disponibilidad esta semana',
$t$Para esta fecha tenemos la agenda cerrada 🙏 Cuéntanos otra fecha y revisamos disponibilidad para tu celebración.$t$,
'cumple', 30),

('cumple_perdimos', 'Cumpleaños — perdimos la conversación',
$t$Si tenemos una conversación previa, por favor envíanos una captura de pantalla o video de esa conversación para retomar tu gestión. 🙌$t$,
'cumple', 31),

('cumple_donde_registro', 'Cumpleaños — ¿dónde registro la lista?',
$t$Completa el formulario en el siguiente link para enviar tus entradas: (LINK)

INSTRUCCIONES:
1. Rellénalo UNA sola vez con toda la información. Complétalo cuando tengas todos los datos. Tienes hasta las 20:00 hrs del día del evento.
2. Ingresa la cantidad máxima de invitad@s acordada con la coordinadora. No se consideran más invitad@s que los presupuestados.
3. Confírmanos por WhatsApp una vez que completes el formulario.
4. Las entradas se envían antes de las 23:00 hrs del mismo día del evento.$t$,
'cumple', 32),

('cumple_ya_celebre', 'Cumpleaños — ya celebré (agradecimiento)',
$t$¡Hola! Esperamos que hayas disfrutado tu cumpleaños en Fraternidad Campus Central 🐵🎂
Nos encantaría que compartas una historia en tu Instagram etiquetándonos como @cumple.campuscentral contándonos cómo lo pasaste. ¡Gracias por preferirnos 🤩, nos vemos pronto! 🏡$t$,
'cumple', 33),

('cumple_asistencia', 'Cumpleaños — confirmar asistencia',
$t$¡Hola! Nos gustaría saber si confirmas la asistencia para el evento de esta noche donde celebrarás tu cumple 🎂 Cuéntanos así te dejamos todo listo.$t$,
'cumple', 34),

-- ══════════════ DESPEDIDA ══════════════
('despedida', 'Despedida de solter@s — 3 opciones',
$t$🎉 DESPEDIDA DE SOLTER@S

Tenemos 3 opciones disponibles:

1️⃣ PACK ¡CHAO SOLTERÍA!
Arma tu pack de consumo para Novi@ + 9 personas (máximo). Entrada general. Válido hasta las 00:30 hrs.

2️⃣ DESPEDIDA LOW COST
Lista de invitados Novi@ + 9 personas (máximo). Novi@ entra gratis + cover de regalo. Invitad@s $13.000 c/u, tod@s reciben cover. Entrada general. Válido hasta las 00:30 hrs.

3️⃣ PRIVADO DE NOVI@
¿Quieres reservar espacio y pack de botella? Coméntanos. Entrada VIP.

(El pago se realiza previamente mediante WebPay)

Indícanos qué opción te gustaría para agendar tu celebración 💛$t$,
'despedida', 40),

-- ══════════════ CONVENIO / UNIVERSIDADES ══════════════
('convenio', 'Convenio universitario — FRAT&FRIENDS',
$t$🎓 CONVENIO UNIVERSITARIO — FRAT&FRIENDS

¿Eres de un centro de estudiantes, federación o grupo universitario? Con FRAT&FRIENDS accedes a entradas rebajadas, cortesías y hasta comisión por ventas.

Tenemos planes desde 30 entradas (Convenio Small) hasta fiestas exclusivas. Cada plan define precios, gratuidades (entradas + VIP + cover) y días válidos.

Escríbenos para coordinar una reunión y armar el convenio de tu grupo 💛
Revisa todo en frate.cl/frat-friends$t$,
'convenio', 50),

('convenio_pedir_datos', 'Convenio — pedir datos para enviar planes',
$t$¡Con gusto te enviamos los planes y convenios universitarios! Déjanos estos datos:
• Nombre y apellido
• Carrera que cursas
• Universidad o instituto
• Centro de alumnos que representas
• Tu cargo en el centro de alumnos
• Un correo para enviarte la propuesta 📩$t$,
'convenio', 51),

('convenio_embajador_beneficio', 'Embajador universitario — beneficios por eventos',
$t$🎓 BENEFICIO PARA EMBAJADORES UNIVERSITARIOS

• 1 evento con Campus Central: 1 entrada general + 1 Cover S para el embajador.
• 2 eventos: 1 entrada general para el embajador + 1 entrada general para acompañante + Cover S.
• 3 eventos: 1 entrada general + 2 entradas generales para acompañantes + Cover M.
• Más de 3 eventos: 1 entrada VIP + 1 entrada VIP para acompañante + Cover M.$t$,
'convenio', 52),

('cliente_frecuente', 'Cliente frecuente — inscripción',
$t$¡Genial que quieras ser cliente frecuente! Completa estos datos:
• Mail oficial (para enviar la info)
• Nombre completo
• Instagram
• ¿Eres estudiante de educación superior?
• Información adicional

📌 Este es el único número de contacto, nunca te hablaremos de otro 😉$t$,
'convenio', 53)

on conflict (clave) do update set
  titulo=excluded.titulo, texto=excluded.texto, categoria=excluded.categoria, orden=excluded.orden, updated_at=now();

select categoria, count(*) as respuestas from public.respuestas group by categoria order by categoria;
