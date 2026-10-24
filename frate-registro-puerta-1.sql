-- 🪪 REGISTRO POR CARNET EN LA PUERTA · PARTE 1 de 2 · idempotente
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- Hoy la gente de entrada general entra y no queda registrada. Como por ley
-- hay que verificar nombre, edad y RUT, se puede escanear el carnet y de
-- paso dejarlos en el CRM.
--
-- ⚖️ VERIFICAR la edad es obligación legal. GUARDAR la identidad para
--    contactar después es otro uso, y la Ley 19.628 lo trata aparte. Por eso
--    el guardado tiene INTERRUPTOR PROPIO y arranca APAGADO: la verificación
--    de edad funciona igual con el guardado apagado.
--    Se guarda lo mínimo: nombre, RUT y fecha de nacimiento. Nunca el dato
--    crudo del carnet ni la foto.

-- ── 1) El interruptor · arranca APAGADO ───────────────────────────
insert into public.config_valores(clave, valor)
select 'registro_puerta_on', 'false'
where not exists (select 1 from public.config_valores where clave='registro_puerta_on');

insert into public.config_valores(clave, valor)
select 'edad_minima', '18'
where not exists (select 1 from public.config_valores where clave='edad_minima');


-- ── 2) La bitácora de la puerta gana tres campos ──────────────────
alter table public.ingresos_manuales
  add column if not exists fecha_nacimiento date,
  add column if not exists origen           text,     -- general | vip | otro
  add column if not exists rechazado        boolean default false;

comment on column public.ingresos_manuales.origen is
  'general = entrada general registrada por carnet · vip = ingreso de cortesía/puerta';


-- ── 3) La edad, calculada en el servidor ──────────────────────────
-- En el navegador se puede mentir. Acá no.
create or replace function public.edad_de(p_nac date) returns int
language sql immutable set search_path = public as $$
  select case when p_nac is null then null
              else extract(year from age(current_date, p_nac))::int end
$$;
grant execute on function public.edad_de(date) to authenticated;
