-- === activar socio · PARTE 3 de 3 ===
-- En orden. Cada parte queda entera.

-- ── 4) El potencial que tienes esperando ──
-- Gente que ya te compró y todavía no es socia.
select count(distinct lower(btrim(email_cliente)))                      as compradores_sin_cuenta,
       to_char(sum(coalesce(total_pagado,0)), 'FM$999G999G999')         as ya_te_pagaron
from public.pedidos p
where p.estado='pagado' and coalesce(p.total_pagado,0) > 0
  and not exists (select 1 from public.clientes c
                  where lower(btrim(c.email)) = lower(btrim(p.email_cliente)));

-- ============================================================
-- El crédito quedó en $2.000. Súbelo o bájalo en Configuración →
-- Valores & reglas (`socio_credito_bienvenida`). Ponlo en 0 si por ahora
-- solo quieres que reconozca el historial sin regalar plata.
-- ============================================================
