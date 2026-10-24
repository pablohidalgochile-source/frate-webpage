-- 🔁 LAS LISTAS DE CUMPLEAÑOS PASAN A SU ANFITRIÓN  ·  proyecto WEB
-- ⚠️ ESTE SÍ CAMBIA DATOS. Léelo antes de correrlo.
--
-- QUÉ HACE:
--   El cumpleañero se guarda en `inviter_nombre` —que es lo que ve el
--   invitado en la página («Te invita · …», lista.html:272)— y el dueño pasa
--   a ser el anfitrión que lo atendió: el responsable de la ficha si está
--   escrito, o Aileen Caro, que hizo ese trabajo.
--
-- POR QUÉ TAMBIÉN TOCA duenio_id:
--   La vista del informe resuelve `coalesce(duenio_id, cuenta_de_texto(nombre))`.
--   Si el id tiene algo, GANA sobre el texto y cambiar solo el nombre no
--   movería nada. Por eso se reasigna a la cuenta del anfitrión — y si esa
--   cuenta no existe, se deja en null para que el texto mande.
--
-- QUÉ NO TOCA: el nombre de la lista, los inscritos, los QR, los cupos, ni
--   ninguna lista que no sea CUMPLE- o RESERVA-.

-- ── 1 · Guardar al cumpleañero donde el invitado lo va a seguir viendo ──
update public.listas l
   set inviter_nombre = l.duenio_nombre
 where (l.codigo like 'CUMPLE-%' or l.codigo like 'RESERVA-%')
   and l.eliminada_at is null
   and l.inviter_nombre is null
   and nullif(btrim(l.duenio_nombre), '') is not null;

-- ── 2 · El dueño pasa a ser el anfitrión ──────────────────────────
update public.listas l
   set duenio_nombre = a.anfitrion,
       duenio_id     = public.rrpp_cuenta_de_texto(a.anfitrion)
  from (
    select l2.id,
           coalesce(nullif(btrim(f.gestion->>'responsable'), ''), 'Aileen Caro') as anfitrion
    from public.listas l2
    left join public.formularios f on f.gestion->>'lista_codigo' = l2.codigo
    where (l2.codigo like 'CUMPLE-%' or l2.codigo like 'RESERVA-%')
      and l2.eliminada_at is null
  ) a
 where a.id = l.id;


-- ── Chequeo · cómo quedó ──────────────────────────────────────────
select l.duenio_nombre                                   as anfitrion,
       count(*)                                          as listas,
       count(*) filter (where l.duenio_id is not null)    as con_cuenta,
       sum((select count(*) from public.lista_inscritos li
             where li.lista_id = l.id))                   as inscritos,
       count(*) filter (where l.inviter_nombre is null)   as sin_invitador
from public.listas l
where (l.codigo like 'CUMPLE-%' or l.codigo like 'RESERVA-%')
  and l.eliminada_at is null
group by 1
order by 2 desc;
