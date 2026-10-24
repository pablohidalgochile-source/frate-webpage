-- ============================================================
-- FRATE — CORTESÍA MASIVA + CONDICIONES DE ENTRADA
-- Corre en el proyecto WEB: ydwlpraoaaijlfssevoh
-- SQL Editor: https://supabase.com/dashboard/project/ydwlpraoaaijlfssevoh/sql/new
-- Depende de: frate-crm.sql (tablas listas / lista_inscritos)
-- ============================================================

-- ── 1) LISTA_INSCRITOS: datos de captación + resultado del pre-análisis IA ──
alter table public.lista_inscritos add column if not exists genero          text;   -- 'F' | 'M' | 'X' | null
alter table public.lista_inscritos add column if not exists universidad     text;
alter table public.lista_inscritos add column if not exists direccion       text;
alter table public.lista_inscritos add column if not exists fecha_nacimiento date;
alter table public.lista_inscritos add column if not exists precheck        jsonb;   -- {semaforo, genero_probable, confianza, flags:[]}

-- ── 2) LISTAS: condiciones del tipo + dueño legible (Anfitriona / RRPP) ──
alter table public.listas add column if not exists condiciones     jsonb;
alter table public.listas add column if not exists duenio_nombre   text;             -- etiqueta cuando el dueño no tiene cuenta (Anfitriona / Embajadora Cotty)
alter table public.listas add column if not exists genero_esperado text;             -- restricción: 'F' para listas de mujeres
alter table public.listas add column if not exists tipo            text default 'cortesia'; -- cortesia | convenio | concurso ...

-- ── 3) TIPOS_TICKET: condiciones por defecto (semilla del catálogo, Fase 3) ──
alter table public.tipos_ticket add column if not exists condiciones jsonb;

-- ── 4) ITEMS_PEDIDO: SNAPSHOT de condiciones en cada entrada emitida (el QR) ──
alter table public.items_pedido add column if not exists condiciones jsonb;

-- Forma del jsonb `condiciones` (documentado, no forzado por CHECK):
-- {
--   "titulo": "LISTA VIP AIRE (VÁLIDA HASTA LAS 02:30 HRS)",
--   "hora_max_llegada": "00:00",                    -- HH:MM hora Chile; el validador la hace cumplir
--   "valido_hasta": "2026-07-10T02:30:00-04:00",    -- opcional, datetime absoluto
--   "dias_validos": ["jueves"],                     -- informativo
--   "transferible": false,                          -- si false, el RUT del QR debe calzar en puerta
--   "zona": "general",                              -- general | vip | cumple
--   "edad_minima": 18,
--   "texto": "No transferible. Cédula física. Exclusivo mujeres Embajadora Cotty.",
--   "beneficios": "Trago de cortesía",
--   "restricciones": "Exclusivo mujeres"
-- }

-- ── 4b) PUERTA: puerta_check_qr ahora devuelve las condiciones del QR ──
--      (mismo cuerpo que frate-eventos-v2.sql + campo 'condiciones')
create or replace function public.puerta_check_qr(p_qr text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item items_pedido%rowtype;
  v_pedido pedidos%rowtype;
  v_usado qr_usados%rowtype;
  v_idx int;
  v_persona json;
begin
  if not puerta_rol_ok() then return json_build_object('error','Sin permiso de puerta'); end if;

  select * into v_item from items_pedido where qr_ids ? p_qr limit 1;
  if not found then return json_build_object('ok', false, 'motivo', 'QR no existe'); end if;

  select * into v_pedido from pedidos where id = v_item.pedido_id;
  if v_pedido.estado <> 'pagado' then
    return json_build_object('ok', false, 'motivo', 'Pedido no pagado (estado: '||coalesce(v_pedido.estado,'—')||')');
  end if;

  select i-1 into v_idx from jsonb_array_elements_text(v_item.qr_ids) with ordinality t(qr, i) where t.qr = p_qr;
  v_persona := coalesce(v_item.personas -> v_idx, 'null'::jsonb)::json;

  select * into v_usado from qr_usados where qr_id = p_qr;

  return json_build_object(
    'ok', true,
    'ya_usado', found,
    'usado_at', v_usado.created_at,
    'incidencia', v_usado.incidencia,
    'pedido_id', v_pedido.id,
    'orden', 'FCC-'||lpad(v_pedido.id::text, 6, '0'),
    'comprador', v_pedido.nombre_cliente,
    'email', v_pedido.email_cliente,
    'evento_id', v_item.evento_id,
    'nombre_evento', v_item.nombre_evento,
    'nombre_ticket', v_item.nombre_ticket,
    'condiciones', v_item.condiciones,
    'persona', v_persona
  );
end; $$;
grant execute on function public.puerta_check_qr(text) to authenticated;

-- ── 5) Verificación ──────────────────────────────────────────
select 'lista_inscritos.genero'    as check, case when exists(select 1 from information_schema.columns where table_name='lista_inscritos' and column_name='genero')          then 'OK' else 'FALTA' end
union all select 'lista_inscritos.precheck',  case when exists(select 1 from information_schema.columns where table_name='lista_inscritos' and column_name='precheck')        then 'OK' else 'FALTA' end
union all select 'lista_inscritos.fecha_nac', case when exists(select 1 from information_schema.columns where table_name='lista_inscritos' and column_name='fecha_nacimiento') then 'OK' else 'FALTA' end
union all select 'listas.condiciones',        case when exists(select 1 from information_schema.columns where table_name='listas'          and column_name='condiciones')       then 'OK' else 'FALTA' end
union all select 'listas.duenio_nombre',      case when exists(select 1 from information_schema.columns where table_name='listas'          and column_name='duenio_nombre')     then 'OK' else 'FALTA' end
union all select 'tipos_ticket.condiciones',  case when exists(select 1 from information_schema.columns where table_name='tipos_ticket'    and column_name='condiciones')       then 'OK' else 'FALTA' end
union all select 'items_pedido.condiciones',  case when exists(select 1 from information_schema.columns where table_name='items_pedido'    and column_name='condiciones')       then 'OK' else 'FALTA' end;

-- ============================================================
-- LISTO. No borra ni altera datos existentes (solo ADD COLUMN IF NOT EXISTS).
-- ============================================================
