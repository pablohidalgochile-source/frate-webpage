-- ============================================================
-- FRATE · CATÁLOGO DE PAQUETES — cumpleaños, despedidas y reservas
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- HOY el paquete es TEXTO LIBRE en `formularios.gestion.paquete`, y ya está
-- sucio: el mismo paquete escrito de cuatro formas —«Opción 2. Gratuita»,
-- «Opicón 2. Gratuita», «Opción 2. Gartuita»— así que no se puede sumar
-- cuánto se vendió de cada uno.
--
-- ⚠️ REGLA DEL DUEÑO (2026-07-31): «cada opción y presupuesto cambia según el
--    cliente… si bien puedes tener precios y referencias, EL MONTO FINAL LO
--    PONE UN HUMANO». Por eso los precios de esta tabla son **de referencia**:
--    prellenan el campo y nada más. Lo que se guarda es lo que escribe la
--    persona, y queda el rastro de cuánto sugería el paquete.
--
-- Los textos salen del manual de la agenda de cumpleaños.
-- Idempotente.
-- ============================================================

create table if not exists public.crm_paquetes (
  id             serial primary key,
  clave          text unique not null,
  familia        text not null default 'cumple',   -- cumple | despedida | reserva
  nombre         text not null,
  descripcion    text,                             -- lo que se le manda al cliente
  invitados_ref  int,                              -- cuántos entran, de referencia
  gratis         int default 0,                    -- cuántos de esos NO pagan
  precio_ref     int default 0,                    -- por invitado que paga, referencia
  hora_corte     text default '00:30',
  cover          text,                             -- 'M (500cc)' etc.
  activo         boolean default true,
  orden          int default 0,
  creado_at      timestamptz default now()
);

-- Los paquetes reales del manual. `precio_ref` e `invitados_ref` son SUGERENCIA.
insert into public.crm_paquetes
  (clave, familia, nombre, descripcion, invitados_ref, gratis, precio_ref, hora_corte, cover, orden)
select * from (values
  ('solito', 'cumple', 'Carreteo solito',
   'Si cumples años la semana del evento entras gratis + 1 acompañante, llegando antes de las 00:30. Cédula física en la puerta (no sirve foto). Trago de cortesía para el cumpleañer@.',
   2, 2, 0, '00:30', null, 1),

  ('gratis_jue', 'cumple', 'Lista gratuita · jueves',
   'Lista gratuita: cumpleañer@ + 14 personas los jueves, hasta las 00:30. Trago de cortesía para el cumpleañer@.',
   15, 15, 0, '00:30', null, 2),

  ('gratis_finde', 'cumple', 'Lista gratuita · viernes y sábado',
   'Lista gratuita: cumpleañer@ + 4 personas los viernes y sábados, hasta las 00:30. Trago de cortesía para el cumpleañer@.',
   5, 5, 0, '00:30', null, 3),

  ('lowcost_9', 'cumple', 'Low cost · +9',
   'Lista de invitados: cumpleañer@ + 9 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 acompañante entran gratis. Válido hasta las 00:30.',
   10, 2, 7000, '00:30', 'M (500cc)', 4),

  ('lowcost_4', 'cumple', 'Low cost · +4',
   'Lista de invitados: cumpleañer@ + 4 personas, $7.000 c/u con cover M (500cc). Cumpleañer@ + 1 acompañante entran gratis. Válido hasta las 00:30.',
   5, 2, 7000, '00:30', 'M (500cc)', 5),

  ('reservado', 'cumple', 'Carrete reservado',
   'Espacio reservado + pack de botella. Se cotiza según lo que pida el cliente.',
   null, 0, 0, null, null, 6),

  -- ── Despedidas de solter@s ──
  ('chao_solteria', 'despedida', 'Pack ¡Chao soltería!',
   'Arma tu pack de consumo para novi@ + 9 personas (máximo). Entrada general. Válido hasta las 00:30.',
   10, 0, 0, '00:30', null, 10),

  ('despedida_low', 'despedida', 'Despedida low cost',
   'Novi@ + 9 personas (máximo). El/la novi@ entra gratis + cover de regalo; invitad@s $13.000 c/u y tod@s reciben cover. Entrada general. Válido hasta las 00:30.',
   10, 1, 13000, '00:30', 'incluido', 11),

  ('privado_novi', 'despedida', 'Privado de novi@',
   'Espacio reservado + pack de botella. Entrada VIP. Se cotiza según lo que pida el cliente.',
   null, 0, 0, null, null, 12),

  -- ── Reservas normales ──
  ('reserva_vip', 'reserva', 'Reserva VIP',
   'Espacio VIP + pack de botella. Se cotiza según lo que pida el cliente.',
   null, 0, 0, null, null, 20),

  ('reserva_general', 'reserva', 'Reserva general',
   'Espacio en general + consumo. Se cotiza según lo que pida el cliente.',
   null, 0, 0, null, null, 21)
) v(clave, familia, nombre, descripcion, invitados_ref, gratis, precio_ref, hora_corte, cover, orden)
where not exists (select 1 from public.crm_paquetes p where p.clave = v.clave);

alter table public.crm_paquetes enable row level security;
drop policy if exists paq_lectura on public.crm_paquetes;
create policy paq_lectura on public.crm_paquetes for select
  using (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol in ('admin','rrpp','portero')));
drop policy if exists paq_admin on public.crm_paquetes;
create policy paq_admin on public.crm_paquetes for all
  using      (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'))
  with check (exists (select 1 from public.clientes c where c.id = auth.uid() and c.rol = 'admin'));


-- ── Verificación ──
select nombre, familia,
       coalesce(invitados_ref::text,'a cotizar') as entran,
       gratis as sin_pagar,
       case when precio_ref > 0 then '$'||precio_ref||' c/u (ref.)' else 'sin precio fijo' end as referencia,
       coalesce(hora_corte,'—') as corte
from public.crm_paquetes where activo order by orden;

-- ============================================================
-- CÓMO SE USA
--
-- Al elegir el paquete en la ficha, el panel PRELLENA el # de invitados y
-- calcula un total de referencia:
--     (invitados_ref - gratis) × precio_ref
-- Ejemplo, Low cost +9:  (10 - 2) × $7.000 = $56.000 sugerido
--
-- Ese número se puede pisar SIEMPRE. Se guarda lo que escriba la persona en
-- `gestion.monto_total`, y aparte queda `gestion.monto_sugerido` para poder
-- ver después cuánto se descontó y por qué.
-- ============================================================
