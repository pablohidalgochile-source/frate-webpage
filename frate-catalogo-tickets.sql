-- ============================================================
-- FRATE · Tipos de ticket para el CATÁLOGO (catalogo_tickets)
-- Proyecto WEB · SQL Editor. Idempotente: si ya existe uno con
-- ese nombre, no lo duplica (puedes correrlo de nuevo tranquilo).
--
-- Todos: gratis ($0), NO transferible, género general, máx 1 por
-- compra, activos. El "válido hasta" va en hora_max_ingreso.
-- Si algún INSERT se queja de una columna (hora_max_ingreso /
-- transferible / instrucciones), bórrala de ESE insert y reintenta.
-- ============================================================

-- 1) LISTA CORTESIA STAFF & AMIG@S (hasta 01:00)
insert into public.catalogo_tickets (nombre, descripcion, precio, genero, max_por_compra, instrucciones, hora_max_ingreso, transferible, activo)
select 'LISTA CORTESIA STAFF & AMIG@S (GRATIS HASTA LAS 01:00 HRS)',
       'Este TICKET ASEGURA TU CUPO. Exclusivo para AMIG@S de NUESTRO STAFF E INVITAD@S. ENTRADA VÁLIDA HASTA 01:00 HRS. Es GRATUITO, INTRANSFERIBLE y VÁLIDO solo para el DÍA DEL EVENTO.',
       0, null, 1,
       'Gratis · No transferible · Cédula física · Válido hasta 01:00 hrs · Solo el día del evento',
       '01:00', false, true
where not exists (select 1 from public.catalogo_tickets where nombre = 'LISTA CORTESIA STAFF & AMIG@S (GRATIS HASTA LAS 01:00 HRS)');

-- 2) CUMPLEAÑOS INVITAD@ (genérico, hasta 00:30)
insert into public.catalogo_tickets (nombre, descripcion, precio, genero, max_por_compra, instrucciones, hora_max_ingreso, transferible, activo)
select 'CUMPLEAÑOS INVITAD@ (VÁLIDO HASTA LAS 00:30 HRS)',
       'TICKET DE INVITAD@ CUMPLEAÑOS. VÁLIDO HASTA LAS 00:30 HRS. Es GRATUITO, INTRANSFERIBLE y VÁLIDO solo para el DÍA DEL EVENTO.',
       0, null, 1,
       'Gratis · No transferible · Cédula física · Válido hasta 00:30 hrs · Solo el día del evento',
       '00:30', false, true
where not exists (select 1 from public.catalogo_tickets where nombre = 'CUMPLEAÑOS INVITAD@ (VÁLIDO HASTA LAS 00:30 HRS)');

-- 3) LISTA VIP AIRE (hasta 02:30)
insert into public.catalogo_tickets (nombre, descripcion, precio, genero, max_por_compra, instrucciones, hora_max_ingreso, transferible, activo)
select 'LISTA VIP AIRE (VÁLIDA HASTA LAS 02:30 HRS)',
       'Este TICKET ASEGURA TU CUPO. Exclusivo para AMIG@S de NUESTRO STAFF E INVITAD@S. ENTRADA VÁLIDA HASTA 02:30 HRS. Es GRATUITO, INTRANSFERIBLE y VÁLIDO solo para el DÍA DEL EVENTO.',
       0, null, 1,
       'Gratis · No transferible · Cédula física · Válido hasta 02:30 hrs · Solo el día del evento',
       '02:30', false, true
where not exists (select 1 from public.catalogo_tickets where nombre = 'LISTA VIP AIRE (VÁLIDA HASTA LAS 02:30 HRS)');

-- 4) LISTA VIP FUEGO (hasta 02:30)
insert into public.catalogo_tickets (nombre, descripcion, precio, genero, max_por_compra, instrucciones, hora_max_ingreso, transferible, activo)
select 'LISTA VIP FUEGO (VÁLIDA HASTA LAS 02:30 HRS)',
       'Este TICKET ASEGURA TU CUPO. Exclusivo para AMIG@S de NUESTRO STAFF E INVITAD@S. ENTRADA VÁLIDA HASTA 02:30 HRS. Es GRATUITO, INTRANSFERIBLE y VÁLIDO solo para el DÍA DEL EVENTO.',
       0, null, 1,
       'Gratis · No transferible · Cédula física · Válido hasta 02:30 hrs · Solo el día del evento',
       '02:30', false, true
where not exists (select 1 from public.catalogo_tickets where nombre = 'LISTA VIP FUEGO (VÁLIDA HASTA LAS 02:30 HRS)');

-- Verifica que quedaron:
select nombre, precio, hora_max_ingreso, transferible, activo
from public.catalogo_tickets
where nombre in (
  'LISTA CORTESIA STAFF & AMIG@S (GRATIS HASTA LAS 01:00 HRS)',
  'CUMPLEAÑOS INVITAD@ (VÁLIDO HASTA LAS 00:30 HRS)',
  'LISTA VIP AIRE (VÁLIDA HASTA LAS 02:30 HRS)',
  'LISTA VIP FUEGO (VÁLIDA HASTA LAS 02:30 HRS)'
) order by nombre;
