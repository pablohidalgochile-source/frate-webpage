-- ↩️ DESHACER la clasificación en tres grupos. Solo si no te gustó.
-- Deja el informe exactamente como estaba: una sola lista, todos cobrando.

-- 1) Deshace SOLO las uniones que hizo el script (las tuyas a mano quedan).
delete from public.rrpp_alias where unido_por = 'clasificación automática';

-- 2) Deshace SOLO la clasificación automática (lo que editaste con ⚙️ queda).
delete from public.rrpp_pago where nota in ('clasificado automáticamente','la caja del local');

-- 3) Devuelve el informe a la versión sin `grupo`.
--    (la pantalla lo aguanta: si no viene, todos caen en "por clasificar")
alter table public.rrpp_pago drop column if exists grupo;

select 'revertido' as estado,
       (select count(*) from public.rrpp_alias) as alias_que_quedan,
       (select count(*) from public.rrpp_pago)  as reglas_de_pago_que_quedan;
