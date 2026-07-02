// ============================================================
// FRATE — Edge Function: devolver-pago
// Hace la devolución REAL de un pago en MercadoPago
// (POST /v1/payments/{id}/refunds). Solo un admin puede llamarla.
// Marca el pedido como 'reembolsado'.
//
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurada');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verificar que quien llama es ADMIN
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: cors });
    const { data: perfil } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    if (perfil?.rol !== 'admin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403, headers: cors });

    const { pedidoId, modo } = await req.json() as { pedidoId: number; modo?: string };
    if (!pedidoId) throw new Error('Falta pedidoId');

    const { data: pedido } = await admin.from('pedidos').select('*').eq('id', pedidoId).single();
    if (!pedido) throw new Error('Pedido no encontrado');

    // ── Modo MANUAL: solo marcar como reembolsado ────────────────
    if (modo === 'manual') {
      await admin.from('pedidos').update({ estado: 'reembolsado', referencia_pago: (pedido.referencia_pago || '') + '-MANUAL' }).eq('id', pedidoId);
      return new Response(JSON.stringify({ ok: true, modo: 'manual' }), { headers: cors });
    }

    // ── Modo AUTOMÁTICO: devolver por MercadoPago ────────────────
    // Sacar el payment id de referencia_pago (formato 'MP-<id>' o 'MP-<id>-...')
    const ref = String(pedido.referencia_pago || '');
    const m = ref.match(/MP-(\d+)/);
    if (!m) return new Response(JSON.stringify({ error: 'Este pedido no tiene un pago de MercadoPago (no se puede devolver automático). Usa modo manual.' }), { status: 409, headers: cors });
    const paymentId = m[1];

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({}), // vacío = devolución total
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || 'MercadoPago rechazó la devolución', detalle: data }), { status: 502, headers: cors });
    }

    await admin.from('pedidos').update({ estado: 'reembolsado', referencia_pago: ref + '-REFUND' }).eq('id', pedidoId);
    return new Response(JSON.stringify({ ok: true, modo: 'automatico', refund_id: data.id, monto: data.amount }), { headers: cors });

  } catch (err) {
    console.error('[devolver-pago]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: cors });
  }
});
