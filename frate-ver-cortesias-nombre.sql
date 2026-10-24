-- 🎟️ ¿Por qué el correo dice «PRO» en vez de VIP FUEGO / VIP AIRE?
-- Solo LEE. Muestra exactamente lo que se guardó en cada cortesía.
--
-- El correo elige el nombre así (send-receipt:255):
--     condiciones->>'titulo'  →  nombre_ticket  →  el nombre del tipo_ticket
-- Si los dos primeros vienen vacíos, cae al tercero — y ese es el que dice «PRO».

select
  ip.id,
  p.created_at::date                         as dia,
  e.nombre                                   as evento,
  ip.nombre_ticket,                           -- lo que se guardó al emitir
  ip.condiciones->>'titulo'                  as cond_titulo,      -- lo que el correo prefiere
  ip.condiciones->>'hora_max_llegada'        as cond_hora,        -- esto sí sale bien
  coalesce(ip.condiciones->>'instrucciones',
           ip.condiciones->>'texto')         as cond_condiciones, -- las que faltan
  tt.nombre                                  as tipo_ticket,      -- el «PRO» del final
  case
    when coalesce(ip.condiciones->>'titulo','') <> '' then '✅ usa cond.titulo'
    when coalesce(ip.nombre_ticket,'')        <> '' then '⚠️ usa nombre_ticket'
    else '❌ cae al tipo de ticket · acá sale «PRO»'
  end                                         as que_muestra_el_correo
from public.items_pedido ip
join public.pedidos p on p.id = ip.pedido_id
left join public.eventos e on e.id = ip.evento_id
left join public.tipos_ticket tt on tt.id = ip.tipo_ticket_id
where p.metodo_pago = 'cortesia'
  and p.created_at > now() - interval '20 days'
order by p.created_at desc
limit 40;
