-- ============================================================
-- FRATE · TECHO Y ALARMA PARA LAS CORTESÍAS
-- Proyecto WEB (ydwlpraoaaijlfssevoh) · SQL Editor
--
-- HOY: no existe ningún tope. Alguien puede emitir 300 cortesías en una noche
-- y en el panel se ven exactamente igual que 20. Nadie se entera hasta que
-- alguien va a mirar — y nadie va a mirar.
--
-- ESTO NO PROHÍBE NADA. Pone un techo por evento y hace que pasarlo sea una
-- decisión consciente, con nombre. Regalar entradas es parte del negocio; lo
-- que no puede ser es que se regalen sin que nadie lo note.
--
-- Idempotente.
-- ============================================================

-- ── 1) El techo, por evento (null = usa el general) ──
alter table public.eventos add column if not exists tope_cortesias int;

-- Techo general, editable desde Configuración → Valores & reglas.
insert into public.config_valores(clave, valor)
select 'tope_cortesias_default', '250'
where not exists (select 1 from public.config_valores where clave = 'tope_cortesias_default');


-- ── 2) Cuántas cortesías lleva un evento y cuánto le queda ──
create or replace function public.cortesias_estado(p_evento_id int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_emitidas int; v_tope int;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') not in ('admin','rrpp','portero') then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  -- Cortesía = entrada a $0. Se cuenta por UNIDAD (cada QR), no por pedido:
  -- un pedido de cortesía puede traer 40 personas.
  select coalesce(sum(jsonb_array_length(coalesce(ip.qr_ids, '[]'::jsonb))), 0)
    into v_emitidas
    from public.items_pedido ip
    join public.pedidos p on p.id = ip.pedido_id
   where ip.evento_id = p_evento_id
     and p.estado in ('pagado')
     and coalesce(ip.precio_unitario, 0) = 0;

  select coalesce(e.tope_cortesias,
                  (select nullif(valor,'')::int from public.config_valores where clave='tope_cortesias_default'),
                  250)
    into v_tope
    from public.eventos e where e.id = p_evento_id;

  return jsonb_build_object(
    'ok', true, 'emitidas', v_emitidas, 'tope', v_tope,
    'restantes', greatest(0, v_tope - v_emitidas),
    'pct', case when v_tope > 0 then round(v_emitidas * 100.0 / v_tope) else 0 end,
    'pasado', v_emitidas >= v_tope
  );
end; $$;
grant execute on function public.cortesias_estado(int) to authenticated;


-- ── 3) Pasarse del techo se registra como tal ──
-- No lo bloquea: lo deja escrito. Quien decide pasarse, firma.
create or replace function public.cortesias_registrar_exceso(
  p_evento_id int, p_cantidad int, p_motivo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rol text; v_est jsonb;
begin
  select rol into v_rol from public.clientes where id = auth.uid();
  if coalesce(v_rol,'') <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  v_est := public.cortesias_estado(p_evento_id);
  perform public.bitacora_registrar('cortesias_sobre_tope', null, p_evento_id, 0,
            jsonb_build_object('cantidad', p_cantidad, 'motivo', p_motivo,
                               'emitidas', v_est->>'emitidas', 'tope', v_est->>'tope'));
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.cortesias_registrar_exceso(int,int,text) to authenticated;


-- ── 4) Verificación ──
select 'columna tope_cortesias' as chequeo,
       case when exists(select 1 from information_schema.columns
                        where table_name='eventos' and column_name='tope_cortesias')
            then '✅ ok' else '❌ falta' end as estado
union all
select 'techo general en config',
       case when exists(select 1 from public.config_valores where clave='tope_cortesias_default')
            then '✅ ok' else '❌ falta' end
union all
select 'función cortesias_estado',
       case when exists(select 1 from pg_proc where proname='cortesias_estado') then '✅ ok' else '❌ falta' end
union all
select 'función cortesias_registrar_exceso',
       case when exists(select 1 from pg_proc where proname='cortesias_registrar_exceso') then '✅ ok' else '❌ falta' end;

-- ── 5) Cómo van tus eventos hoy (para calibrar el techo) ──
select e.nombre, e.fecha, coalesce(e.tope_cortesias, 250) as tope,
       coalesce(sum(jsonb_array_length(coalesce(ip.qr_ids,'[]'::jsonb))) filter
                (where coalesce(ip.precio_unitario,0) = 0), 0) as cortesias_emitidas
from public.eventos e
left join public.items_pedido ip on ip.evento_id = e.id
left join public.pedidos p on p.id = ip.pedido_id and p.estado = 'pagado'
where e.fecha >= current_date - 60
group by e.id, e.nombre, e.fecha, e.tope_cortesias
order by e.fecha desc
limit 10;

-- ============================================================
-- El techo por defecto quedó en 250. Mira el bloque 5 y ajústalo:
-- en BESUCONA fueron 215 y en A MI ME GUSTA 486. Si 486 era demasiado,
-- 250 es un buen techo. Si era normal, súbelo — un techo que se pasa
-- todas las semanas deja de significar algo.
-- ============================================================
