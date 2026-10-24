-- ============================================================
-- FRATE — Validez por tipo de ticket + PIN de admin en la puerta
-- Cada tipo de ticket puede tener su HORA MÁXIMA DE INGRESO:
--   • absoluta:  "02:00"  (válido hasta las 2 AM)
--   • relativa:  "-60"    (60 min antes del cierre del evento)
-- La puerta AVISA y BLOQUEA fuera de esa hora; el portero puede
-- "Autorizar igual" ingresando el PIN de admin (queda registrado).
-- Correr en el Supabase de la WEB (ydwlpraoaaijlfssevoh) → SQL Editor.
-- ============================================================

alter table public.tipos_ticket add column if not exists hora_max_ingreso text;

insert into public.config_valores (clave, valor)
values ('admin_pin', '')
on conflict (clave) do nothing;

select 'validez_ticket' as check,
       case when exists (select 1 from information_schema.columns
             where table_name='tipos_ticket' and column_name='hora_max_ingreso')
            then 'OK' else 'FALTA' end as col,
       (select valor is not null from config_valores where clave='admin_pin') as pin_row;
