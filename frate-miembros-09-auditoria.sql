-- FRATE · AUDITORÍA de entradas de miembros (SOLO LECTURA · se puede correr cuando quieras)
-- Proyecto WEB · SQL Editor · copiar el resultado. Si todo está bien, las secciones «⚠️» salen vacías ([]).
with tt as (
  select id, nombre, coalesce(nullif(btrim(upper(genero)), ''), '-') as genero, estado, disponible,
         -- sexo que exige: F/M directo; universitaria (U) con HOMBRE o MUJER en el nombre, ese sexo
         case when upper(btrim(genero)) in ('F', 'M') then upper(btrim(genero))
              when upper(btrim(genero)) = 'U' and upper(nombre) like '%HOMBRE%' and upper(nombre) not like '%MUJER%' then 'M'
              when upper(btrim(genero)) = 'U' and upper(nombre) like '%MUJER%' and upper(nombre) not like '%HOMBRE%' then 'F' end as sexo_req
    from public.tipos_ticket where solo_miembros
), res as (   -- reservas vivas (pagado o pendiente) de entradas de miembros
  select p.id as pedido, p.estado, p.created_at, tt.id as ticket, tt.nombre as entrada, tt.genero, tt.sexo_req,
         c.id as cuenta, coalesce(c.email, p.email_cliente) as correo, c.sexo, c.universidad, coalesce(c.extranjero, false) as ext,
         case when coalesce(c.extranjero, false) then regexp_replace(upper(coalesce(c.rut, '')), '[^0-9A-Z]', '', 'g')
              else public.rut_limpio(c.rut) end as doc_cuenta,
         case when coalesce(c.extranjero, false) then regexp_replace(upper(coalesce(ip.personas -> 0 ->> 'rut', ip.rut_asistente, '')), '[^0-9A-Z]', '', 'g')
              else public.rut_limpio(coalesce(ip.personas -> 0 ->> 'rut', ip.rut_asistente)) end as doc_entrada,
         exists (select 1 from public.reservas_miembros r where r.pedido_id = p.id and r.tipo_ticket_id = tt.id and r.liberada_at is null) as con_candado
    from public.items_pedido ip
    join tt on tt.id = ip.tipo_ticket_id
    join public.pedidos p on p.id = ip.pedido_id and p.estado in ('pagado', 'pendiente')
    left join public.clientes c on c.id = p.cliente_id
)
select '1 resumen por entrada' as seccion, (select jsonb_agg(jsonb_build_object('entrada', t.nombre, 'publico', t.genero, 'estado', t.estado,
         'cupos_libres', t.disponible, 'reservas_vivas', (select count(*) from res where res.ticket = t.id),
         'candados_activos', (select count(*) from public.reservas_miembros r where r.tipo_ticket_id = t.id and r.liberada_at is null)) order by t.id) from tt t) as v
union all select '⚠️ 2 sexo no corresponde', (select jsonb_agg(to_jsonb(r)) from res r where r.sexo_req is not null and r.sexo is distinct from r.sexo_req)
union all select '⚠️ 3 universitaria sin institución', (select jsonb_agg(to_jsonb(r)) from res r where r.genero = 'U' and upper(btrim(coalesce(r.universidad, ''))) in ('', 'NO SOY ESTUDIANTE'))
union all select '⚠️ 4 regalada (RUT distinto a la cuenta)', (select jsonb_agg(to_jsonb(r)) from res r where r.doc_entrada is distinct from r.doc_cuenta)
union all select '⚠️ 5 sin cuenta', (select jsonb_agg(to_jsonb(r)) from res r where r.cuenta is null)
union all select '⚠️ 6 más de una por cuenta o RUT', (select jsonb_agg(x) from (
         select jsonb_build_object('ticket', ticket, 'cuenta', cuenta, 'pedidos', jsonb_agg(pedido)) as x from res where cuenta is not null group by ticket, cuenta having count(*) > 1
         union all
         select jsonb_build_object('ticket', ticket, 'rut', doc_cuenta, 'pedidos', jsonb_agg(pedido)) from res where coalesce(doc_cuenta, '') <> '' group by ticket, doc_cuenta having count(distinct cuenta) > 1) z)
union all select '⚠️ 7 reserva viva sin candado', (select jsonb_agg(jsonb_build_object('pedido', pedido, 'entrada', entrada, 'correo', correo)) from res where not con_candado)
union all select '⚠️ 8 candado activo de pedido que ya no vale', (select jsonb_agg(jsonb_build_object('pedido', r.pedido_id, 'estado', coalesce(p.estado, '(borrado)')))
         from public.reservas_miembros r left join public.pedidos p on p.id = r.pedido_id
        where r.liberada_at is null and (p.id is null or p.estado not in ('pagado', 'pendiente')))
union all select '9 cuentas por sexo', (select jsonb_object_agg(coalesce(sexo, 'sin dato'), n) from (select sexo, count(*) n from public.clientes group by 1) s);
