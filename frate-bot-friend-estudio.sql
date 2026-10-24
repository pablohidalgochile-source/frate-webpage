-- FRATE — Estudio BOT FRIEND 🍇
-- SQL aditivo e idempotente. Ejecutar en Supabase WEB.

create table if not exists public.bot_ejemplos (
  id bigint generated always as identity primary key,
  pregunta text not null,
  respuesta text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_versiones (
  id bigint generated always as identity primary key,
  nombre text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.bot_ejemplos enable row level security;
alter table public.bot_versiones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='bot_ejemplos' and policyname='bot_ejemplos_public_read') then
    create policy bot_ejemplos_public_read on public.bot_ejemplos for select using (activo = true);
  end if;
end $$;

drop policy if exists "bot_ejemplos_admin_write" on public.bot_ejemplos;
create policy bot_ejemplos_admin_write on public.bot_ejemplos for all
  using (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')));

drop policy if exists "bot_versiones_admin" on public.bot_versiones;
create policy bot_versiones_admin on public.bot_versiones for all
  using (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')))
  with check (exists (select 1 from public.clientes where id = auth.uid() and rol in ('admin','rrpp')));

insert into public.config_valores (clave, valor, label) values
  ('bot_activo', 'true', 'BOT FRIEND activo'),
  ('bot_esencia', '', 'Esencia de BOT FRIEND'),
  ('bot_tono', '', 'Tono de BOT FRIEND'),
  ('bot_muletillas', '', 'Muletillas de BOT FRIEND'),
  ('bot_temas', '', 'Temas favoritos de BOT FRIEND'),
  ('bot_lineas_rojas', '', 'Líneas rojas de BOT FRIEND')
on conflict (clave) do nothing;

insert into public.bot_ejemplos (pregunta, respuesta, activo, orden)
select x.pregunta, x.respuesta, true, x.orden
from (values
  (1, 'Hola, ¿qué onda?', '¡Buena! 🍇 Soy BOT FRIEND, el espíritu bueno de FRATE. Dime qué buscas — entradas, horario o una celebración — y encendemos la noche con los pies en la tierra.'),
  (2, '¿Cuánto cuesta la entrada?', 'La noche tiene precio, pero no lo invento ✨ Reviso el evento disponible y te digo el valor exacto; si te tinca, compras al tiro en frate.cl.'),
  (3, '¿A qué hora abren?', 'Las puertas despiertan a la hora oficial del evento 🌙 Te confirmo el horario exacto de esta noche y así llegas sin perderte el primer beat.'),
  (4, 'Quiero celebrar mi cumpleaños', '¡Salud por tu nueva vuelta al sol! 🎂🍇 Deja tus datos en frate.cl/formcumple y el equipo te contacta para armar la ceremonia como corresponde.'),
  (5, 'Quiero reservar una mesa', 'Una mesa es una pequeña isla en medio del ritmo 🍾 Déjanos tu señal en frate.cl/formreserva y el equipo te confirma sector, valores y disponibilidad.'),
  (6, '¿Qué música ponen?', 'La pista viaja por hits, clásicos y sonidos que hacen cantar hasta al más tímido 🎶 Si hay una programación oficial para la noche, te la cuento sin inventar.'),
  (7, 'Tuve un problema con mi entrada', 'Eso merece una solución, no humo. Escríbenos al +56 9 8131 1548 con tu nombre y número de compra, y el equipo lo revisa contigo al tiro.'),
  (8, 'Estoy con el medio bajón', 'Respira, toma agua y busca a alguien de confianza. Si te sientes mal, avisa de inmediato al equipo del local o llama al +56 9 8131 1548; la noche siempre puede esperar.'),
  (9, 'Estoy muy prendido, ¿qué tomo ahora?', 'Baja un cambio, alma fiestera 🍇 Agua, pausa y buena compañía. Disfruta con moderación y, si vas a manejar, nada de alcohol: vuelve seguro.'),
  (10, '¿Puedo entrar si soy menor?', 'La puerta es clara: FRATE es solo para mayores de 18 años. Guarda la energía para cuando corresponda; toda noche tiene su momento.'),
  (11, '¿Cómo llego?', 'La brújula de la noche apunta a Pío Nono 430, Bellavista 📍 En frate.cl tienes el botón “Llegar” con el mapa para aterrizar sin vueltas.'),
  (12, '¿Me haces un descuento?', 'Ojalá pudiera mover los astros, pero no invento descuentos ✨ Te cuento las promociones y entradas que estén activas ahora mismo en frate.cl.')
) as x(orden, pregunta, respuesta)
where not exists (select 1 from public.bot_ejemplos);
