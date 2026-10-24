// ============================================================
// FRATE — Edge Function: mp-webhook
// Recibe la notificación de MercadoPago cuando hay un pago.
// VERIFICA el pago contra la API de MP (no confía en el aviso).
// Si está aprobado: marca el pedido 'pagado' (dispara el trigger de
// stock) y envía el comprobante con QRs por email.
// Idempotente: si el pedido ya está pagado, no hace nada.
//
// COBROS DE SERVICIO (cumpleaños / reservas del CRM, pedido origen 'crm' o
// con fila en crm_pagos): se separan ANTES que todo lo de entradas y nunca
// llevan tickets/QR/puntos/ruleta. La plata la decide _shared/cobros.ts
// (reconciliarCobro / devolverCobro, idempotentes por payment id). Ver
// webhookCobro más abajo.
//
// IMPORTANTE: esta función debe deployarse SIN verificación de JWT
// (verify_jwt = false en config.toml), porque MercadoPago no envía
// el apikey de Supabase.
//
// Secrets requeridos:
//   MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

// Versión FIJA y no `@2`: el 2026-08-04 `@2` empezó a resolver a la 2.112.1,
// que esm.sh no puede servir (su submódulo auth-js devuelve 404) y el deploy
// de CUALQUIER función fallaba. Con la versión clavada esto no vuelve a pasar
// por un cambio de terceros.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { avisarStaff } from '../_shared/avisar.ts';
import { anotarPagoEnCurso, devolverCobro, folioDeCobro, marcaAvisoOrden, reconciliarCobro } from '../_shared/cobros.ts';

Deno.serve(async (req: Request) => {
  // MP espera SIEMPRE un 200, si no reintenta. Capturamos todo y
  // respondemos 200 salvo errores que valga la pena reintentar.
  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) { console.error('[mp-webhook] sin MP_ACCESS_TOKEN'); return ok(); }

    // El payment id puede venir por query (?type=payment&data.id=) o por body.
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const topic   = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!paymentId) {
      try {
        const body = await req.json();
        paymentId = body?.data?.id || body?.id || null;
      } catch { /* sin body */ }
    }

    // Solo nos interesan notificaciones de pago
    if (topic && topic !== 'payment') return ok();
    if (!paymentId) return ok();

    // ── Validar la FIRMA del webhook (x-signature) — SOLO informativo ──
    // NUNCA descartamos un pago por la firma: la barrera REAL es la
    // re-verificación contra la API de MP (más abajo), que prueba que el pago
    // existe y está aprobado. La firma solo se registra para auditoría; si no
    // calza (o falta el secret), se procesa igual para no perder plata real.
    if (!(await firmaOk(req, paymentId))) {
      console.warn('[mp-webhook] x-signature no validada (se procesa igual; la verificación contra MP es la barrera real)', paymentId);
    }

    // ── Verificar el pago contra la API de MercadoPago ───────────
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (!payRes.ok) { console.error('[mp-webhook] no se pudo leer el pago', paymentId); return ok(); }
    const pago = await payRes.json();

    const pedidoId = Number(pago.external_reference);
    if (!pedidoId) { console.error('[mp-webhook] pago sin external_reference'); return ok(); }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotencia: si ya está pagado, no reprocesar
    const { data: pedido } = await sb.from('pedidos')
      .select('*, items_pedido(*)').eq('id', pedidoId).single();
    if (!pedido) { console.error('[mp-webhook] pedido no encontrado', pedidoId); return ok(); }

    // ── COBRO DE SERVICIO (cumpleaños / reservas del CRM) ────────
    // Se decide ANTES del «ya está pagado → no reprocesar» de las entradas:
    // un cobro ya pagado igual se reconcilia (sincronizar o una caída lo
    // pudieron dejar pagado sin tocar la ficha, o pagaron dos veces el mismo
    // link). Un cobro NUNCA sigue al flujo de entradas.
    const { data: cps, error: eCp } = await sb.from('crm_pagos').select('*')
      .eq('pedido_id', pedidoId).order('id', { ascending: false }).limit(1);
    if (eCp) console.error('[mp-webhook] crm_pagos:', eCp.message);
    const cobro = cps?.[0] || null;
    if (pedido.origen === 'crm' || cobro) {
      await webhookCobro(sb, { pedidoId, paymentId, pago, pedido, cobro });
      return ok();
    }

    if (pedido.estado === 'pagado') return ok();

    // Solo procesar pagos aprobados
    if (pago.status !== 'approved') {
      // registrar el estado para visibilidad (rechazado / pendiente)
      await sb.from('pedidos').update({
        referencia_pago: `MP-${paymentId}-${pago.status}`,
      }).eq('id', pedidoId);
      return ok();
    }

    // ── Cinturón de seguridad: el monto pagado debe cubrir el total del pedido ──
    // Con Checkout Pro el monto queda fijo en la preferencia, pero verificamos
    // igual por si alguien intentara reapuntar un pago menor.
    const montoPagado   = Number(pago.transaction_amount) || 0;
    const montoEsperado = Number(pedido.total_pagado ?? pedido.total) || 0;
    if (montoEsperado > 0 && montoPagado + 1 < montoEsperado) {
      console.error(`[mp-webhook] monto insuficiente: pagó ${montoPagado} de ${montoEsperado} (pedido ${pedidoId})`);
      await sb.from('pedidos').update({
        referencia_pago: `MP-${paymentId}-MONTO-${montoPagado}`,
      }).eq('id', pedidoId);
      return ok(); // NO se emite el ticket
    }

    // ── Marcar pagado → dispara el trigger de descuento de stock ──
    // Acepta 'pendiente' O 'expirado' (por si la limpieza de 30 min lo expiró
    // antes de que llegara el webhook). El chequeo de idempotencia de arriba
    // ('pagado' → return) evita doble proceso.
    const { data: upRows, error: upErr } = await sb.from('pedidos').update({
      estado:          'pagado',
      referencia_pago: `MP-${paymentId}`,
      fecha_pago:      new Date().toISOString(),
    }).eq('id', pedidoId).in('estado', ['pendiente', 'expirado']).select('id');

    if (!upErr && (!upRows || upRows.length === 0)) {
      // No afectó filas y no venía 'pagado' → estado raro (reembolsado/cancelado).
      // No re-emitimos QR, pero lo dejamos registrado para revisar.
      console.warn('[mp-webhook] pago aprobado pero el pedido no estaba pendiente/expirado', pedidoId, 'estado:', pedido.estado);
      return ok();
    }

    if (upErr) {
      // El trigger lanza excepción SIN_STOCK si el cupo se agotó entre medio.
      // En ese caso el pago está aprobado pero no hay stock → marcar para
      // reembolso manual (no entregamos ticket inválido).
      console.error('[mp-webhook] error al marcar pagado:', upErr.message);
      await sb.from('pedidos').update({
        estado:          'requiere_reembolso',
        referencia_pago: `MP-${paymentId}-SINSTOCK`,
      }).eq('id', pedidoId);
      // 🚨 URGENTE: alguien PAGÓ y se quedó sin entrada. Hay que resolverlo en
      //    minutos (dar cupo o devolver), no cuando reclame en la puerta.
      try {
        const { data: pd } = await sb.from('pedidos').select('nombre_cliente,email_cliente,total_pagado,total').eq('id', pedidoId).maybeSingle();
        await avisarStaff(sb, {
          titulo: '🚨 PAGÓ Y NO HABÍA CUPO — orden FCC-' + String(pedidoId).padStart(6, '0'),
          detalle: `${pd?.nombre_cliente || 'Cliente'} pagó $${Number(pd?.total_pagado || pd?.total || 0).toLocaleString('es-CL')} y NO tiene entrada.\n${pd?.email_cliente || ''}\n\nEntra al admin → Órdenes → ⚠️ Reembolsar y aprieta "➕ Dar cupo" para emitirle su entrada, o devuélvele la plata.`,
        });
      } catch (_) { /* el aviso nunca puede romper el webhook */ }
      return ok();
    }

    // (El cobro del CRM ya no pasa por acá: se separó arriba, en webhookCobro.)

    // Incrementar uso del código (solo en pagos confirmados)
    if (pedido.codigo_id) {
      try { await sb.rpc('incrementar_uso_codigo', { p_codigo_id: pedido.codigo_id }); }
      catch (e) { console.error('[mp-webhook] incrementar_uso_codigo:', e); }
    }

    // Otorgar PUNTOS al cliente (tasa configurable: pesos por punto)
    if (pedido.cliente_id) {
      try {
        // El interruptor maestro de Puntos & Premios. Sin esto, apagarlo en el
        // admin no serviría de nada: los puntos se otorgan acá, en el servidor,
        // sin pasar por ninguna pantalla. Sin fila = apagado, nunca al revés.
        const { data: _on } = await sb.from('config_valores').select('valor').eq('clave', 'lealtad_on').maybeSingle();
        const lealtadOn = ['true','1','si','sí','on'].includes(String(_on?.valor || '').trim().toLowerCase());
        const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'puntos_pesos_por_punto').maybeSingle();
        const pesosPorPunto = Math.max(1, parseInt(cfg?.valor || '100'));
        const puntos = lealtadOn ? Math.floor((pedido.total_pagado || 0) / pesosPorPunto) : 0;
        if (puntos > 0) {
          const { data: cli } = await sb.from('clientes').select('puntos').eq('id', pedido.cliente_id).maybeSingle();
          await sb.from('clientes').update({ puntos: (cli?.puntos || 0) + puntos }).eq('id', pedido.cliente_id);
          await sb.from('movimientos').insert({ cliente_id: pedido.cliente_id, tipo: 'puntos', monto: puntos, concepto: 'Compra FCC-' + String(pedido.id).padStart(6, '0'), pedido_id: pedido.id });
        }
      } catch (e) { console.error('[mp-webhook] puntos:', e); }
    }

    // ── RULETA: giro de regalo si la compra supera el mínimo ─────
    if (pedido.cliente_id) {
      try {
        const { data: rcfg } = await sb.from('config_sitio').select('visible').eq('clave', 'ruleta').maybeSingle();
        const { data: rmin } = await sb.from('config_valores').select('valor').eq('clave', 'ruleta_monto_minimo').maybeSingle();
        const minimo = parseInt(rmin?.valor || '10000');
        if (rcfg?.visible && (pedido.total_pagado || 0) >= minimo) {
          await sb.from('giros').insert({ cliente_id: pedido.cliente_id, pedido_id: pedido.id, origen: 'compra' });
        }
      } catch (e) { console.error('[mp-webhook] ruleta:', e); }
    }

    // ── REFERIDOS: recompensa al primer pago del invitado ────────
    if (pedido.cliente_id) {
      try {
        const { data: buyer } = await sb.from('clientes')
          .select('id, username, referido_por_codigo, referido_recompensado').eq('id', pedido.cliente_id).maybeSingle();
        if (buyer && buyer.referido_por_codigo && !buyer.referido_recompensado) {
          const { data: ref } = await sb.from('clientes')
            .select('id, credito, username').eq('username', String(buyer.referido_por_codigo).toLowerCase()).maybeSingle();
          if (ref && ref.id !== buyer.id) {
            const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'referido_monto').maybeSingle();
            const monto = Math.max(0, parseInt(cfg?.valor || '1000'));
            if (monto > 0) {
              const { data: bc } = await sb.from('clientes').select('credito').eq('id', buyer.id).maybeSingle();
              await sb.from('clientes').update({ credito: (bc?.credito || 0) + monto, referido_recompensado: true }).eq('id', buyer.id);
              await sb.from('movimientos').insert({ cliente_id: buyer.id, tipo: 'credito', monto, concepto: 'Te invitó @' + ref.username });
              await sb.from('clientes').update({ credito: (ref.credito || 0) + monto }).eq('id', ref.id);
              await sb.from('movimientos').insert({ cliente_id: ref.id, tipo: 'credito', monto, concepto: 'Referiste a @' + (buyer.username || 'un amig@') });
            }
          } else {
            await sb.from('clientes').update({ referido_recompensado: true }).eq('id', buyer.id); // código inválido/propio
          }
        }
      } catch (e) { console.error('[mp-webhook] referido:', e); }
    }

    // ── MEMBRESÍA: si el pedido es la compra de un pase, activarla ──
    if (pedido.membresia_id) {
      try {
        const { data: mem } = await sb.from('membresias').select('*').eq('id', pedido.membresia_id).maybeSingle();
        if (mem && pedido.cliente_id) {
          const hasta = new Date(Date.now() + (mem.duracion_dias || 60) * 24 * 60 * 60 * 1000).toISOString();
          await sb.from('clientes').update({
            membresia_id:     mem.id,
            membresia_nombre: mem.nombre,
            membresia_hasta:  hasta,
          }).eq('id', pedido.cliente_id);
        }
      } catch (e) { console.error('[mp-webhook] membresia:', e); }
      return ok(); // membresía no lleva QRs; terminamos aquí
    }

    // ── Construir orden y enviar comprobantes ────────────────────
    const order = buildOrder(pedido);
    const buyerEmail = (pedido.email_cliente || '').toLowerCase();

    // 1) Email al COMPRADOR con TODOS los QRs
    await sendReceipt({ order });

    // 2) Email INDIVIDUAL a cada invitado (persona con email propio,
    //    distinto al del comprador) — solo su propio QR.
    for (const item of order.items as any[]) {
      const personas = Array.isArray(item.personas) ? item.personas : [];
      const qrIds    = Array.isArray(item.qr_ids)   ? item.qr_ids   : [];
      for (let p = 0; p < personas.length; p++) {
        const persona = personas[p];
        const email   = (persona?.email || '').trim();
        if (!email) continue;
        if (email.toLowerCase() === buyerEmail) continue; // el comprador ya recibió todos
        const guestOrder = {
          id:        order.id,
          pedidoId:  order.pedidoId,
          items:     [{ ...item, cantidad: 1, personas: [persona], _qrOverride: qrIds[p] || undefined }],
          comprador: { nombre: persona.nombre || 'Invitado', email },
          total:     item.precio,
          fecha:     order.fecha,
        };
        await sendReceipt({ order: guestOrder });
      }
    }

    return ok();
  } catch (err) {
    console.error('[mp-webhook]', err);
    return ok(); // siempre 200 para que MP no reintente en loop
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================
// COBRO DE SERVICIO (SPEC «Cobros de servicio», 16-sep-2026)
// Qué hacer con el aviso de MP según el estado del pago y de la orden.
// La plata (cobro + ficha + ERP + correo al cliente) la decide
// _shared/cobros.ts: el mismo camino que usan mp-pagos, devolver-pago y
// crm-pago. Si algo lanza, lo captura el handler y MP recibe 200 igual.
// ============================================================
async function webhookCobro(sb: any, o: { pedidoId: number; paymentId: string; pago: any; pedido: any; cobro: any }) {
  const { pedidoId, paymentId, pago, pedido, cobro } = o;
  const pid = String(pago?.id ?? paymentId);
  const folio = cobro ? folioDeCobro(cobro) : 'FCC-' + String(pedidoId).padStart(6, '0');
  const monto = Number(pago?.transaction_amount) || 0;
  const clp = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  // Misma lista blanca que las entradas y que sincronizar: solo se marca
  // pagado lo que estaba ESPERANDO pago.
  const REVIVIBLES = ['pendiente', 'expirado'];

  // ── 1) Devuelto o contracargo → se descuenta del cobro y de la ficha ──
  if (pago.status === 'refunded' || pago.status === 'charged_back') {
    // Solo se descuenta un pago que de verdad se sumó. Si el aprobado nunca
    // se registró (webhook perdido y devuelto antes de sincronizar), la ficha
    // nunca tuvo esa plata: descontarla la dejaría debiendo de más.
    if (cobro && !pagoSumado(cobro, pedido, pid)) {
      console.warn('[mp-webhook] cobro: devolvieron un pago que nunca se sumó; no se descuenta nada', pedidoId, pid, pago.status);
      return;
    }
    const contracargo = pago.status === 'charged_back';
    const devuelto = contracargo ? monto : (Number(pago.transaction_amount_refunded) || monto);
    // Lo devuelto va POR PAGO y en ABSOLUTO (lo que MP dice devuelto de ese
    // pago): si devolver-pago ya lo anotó (antes o después), acá se aplica 0,
    // aunque el cobro tenga un segundo pago que deje margen. `enPedido`: esta
    // devolución no pasó por devolver-pago, así que la orden también se entera
    // (dev_monto y, si se devolvió todo, 'reembolsado').
    // `refundsMP`: con la fecha de cada devolución, lo devuelto antes de los
    // cobros nuevos (corte del SQL 01b) no se descuenta solo de la ficha.
    const r = await devolverCobro(sb, {
      pedidoId, monto: devuelto, clave: `mp-${pago.status}:${pid}`, paymentId: pid, acumulado: true, enPedido: true,
      motivo: contracargo ? 'Contracargo en MercadoPago' : 'Devuelto en MercadoPago',
      refundsMP: Array.isArray(pago.refunds) ? pago.refunds : undefined,
    });
    if (!r.error && !r.esCobro) {
      console.warn('[mp-webhook] cobro: devolución de una orden de servicio sin cobro', pedidoId, pid);
    } else if (r.error === 'sin_pago_registrado' || r.error === 'monto_invalido') {
      console.warn('[mp-webhook] cobro: devolución sin plata que descontar', pedidoId, pid, r.error);
    } else if (r.error === 'ficha_pendiente') {
      console.error('[mp-webhook] cobro devolución sobre un pago que nunca llegó a la ficha:', pedidoId, pid);
      await avisarStaff(sb, {
        titulo: `🚨 Devolución ${folio} sin registrar`,
        detalle: `MercadoPago informa el pago ${pid} como ${contracargo ? 'contracargo' : 'devuelto'} (${clp(devuelto)}), pero ese pago nunca se alcanzó a sumar a la ficha y tampoco se pudo sumar ahora.\nNi el pago ni la devolución quedaron en la ficha: revísala a mano (no descuentes nada que la ficha no tenga).`,
      });
    } else if (r.error) {
      console.error('[mp-webhook] cobro devolución:', r.error);
      await avisarStaff(sb, {
        titulo: `🚨 Devolución ${folio} sin registrar`,
        detalle: `MercadoPago informa el pago ${pid} como ${contracargo ? 'contracargo' : 'devuelto'} (${clp(devuelto)}), pero NO se pudo descontar del cobro ni de la ficha (${r.error}).\nDescuéntalo a mano en la ficha.`,
      });
    }
    return;
  }

  // ── 2) Rechazado / pendiente / en proceso ──
  if (pago.status !== 'approved') {
    // Se registra el estado para visibilidad, como con las entradas, pero solo
    // mientras la orden espera pago: no se pisa el 'MP-<id>' de un pago
    // aprobado (con eso devolver-pago y reconciliar encuentran el pago real).
    if (REVIVIBLES.includes(String(pedido.estado))) {
      await sb.from('pedidos').update({
        referencia_pago: `MP-${paymentId}-${pago.status}`,
      }).eq('id', pedidoId).in('estado', REVIVIBLES);
    }
    return;
  }

  // ── 3) Aprobado ──
  if (pedido.estado !== 'pagado') {
    if (!REVIVIBLES.includes(String(pedido.estado))) {
      // Orden devuelta / cancelada: no se revive ni se suma sola. Esa plata
      // pudo devolverse por fuera de MP; sumarla dejaría la ficha «pagada» sin serlo.
      if (cobro && pagoSumado(cobro, pedido, pid)) {
        // Ese pago ya estaba anotado. Si MP informa además una devolución
        // parcial (hecha en su panel), reconciliar la descuenta (idempotente).
        if (!(Number(pago.transaction_amount_refunded) > 0)) return;
      } else {
        console.warn('[mp-webhook] cobro: pago aprobado sobre una orden que no espera pago', pedidoId, 'estado:', pedido.estado);
        const aviso = {
          titulo: `⚠️ ${folio}: entró un pago a una orden «${pedido.estado}»`,
          detalle: `MercadoPago aprobó ${clp(monto)} (pago ${pid}) para la orden #${pedidoId}, que está «${pedido.estado}». NO se sumó a la ficha.\nRevisa en MercadoPago si hay que devolverlo o sumarlo a mano.`,
        };
        // mp-conciliar vuelve a mandar este pago cada 10 min: se avisa UNA vez por pago.
        if (cobro) await avisarUnaVezPorCobro(sb, cobro, pid, `Pago ${pid} sobre una orden «${pedido.estado}»`, aviso);
        else await avisarUnaVez(sb, 'aviso-cobro:no-revivible:' + pid, aviso);
        return;
      }
    } else {
      // Candado de #36: en un cobro viejo, ANTES de marcar pagada la orden se deja
      // [pago-en-curso:<pid>]. Si MP manda otro aviso casi al mismo tiempo, ese
      // lee la orden ya pagada pero también la marca, y no anota el pago SIN sumar.
      if (cobro) await anotarPagoEnCurso(sb, cobro, pid);
      // Mismo update que las entradas, pero SIN el cinturón de monto: en un
      // cobro, un monto distinto no se calla; lo registra reconciliar
      // ('monto_distinto' + aviso al staff).
      const { data: upRows, error: upErr } = await sb.from('pedidos').update({
        estado:          'pagado',
        referencia_pago: `MP-${paymentId}`,
        fecha_pago:      new Date().toISOString(),
      }).eq('id', pedidoId).in('estado', REVIVIBLES).select('id');
      if (upErr) console.error('[mp-webhook] cobro: error al marcar pagado (se reconcilia igual):', upErr.message);
      else if (!upRows || upRows.length === 0) console.warn('[mp-webhook] cobro: la orden cambió de estado entre medio (se reconcilia igual)', pedidoId);
    }
  }

  // Ya pagado (sincronizar, caída entre pasos, segundo pago) o recién marcado:
  // reconciliar es idempotente por payment id, así que nunca suma dos veces.
  // `pedidoYaPagado`: un cobro viejo pendiente con la orden YA pagada se anota
  // sin sumar (el «sincronizar» viejo no tocaba la ficha y pudo sumarse a mano),
  // salvo que la haya pagado este mismo pago recién ([pago-en-curso], más arriba).
  try {
    const r = await reconciliarCobro(sb, { pedidoId, pago, via: 'webhook', pedidoYaPagado: pedido.estado === 'pagado' });
    if (!r.esCobro) {
      console.error('[mp-webhook] cobro: orden de servicio sin fila en crm_pagos', pedidoId);
      await avisarUnaVez(sb, 'aviso-cobro:sin-cobro:' + pid, {
        titulo: `🚨 Pago sin cobro · orden ${folio}`,
        detalle: `MercadoPago aprobó ${clp(monto)} (pago ${pid}) para la orden #${pedidoId}, que es de un servicio, pero no tiene cobro registrado. No se sumó a ninguna ficha.\nRevisa a qué cumpleaños o reserva corresponde.`,
      });
    }
  } catch (e) {
    console.error('[mp-webhook] reconciliar cobro:', e);
    await avisarUnaVez(sb, 'aviso-cobro:reconciliar:' + pid, {
      titulo: `🚨 Pago ${folio} sin registrar`,
      detalle: `MercadoPago aprobó ${clp(monto)} (pago ${pid}, orden #${pedidoId}), pero NO se pudo anotar en el cobro ni en la ficha (${String((e as any)?.message || e)}).\nSincronízalo desde Pagos MP en el admin (no se suma dos veces). No lo sumes a mano en la ficha.`,
    });
  }
}

// Avisos que mp-conciliar repetiría cada 10 min (vuelve a mandar los últimos
// pagos aprobados): como máximo uno por pago al día, con el mismo freno
// `rate_ok` de _shared/rate.ts. Si la función no existe o falla, avisa igual
// (falla abierto: es preferible un aviso repetido a uno perdido).
async function avisarUnaVez(sb: any, clave: string, aviso: { titulo: string; detalle: string }) {
  try {
    const { data, error } = await sb.rpc('rate_ok', { p_clave: clave, p_max: 1, p_seg: 86400 });
    if (!error && data === false) return;
  } catch (_) { /* falla abierto */ }
  await avisarStaff(sb, aviso);
}

// Aviso UNA sola vez por pago cuando hay cobro: la marca [aviso-orden:<pid>]
// queda en cotejo_detalle (sin SQL nuevo) y se escribe con candado; solo avisa
// el proceso cuyo update tocó la fila. Si la base no deja escribir la marca,
// cae al freno de un aviso al día.
async function avisarUnaVezPorCobro(sb: any, cobro: any, pid: string, nota: string, aviso: { titulo: string; detalle: string }) {
  const marca = marcaAvisoOrden(pid);
  const previo = cobro?.cotejo_detalle;
  if (String(previo || '').includes(marca)) return;
  let q = sb.from('crm_pagos')
    .update({ cotejo_detalle: (String(previo || '').trim() ? String(previo).trim() + '\n' : '') + `${nota} ${marca}` })
    .eq('id', cobro.id);
  q = previo == null ? q.is('cotejo_detalle', null) : q.eq('cotejo_detalle', previo);
  const { data: up, error } = await q.select('id');
  if (error) {
    console.error('[mp-webhook] marca de aviso:', error.message);
    await avisarUnaVez(sb, 'aviso-cobro:no-revivible:' + pid, aviso);
    return;
  }
  if (up && up.length) await avisarStaff(sb, aviso);
}

// ¿Ese pago de MP ya está sumado en el cobro? Sí si es el primero, uno de
// los extra, o el de un cobro viejo que sumó el webhook anterior sin anotar
// el payment id (ahí manda el 'MP-<id>' de la orden).
function pagoSumado(cobro: any, pedido: any, pid: string): boolean {
  if (String(cobro?.mp_payment_id || '') === pid) return true;
  const extras = Array.isArray(cobro?.pagos_extra) ? cobro.pagos_extra : [];
  if (extras.some((x: any) => String(x?.payment_id) === pid)) return true;
  if (!cobro?.mp_payment_id && (cobro?.estado === 'pagado' || cobro?.estado === 'devuelto')) {
    const m = String(pedido?.referencia_pago || '').match(/^MP-(\d+)/);
    return !m || m[1] === pid;   // sin 'MP-<id>' no se puede descartar: queda el tope del helper
  }
  return false;
}

// Valida la firma x-signature de MercadoPago (HMAC-SHA256).
// Manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
// Devuelve true si no hay secret configurado (no bloquea hasta activarlo).
async function firmaOk(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) return true; // aún no configurado → no bloquea
  try {
    const xsig = req.headers.get('x-signature') || '';
    const xreq = req.headers.get('x-request-id') || '';
    const parts: Record<string, string> = {};
    xsig.split(',').forEach((p) => { const [k, v] = p.split('='); if (k && v) parts[k.trim()] = v.trim(); });
    const ts = parts['ts'], v1 = parts['v1'];
    if (!ts || !v1) return false;
    const manifest = `id:${dataId};request-id:${xreq};ts:${ts};`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === v1;
  } catch (e) {
    console.error('[mp-webhook] error validando firma:', e);
    return false;
  }
}

// Llama a send-receipt. No lanza error (un email fallido no debe romper el webhook).
async function sendReceipt(payload: any) {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[mp-webhook] send-receipt falló (pago OK):', e);
  }
}

// Reconstruye el objeto `order` que espera send-receipt desde el pedido en DB.
function buildOrder(pedido: any) {
  const items = (pedido.items_pedido || []).map((ip: any) => ({
    tipo:       ip.producto_tipo === 'ticket' ? (ip.nombre_ticket || 'TICKET') : ip.producto_tipo,
    nombre:     ip.nombre_evento || ip.nombre_ticket || 'Producto',
    precio:     ip.precio_unitario,
    cantidad:   ip.cantidad,
    detalle:    ip.detalle || '',
    productoId: ip.producto_id || undefined,
    ttId:       ip.tipo_ticket_id || undefined,
    eventoId:   ip.evento_id || undefined,
    personas:   Array.isArray(ip.personas) ? ip.personas : [],
    qr_ids:     Array.isArray(ip.qr_ids) ? ip.qr_ids : [],
  }));
  return {
    id:        'FCC-' + String(pedido.id).padStart(6, '0'),
    pedidoId:  pedido.id,
    items,
    comprador: { nombre: pedido.nombre_cliente, email: pedido.email_cliente },
    total:     pedido.total,
    fecha:     pedido.fecha_pago || pedido.created_at || new Date().toISOString(),
  };
}
