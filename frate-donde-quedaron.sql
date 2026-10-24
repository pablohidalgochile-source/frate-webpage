-- 🔎 ¿DÓNDE QUEDARON LAS LISTAS DE CUMPLEAÑOS?  (SOLO LECTURA)
-- Y de paso: por qué todos siguen mostrando plata a pagar.

select
  -- ¿a qué cuenta resolvió «Aileen Caro»?
  (select coalesce('@'||c.username, btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')))
     from public.clientes c
    where c.id = public.rrpp_cuenta_de_texto('Aileen Caro'))          as aileen_es,
  (select coalesce('@'||c.username, btrim(coalesce(c.nombres,'')||' '||coalesce(c.apellidos,'')))
     from public.clientes c
    where c.id = public.rrpp_cuenta_de_texto('JAVIERA Hidalgo'))      as javiera_es,

  -- ¿cuántas listas de cumpleaños tiene cada dueño ahora?
  (select count(*) from public.listas
    where codigo like 'CUMPLE-%' and eliminada_at is null
      and duenio_id = public.rrpp_cuenta_de_texto('Aileen Caro'))     as cumples_de_aileen,
  (select count(*) from public.listas
    where codigo like 'CUMPLE-%' and eliminada_at is null
      and duenio_id is null)                                          as cumples_sin_cuenta,

  -- ¿por qué todos muestran plata? porque nadie está configurado todavía
  (select count(*) from public.rrpp_pago)                             as personas_configuradas,
  (select count(*) from public.rrpp_pago where paga = false)          as marcadas_no_paga,

  -- ¿el invitador quedó guardado? (lo que ve el invitado en el link)
  (select count(*) from public.listas
    where codigo like 'CUMPLE-%' and eliminada_at is null
      and inviter_nombre is not null)                                 as con_invitador_ok;
