// ============================================================
// FRATE — Edge Function: crear-pago
// 1) Re-calcula el total en el SERVIDOR desde la base de datos
//    (NUNCA confía en el precio que manda el navegador).
// 2) Valida stock disponible.
// 3) Crea el pedido en estado 'pendiente' + items_pedido con QR ids.
// 4) Crea una preferencia de pago en MercadoPago (Checkout Pro).
// 5) Devuelve el init_point (URL de pago) para redirigir al usuario.
//
// Secrets requeridos:
//   MP_ACCESS_TOKEN          (de MercadoPago — TEST-... o APP_USR-...)
//   SUPABASE_URL             (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL = 'https://frate.cl';
const FEE_PCT  = 0.04; // cargo por servicio 4%

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

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Limpieza oportunista: marca como 'expirado' los pedidos que quedaron
    // pendientes hace más de 30 min (compras abandonadas / links MP vencidos).
    // Así no se acumulan en el admin ni en los perfiles. No bloquea el flujo.
    const hace30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await sb.from('pedidos').update({ estado: 'expirado' })
      .eq('estado', 'pendiente').lt('created_at', hace30min);

    const { items, comprador, codigo } = await req.json() as {
      items: any[];
      comprador: { nombre: string; email: string; tel?: string; rut?: string; clienteId?: string };
      codigo?: string | null;
    };

    if (!items?.length) throw new Error('Carrito vacío');
    if (!comprador?.email || !comprador?.nombre) throw new Error('Faltan datos del comprador');

    // ── 1) Re-precio desde la base de datos ──────────────────────
    // Carga precios reales de tickets, carta y tiendita.
    const ttIds   = [...new Set(items.filter(i => i.ttId).map(i => Number(i.ttId)))];
    const cartaId = [...new Set(items.filter(i => i.tipo === 'carta' && i.productoId).map(i => Number(i.productoId)))];
    const merchId = [...new Set(items.filter(i => i.tipo === 'merch' && i.productoId).map(i => Number(i.productoId)))];

    const [ttRes, cartaRes, merchRes] = await Promise.all([
      ttIds.length   ? sb.from('tipos_ticket').select('id,nombre,precio,disponible,estado').in('id', ttIds)   : { data: [] },
      cartaId.length ? sb.from('carta').select('id,nombre,precio').in('id', cartaId)                          : { data: [] },
      merchId.length ? sb.from('tiendita').select('id,nombre,precio,stock').in('id', merchId)                 : { data: [] },
    ]);
    const ttMap    = new Map((ttRes.data    || []).map((r: any) => [r.id, r]));
    const cartaMap = new Map((cartaRes.data || []).map((r: any) => [r.id, r]));
    const merchMap = new Map((merchRes.data || []).map((r: any) => [r.id, r]));

    // ── 2) Validar stock + construir filas con precio autoritativo ──
    let total = 0;
    const errores: string[] = [];
    const itemsValidados: any[] = [];

    for (const i of items) {
      const cantidad = Math.max(1, Number(i.cantidad) || 1);
      let precio = 0, nombre = i.nombre || 'Producto';

      if (i.ttId) {
        const tt: any = ttMap.get(Number(i.ttId));
        if (!tt) { errores.push(`"${i.nombre}" ya no está disponible.`); continue; }
        if (tt.estado === 'Agotado' || tt.estado === 'Cerrado') { errores.push(`"${tt.nombre}": ${tt.estado.toLowerCase()}.`); continue; }
        if (tt.disponible < cantidad) { errores.push(`"${tt.nombre}": solo quedan ${tt.disponible}.`); continue; }
        precio = tt.precio; nombre = tt.nombre;
      } else if (i.tipo === 'carta') {
        const c: any = cartaMap.get(Number(i.productoId));
        if (!c) { errores.push(`"${i.nombre}" ya no está en la carta.`); continue; }
        precio = c.precio; nombre = c.nombre;
      } else if (i.tipo === 'merch') {
        const m: any = merchMap.get(Number(i.productoId));
        if (!m) { errores.push(`"${i.nombre}" ya no está en la tiendita.`); continue; }
        if ((m.stock ?? 0) < cantidad) { errores.push(`"${m.nombre}": sin stock suficiente.`); continue; }
        precio = m.precio; nombre = m.nombre;
      } else {
        errores.push(`"${i.nombre}": tipo de producto desconocido.`); continue;
      }

      total += precio * cantidad;
      itemsValidados.push({ ...i, cantidad, _precio: precio, _nombre: nombre });
    }

    if (errores.length) {
      return new Response(JSON.stringify({ error: errores.join(' · ') }), { status: 409, headers: cors });
    }

    // Validar código (descuento / RRPP) en el SERVIDOR
    let codigoRow: any = null;
    let descuento = 0;
    if (codigo) {
      const { data: cdata } = await sb.from('codigos')
        .select('*').eq('codigo', String(codigo).trim().toUpperCase()).eq('activo', true).maybeSingle();
      if (cdata && (cdata.max_usos == null || cdata.usos < cdata.max_usos)) {
        const aplica = !cdata.evento_id || itemsValidados.some(i => Number(i.eventoId) === cdata.evento_id);
        if (aplica) {
          codigoRow = cdata;
          if (cdata.descuento_tipo === 'porcentaje') descuento = Math.round(total * (cdata.descuento_valor || 0) / 100);
          else if (cdata.descuento_tipo === 'monto')  descuento = Math.min(cdata.descuento_valor || 0, total);
        }
      }
    }

    const base        = total - descuento;          // subtotal con descuento aplicado
    const fee         = Math.round(base * FEE_PCT);  // fee sobre el monto con descuento
    const totalPagado = base + fee;

    // ── 3) Crear pedido pendiente ────────────────────────────────
    const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
      cliente_id:     comprador.clienteId || null,
      nombre_cliente: comprador.nombre,
      email_cliente:  comprador.email,
      estado:         'pendiente',
      total:          base,
      descuento:      descuento,
      codigo_id:      codigoRow?.id || null,
      codigo_texto:   codigoRow?.codigo || null,
      fee_servicio:   fee,
      total_pagado:   totalPagado,
      metodo_pago:    'mercadopago',
    }).select().single();
    if (e1) throw e1;

    // items_pedido con QR ids — el índice de línea (lineIdx) garantiza
    // que NUNCA se repita un código aunque dos líneas compartan el mismo
    // tipo de ticket. El índice u (dentro de la línea) mapea a personas[u].
    const rows = itemsValidados.map((i, lineIdx) => {
      const isTicket = !!i.ttId;
      const isCarta  = i.tipo === 'carta';
      const isMerch  = i.tipo === 'merch';
      const personas = Array.isArray(i.personas) ? i.personas : [];
      const qrIds: string[] = [];
      const key = i.ttId || i.productoId || i.tipo;
      for (let u = 0; u < i.cantidad; u++) qrIds.push(`FCC-${pedido.id}-${key}-${lineIdx}-${u}`);
      return {
        pedido_id:        pedido.id,
        producto_tipo:    isTicket ? 'ticket' : (isCarta ? 'carta' : (isMerch ? 'merch' : 'otro')),
        producto_id:      isTicket ? null : (i.productoId || null),
        evento_id:        isTicket ? i.eventoId : null,
        tipo_ticket_id:   isTicket ? Number(i.ttId) : null,
        nombre_evento:    isTicket ? i._nombre : null,
        nombre_ticket:    isTicket ? i.tipo : i._nombre,
        detalle:          i.detalle || null,
        cantidad:         i.cantidad,
        precio_unitario:  i._precio,
        personas,
        qr_ids:           qrIds,
        nombre_asistente: personas[0]?.nombre || '',
        rut_asistente:    personas[0]?.rut    || '',
      };
    });
    const { error: e2 } = await sb.from('items_pedido').insert(rows);
    if (e2) { await sb.from('pedidos').delete().eq('id', pedido.id); throw e2; }

    // ── 4) Crear preferencia en MercadoPago ──────────────────────
    const pref = {
      items: [{
        id:          String(pedido.id),
        title:       `Entradas Frate — Orden #${pedido.id}`,
        quantity:    1,
        currency_id: 'CLP',
        unit_price:  totalPagado,
      }],
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
      // limpiar pedido huérfano si MP falla
      await sb.from('items_pedido').delete().eq('pedido_id', pedido.id);
      await sb.from('pedidos').delete().eq('id', pedido.id);
      throw new Error(mpData.message || 'Error creando preferencia MercadoPago');
    }

    // Guardar el preference_id para referencia
    await sb.from('pedidos').update({ referencia_pago: `PREF-${mpData.id}` }).eq('id', pedido.id);

    return new Response(JSON.stringify({
      ok:        true,
      pedidoId:  pedido.id,
      initPoint: mpData.init_point,
      total:     totalPagado,
    }), { headers: cors });

  } catch (err) {
    console.error('[crear-pago]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: cors });
  }
});
