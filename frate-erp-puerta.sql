-- ============================================================
-- FRATE — Puerta OFFLINE del ERP (contrato WEB↔ERP #2)
-- Traza en qué puerta (gate_id) y con qué hora de dispositivo se
-- quemó cada QR, e impone idempotencia dura por qr_id (un QR se
-- quema UNA vez; el resto de intentos vuelven como ya_usado).
--
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh).
-- La edge function api-crm YA funciona sin esto (degrada suave),
-- pero con esto queda el gate_id y la garantía de un solo uso.
-- ============================================================

-- 1) Columnas nuevas en qr_usados
alter table public.qr_usados add column if not exists gate_id        text;
alter table public.qr_usados add column if not exists ts_dispositivo timestamptz;

-- 2) Idempotencia dura: un qr_id sólo puede quemarse una vez.
--    (Si esto falla por duplicados preexistentes, limpia con el bloque comentado de abajo.)
create unique index if not exists qr_usados_qr_id_uidx on public.qr_usados (qr_id);

-- 3) Verificación
select 'qr_usados.gate_id'        as check, case when exists(select 1 from information_schema.columns where table_name='qr_usados' and column_name='gate_id')        then 'OK' else 'FALTA' end
union all
select 'qr_usados.ts_dispositivo',        case when exists(select 1 from information_schema.columns where table_name='qr_usados' and column_name='ts_dispositivo') then 'OK' else 'FALTA' end
union all
select 'qr_usados_qr_id_uidx',            case when exists(select 1 from pg_indexes where indexname='qr_usados_qr_id_uidx')                                          then 'OK' else 'FALTA' end;

-- ── Sólo si el paso 2 falla por duplicados (quema doble histórica): ──
-- with dups as (
--   select ctid, row_number() over (partition by qr_id order by created_at) rn from public.qr_usados
-- ) delete from public.qr_usados where ctid in (select ctid from dups where rn > 1);
-- luego re-corre el create unique index de arriba.
