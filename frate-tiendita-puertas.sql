-- frate-tiendita-puertas.sql · 20-oct-2026
--
-- UN producto, UN stock, TRES puertas de venta que se encienden por separado.
--
-- Antes el vaso vivía en `addons` (dos filas, dos contadores) y además se quería
-- en la tiendita: eso son dos cajas para los mismos 999 vasos y termina
-- vendiendo más de los que existen. Ahora vive en UN producto de `tiendita` y
-- lo que cambia es por dónde se puede comprar, no dónde está guardado.

alter table public.tiendita
  add column if not exists en_tienda       boolean not null default false,
  add column if not exists en_checkout     boolean not null default false,
  add column if not exists por_link        boolean not null default false,
  add column if not exists eventos         int[],
  add column if not exists max_por_entrada int;

comment on column public.tiendita.en_tienda   is 'Puerta 1: se ve y se compra en La Tiendita pública.';
comment on column public.tiendita.en_checkout is 'Puerta 2: aparece como extra al comprar entradas (ver `eventos`).';
comment on column public.tiendita.por_link    is 'Puerta 3: solo por enlace firmado que se manda por correo a quien ya compró.';
comment on column public.tiendita.eventos     is 'Noches donde aplica. NULL = todas.';
comment on column public.tiendita.max_por_entrada is
  'Tope por entrada. 1 = un producto por cada entrada. NULL = sin tope. Vale para TODAS las puertas: en el checkout cuenta las del carrito, por link las ya pagadas.';

-- El vaso: una fila, 999 unidades, las tres noches.
-- Tienda APAGADA (el dueño no quiere abrir la tiendita todavía).
insert into public.tiendita
  (nombre, categoria, descripcion, precio, stock, disponible, colores, orden,
   en_tienda, en_checkout, por_link, eventos, max_por_entrada)
select
  'Vaso coleccionable Frateween', 'Coleccionables',
  '500cc · te toca uno de los 3 colores al azar. Se retira en la barra con tu entrada.',
  1000, 999, true, array['Blanco','Rojo','Negro'], 1,
  false, true, true, array[59,60,61], 1
where not exists (select 1 from public.tiendita where nombre = 'Vaso coleccionable Frateween');

-- Y se retiran los dos addons: desde ahora hay UN solo contador.
-- No se borran — si algo quedó apuntando a ellos, mejor que exista y esté apagado.
update public.addons set activo = false where id in (4, 5);
