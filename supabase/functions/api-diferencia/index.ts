// ============================================================
// FRATE — api-diferencia
// El POS consulta y cobra los tickets de diferencia que emite el
// anfitrión en la puerta.
//
//   GET  ?codigo=DIF-000042   → consultar. NO ESCRIBE NADA.
//   POST {codigo, ref_venta, monto} → cobrar. Idempotente por ref_venta.
//
// 🔒 Solo server-a-server. La llave de estación va en Authorization y
//    NUNCA puede viajar al navegador. De este lado se compara el HASH,
//    así una filtración de esta base no entrega llaves usables.
//
// ⚠️ El import va fijo en @2.111.0 a propósito: `@2` resuelve a la
//    2.112.1, que esm.sh no puede servir, y el deploy de CUALQUIER
//    función falla con «Module not found auth-js».
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── La llave de estación ────────────────────────────────────
    const raw = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw.startsWith('pos_')) return j({ ok: false, error: 'sin_llave' }, 401);

    const { data: code } = await admin.rpc('pos_llave_code', { p_hash: await sha256(raw) });
    if (!code) return j({ ok: false, error: 'llave_invalida' }, 401);

    // ── CONSULTAR · no escribe ──────────────────────────────────
    if (req.method === 'GET') {
      const codigo = (new URL(req.url).searchParams.get('codigo') || '').trim().toUpperCase();
      if (!codigo) return j({ ok: false, error: 'falta_codigo' }, 400);

      const { data: d } = await admin.from('tickets_diferencia')
        .select('*').eq('codigo', codigo).maybeSingle();
      if (!d) return j({ ok: false, error: 'no_existe' }, 404);
      if (d.estado === 'anulado') return j({ ok: false, error: 'anulado' }, 409);
      if (d.estado === 'pagado') {
        return j({ ok: false, error: 'ya_pagado', pagado_at: d.pagado_at, ref_venta: d.ref_venta }, 409);
      }
      if (d.vence_at && new Date(d.vence_at) < new Date()) {
        return j({ ok: false, error: 'vencido', vence_at: d.vence_at }, 409);
      }

      const { data: ev } = await admin.from('eventos')
        .select('nombre,fecha').eq('id', d.evento_id).maybeSingle();

      return j({
        ok: true,
        codigo: d.codigo, estado: d.estado, monto: d.monto,
        evento_id: d.evento_id, evento: ev?.nombre || null, fecha_evento: ev?.fecha || null,
        persona: d.persona, rut: d.rut, qr_id: d.qr_id, pedido_id: d.pedido_id,
        motivo: d.motivo,
        ticket_actual:  { nombre: d.ticket_actual,  precio: d.precio_actual },
        ticket_destino: { nombre: d.ticket_destino, precio: d.precio_destino },
        emitido_por: d.emitido_por, emitido_at: d.emitido_at, vence_at: d.vence_at,
      });
    }

    // ── COBRAR · idempotente por ref_venta ──────────────────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const codigo = String(body.codigo || '').trim().toUpperCase();
      const ref    = body.ref_venta != null ? String(body.ref_venta).trim() : null;
      const monto  = body.monto != null ? Number(body.monto) : null;
      if (!codigo) return j({ ok: false, error: 'falta_codigo' }, 400);
      if (!ref)    return j({ ok: false, error: 'falta_ref_venta' }, 400);

      const { data: d } = await admin.from('tickets_diferencia')
        .select('*').eq('codigo', codigo).maybeSingle();
      if (!d) return j({ ok: false, error: 'no_existe' }, 404);
      if (d.estado === 'anulado') return j({ ok: false, error: 'anulado' }, 409);

      // Misma venta = misma respuesta. Un reintento del POS no cobra dos veces.
      if (d.estado === 'pagado') {
        if (d.ref_venta && d.ref_venta === ref) {
          return j({ ok: true, estado: 'pagado', codigo: d.codigo, monto: d.monto,
                     qr_habilitado: d.qr_id, repetido: true });
        }
        return j({ ok: false, error: 'ya_pagado', pagado_at: d.pagado_at, ref_venta: d.ref_venta }, 409);
      }
      if (d.vence_at && new Date(d.vence_at) < new Date()) {
        return j({ ok: false, error: 'vencido', vence_at: d.vence_at }, 409);
      }
      // El monto VERIFICA, no fija. Protege contra cobrar de menos por
      // un dato viejo en la pantalla de la caja.
      if (monto != null && monto !== d.monto) {
        return j({ ok: false, error: 'monto_no_calza', monto: d.monto }, 409);
      }

      // La condición `estado = 'pendiente'` es la que evita la carrera:
      // si dos cajas cobran a la vez, la segunda no actualiza ninguna fila.
      const { data: upd } = await admin.from('tickets_diferencia')
        .update({ estado: 'pagado', ref_venta: ref,
                  pagado_por: 'POS ' + code, pagado_at: new Date().toISOString() })
        .eq('id', d.id).eq('estado', 'pendiente').select('id').maybeSingle();

      if (!upd) {
        const { data: re } = await admin.from('tickets_diferencia')
          .select('ref_venta,pagado_at,monto,qr_id').eq('id', d.id).maybeSingle();
        if (re && re.ref_venta === ref) {
          return j({ ok: true, estado: 'pagado', codigo, monto: re.monto,
                     qr_habilitado: re.qr_id, repetido: true });
        }
        return j({ ok: false, error: 'ya_pagado', pagado_at: re?.pagado_at, ref_venta: re?.ref_venta }, 409);
      }

      return j({ ok: true, estado: 'pagado', codigo: d.codigo, monto: d.monto,
                 qr_habilitado: d.qr_id });
    }

    return j({ ok: false, error: 'metodo_no_permitido' }, 405);
  } catch (e) {
    return j({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
