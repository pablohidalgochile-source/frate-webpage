-- 📧 ¿CUÁNTOS CORREOS FALLARON? — y a quién le costó su entrada
-- Proyecto WEB (ydwlpraoaaijlfssevoh)
--
-- ⚠️ NO CAMBIA NADA. Solo mira. UNA SOLA consulta.
--
-- CORRIJO ALGO QUE TE DIJE MAL:
--   Te dije que no había registro de correos fallidos. Sí lo hay. La
--   función `resend-webhook` está desplegada y activa desde el 27-jul y
--   guarda cada rebote en `email_rebotes`, y el admin ya tiene pantalla
--   para verlos. Lo que NO existe es registro de los que sí salieron
--   bien — eso sigue siendo cierto y es otra cosa.
--
-- ⚠️ OJO CON EL CERO:
--   Si esto devuelve 0 rebotes, hay DOS explicaciones y no son lo mismo:
--     a) de verdad no rebotó ninguno, o
--     b) Resend nunca fue configurado para avisarle a nuestra función.
--   Eso se confirma en Resend → Webhooks: tiene que haber un endpoint
--   apuntando a la función `resend-webhook` con los eventos
--   email.bounced y email.complained activados. Si no está ahí, la
--   tabla va a estar vacía aunque hayan rebotado cien.
--
-- LA FILA QUE IMPORTA es «pagaron y su correo rebotó»: esa es gente que
-- te pagó y probablemente nunca recibió su QR.

select concepto, cuantos, detalle from (

  select 1 as orden,
         'Rebotes registrados en total'                        as concepto,
         count(*)                                              as cuantos,
         coalesce(to_char(max(ultimo_at) at time zone 'America/Santiago',
                          'DD-MM-YYYY HH24:MI'), 'nunca')      as detalle
  from public.email_rebotes

  union all
  select 2, 'Todavía sin resolver', count(*),
         coalesce(string_agg(distinct tipo, ', '), '—')
  from public.email_rebotes where not coalesce(resuelto, false)

  union all
  select 3, '🚨 PAGARON y su correo rebotó', count(distinct p.id),
         coalesce(string_agg(distinct p.email_cliente, ', '), 'ninguno')
  from public.pedidos p
  join public.email_rebotes r on lower(btrim(r.email)) = lower(btrim(p.email_cliente))
  where p.estado = 'pagado'

  union all
  select 4, 'Pedidos pagados en total (para comparar)', count(*), ''
  from public.pedidos where estado = 'pagado'

  union all
  select 5, 'Correos distintos a los que se les vendió', count(distinct lower(btrim(email_cliente))), ''
  from public.pedidos
  where estado = 'pagado' and coalesce(btrim(email_cliente),'') <> ''

) t order by orden;
