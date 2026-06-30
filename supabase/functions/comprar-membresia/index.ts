// ============================================================
// FRATE — Edge Function: comprar-membresia
// Crea un pedido para un pase de membresía (pago único) y la
// preferencia de pago en MercadoPago. La membresía se activa
// cuando el pago se confirma (mp-webhook).
//
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL = 'https://frate.cl';

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

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { membresiaId, comprador } = await req.json() as {
      membresiaId: number;
      comprador: { nombre: string; email: string; clienteId?: string };
    };
    if (!membresiaId) throw new Error('Falta la membresía.');
    if (!comprador?.email || !comprador?.nombre) throw new Error('Faltan datos del comprador.');
    if (!comprador?.clienteId) throw new Error('Debes iniciar sesión para comprar una membresía.');

    // Precio autoritativo desde la BD
    const { data: mem } = await sb.from('membresias').select('*').eq('id', membresiaId).eq('activo', true).maybeSingle();
    if (!mem) throw new Error('Membresía no disponible.');

    // Crear pedido pendiente (marcado como compra de membresía)
    const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
      cliente_id:     comprador.clienteId,
      nombre_cliente: comprador.nombre,
      email_cliente:  comprador.email,
      estado:         'pendiente',
      total:          mem.precio,
      total_pagado:   mem.precio,
      fee_servicio:   0,
      metodo_pago:    'mercadopago',
      membresia_id:   mem.id,
    }).select().single();
    if (e1) throw e1;

    const pref = {
      items: [{ id: String(mem.id), title: `Membresía Frate — ${mem.nombre}`, quantity: 1, currency_id: 'CLP', unit_price: mem.precio }],
      payer: { name: comprador.nombre, email: comprador.email },
      external_reference: String(pedido.id),
      back_urls: {
        success: `${SITE_URL}/pago-exitoso.html`,
        pending: `${SITE_URL}/pago-pendiente.html`,
        failure: `${SITE_URL}/pago-error.html`,
      },
      auto_return: 'approved',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      statement_descriptor: 'FRATE',
    };
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      await sb.from('pedidos').delete().eq('id', pedido.id);
      throw new Error(mpData.message || 'Error creando preferencia MercadoPago');
    }
    await sb.from('pedidos').update({ referencia_pago: `PREF-${mpData.id}` }).eq('id', pedido.id);

    return new Response(JSON.stringify({ ok: true, pedidoId: pedido.id, initPoint: mpData.init_point }), { headers: cors });
  } catch (err) {
    console.error('[comprar-membresia]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: cors });
  }
});
