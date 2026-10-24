-- === Decoracion de los enlaces: color y emoji desde config ===
-- link_items solo tenia UN emoji y ningun color. El mosaico necesita varios
-- y el tinte tiene que elegirse, no adivinarse.
-- Si `emojis` queda vacio, frate-afiche.js los deduce del nombre del enlace
-- (mujer -> 👩💃, universitario -> 🎓📚, cumple -> 🎂, etc).
-- Idempotente.

alter table public.link_items
  add column if not exists color  text,
  add column if not exists emojis text;

comment on column public.link_items.color  is 'Hex del tinte del enlace. Vacio = lo elige el nombre.';
comment on column public.link_items.emojis is 'Los emoji del mosaico, pegados sin separador. Vacio = se deducen del titulo.';

select id, titulo, emoji, coalesce(emojis,'(se deducen)') as emojis, coalesce(color,'(lo elige el nombre)') as color
from public.link_items order by orden, id;
