-- Parte 2 · ¿está corrido el trigger que devuelve el cupo al cancelar?
select case when exists (
         select 1 from information_schema.columns
          where table_schema='public' and table_name='pedidos' and column_name='stock_reservado')
       then '✅ frate-reserva-cupo.sql corrido — cancelar devuelve el cupo'
       else '❌ NO corrido — cancelar mata el QR igual, pero el cupo no vuelve'
       end as trigger_de_cupo;
