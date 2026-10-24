-- 💳 LAS COMISIONES DE MERCADOPAGO EN EL SISTEMA
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · idempotente
--
-- Las tasas oficiales de tu cuenta, de las capturas del 11-08-2026.
-- Quedan acá para que la WEB, el POS y el ERP calculen con el mismo número
-- y nadie lo escriba a mano en su código.
--
-- ⚠️ OJO CON UNA COSA: ninguna de estas tasas explica lo que MercadoPago te
--    cobró de verdad en FCC-005822 ($898 sobre $29.160 = 3,08%).
--    · Link de pago 2,24%     → habría sido $653
--    · +IVA 19% sobre esa     → $777
--    · Point Smart crédito    → $697
--    Falta la pestaña CHECKOUT, que es la que usa frate.cl. Cuando la tengas,
--    cambia `mp_checkout` y listo. Mientras tanto queda en 3,08%, que es el
--    dato REAL medido en una liquidación — prefiero un número verificado que
--    uno que suena bien y no calza.

create table if not exists public.comisiones_mp (
  id          bigserial primary key,
  canal       text        not null,        -- checkout | link_pago | point_smart | point_mini | qr
  medio       text        not null,        -- credito | debito | prepago | transferencia | dinero_mp | cuotas | todos
  pct         numeric(5,2) not null,
  plazo       text        default 'al_instante',
  vigente_desde date      not null default current_date,
  nota        text,
  updated_at  timestamptz not null default now()
);

create unique index if not exists comisiones_mp_uk
  on public.comisiones_mp (canal, medio);

alter table public.comisiones_mp enable row level security;

-- La leen todos los sistemas; solo un admin la edita.
drop policy if exists comisiones_mp_lee on public.comisiones_mp;
create policy comisiones_mp_lee on public.comisiones_mp for select using (true);

drop policy if exists comisiones_mp_admin on public.comisiones_mp;
create policy comisiones_mp_admin on public.comisiones_mp for all
  using (exists (select 1 from public.clientes where id = auth.uid() and rol = 'admin'));


-- ── Las tasas de tus capturas ─────────────────────────────────────
insert into public.comisiones_mp (canal, medio, pct, nota) values
  ('link_pago',   'todos',        2.24, 'Link de pago · aplica a todos los medios'),
  ('point_smart', 'credito',      2.39, 'Tasa especial (lista 2,69%)'),
  ('point_smart', 'debito',       1.59, 'Tasa especial (lista 2,19%)'),
  ('point_smart', 'prepago',      1.59, 'Tasa especial'),
  ('checkout',    'todos',        3.08, 'MEDIDO, no oficial: $898 sobre $29.160 en FCC-005822. Falta la pestaña Checkout.')
on conflict (canal, medio) do update
  set pct = excluded.pct, nota = excluded.nota, updated_at = now();


-- ── El número que usa la web hoy ──────────────────────────────────
-- `comision_mp_pct` es el que lee `devolver-pago`. Se deja apuntando al
-- canal checkout, que es por donde entra la venta de frate.cl.
insert into public.config_valores(clave, valor)
select 'comision_mp_pct', '3.08'
where not exists (select 1 from public.config_valores where clave='comision_mp_pct');

update public.config_valores
   set valor = (select pct::text from public.comisiones_mp
                 where canal='checkout' and medio='todos')
 where clave = 'comision_mp_pct';


-- ── Chequeo ────────────────────────────────────────────────────────
select canal, medio, pct || '%' as comision, nota
from public.comisiones_mp
order by canal, medio;
