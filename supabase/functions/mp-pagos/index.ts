// ============================================================
// FRATE — Edge Function: mp-pagos
// Conciliación con MercadoPago: trae los últimos pagos REALES
// desde la API oficial y los cruza con las órdenes locales.
// Además permite "sincronizar" un pago aprobado cuyo webhook se
// perdió (marca la orden pagada y reenvía el comprobante).
// Los cobros de servicio (cumpleaños/reservas, origen 'crm') se marcan
// aparte: sincronizarlos registra el pago en el cobro y la ficha
// (reconciliarCobro) y NUNCA manda comprobante con QR.
//
// Solo ADMIN. Secrets: MP_ACCESS_TOKEN, SUPABASE_*, RESEND (opcional)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { avisarStaff } from '../_shared/avisar.ts';
import { anotarPagoEnCurso, folioDeCobro, marcaFichaPendiente, reconciliarCobro } from '../_shared/cobros.ts';

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

    // Solo admin
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: cors });
    const { data: perfil } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    if (perfil?.rol !== 'admin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403, headers: cors });

    const { accion, paymentId, limit } = await req.json().catch(() => ({})) as { accion?: string; paymentId?: string; limit?: number };

    // ── SINCRONIZAR: rescatar un pago aprobado con webhook perdido ──
    if (accion === 'sincronizar') {
      if (!paymentId) throw new Error('Falta paymentId');
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
      const pago = await r.json();
      if (!r.ok) throw new Error(pago.message || 'MercadoPago no encontró ese pago');
      if (pago.status !== 'approved') return new Response(JSON.stringify({ error: `El pago está "${pago.status}" en MercadoPago — solo se sincronizan aprobados.` }), { status: 409, headers: cors });
      const ref = parseInt(pago.external_reference);
      if (!ref) return new Response(JSON.stringify({ error: 'El pago no tiene orden asociada (external_reference).' }), { status: 409, headers: cors });
      const { data: pedido } = await admin.from('pedidos').select('*, items_pedido(*)').eq('id', ref).single();
      if (!pedido) return new Response(JSON.stringify({ error: 'La orden #' + ref + ' no existe acá.' }), { status: 404, headers: cors });

      // ── 🎂 COBRO DE SERVICIO (cumpleaños / reserva) ───────────────
      // Antes «sincronizar» marcaba la orden pagada y ahí quedaba: la ficha
      // nunca se enteraba del pago, y encima se le mandaba al cliente un
      // comprobante de ENTRADAS. Ahora: se marca pagada (si no lo está) y se
      // registra con reconciliarCobro, que es idempotente por payment id —
      // apretar dos veces, o que el webhook llegue al mismo tiempo, suma UNA vez.
      // Sin comprobante con QR, sin tope de monto (si pagaron distinto, queda
      // 'monto_distinto' con aviso al staff: la plata que entró es real).
      let esCobro = pedido.origen === 'crm';
      if (!esCobro) {
        const { data: cps, error: eCp } = await admin.from('crm_pagos').select('id').eq('pedido_id', ref).limit(1);
        if (eCp) throw new Error('No se pudo revisar si la orden es un cobro de servicio: ' + eCp.message);
        esCobro = !!(cps && cps.length);
      }
      if (esCobro) {
        if (pedido.estado !== 'pagado') {
          if (!['pendiente', 'expirado'].includes(String(pedido.estado))) {
            return new Response(JSON.stringify({
              error: `La orden #${ref} está "${pedido.estado}" y no se puede revivir desde acá. ` +
                     `Si de verdad hay que cobrarla, primero devuélvela a pendiente.`,
            }), { status: 409, headers: cors });
          }
          // Candado de #36 (igual que mp-webhook): en un cobro viejo, antes de marcar
          // pagada la orden se deja [pago-en-curso:<id>], para que un aviso de MP que
          // llegue al mismo tiempo no la tome por pagada «de antes» y anote el pago SIN sumar.
          const { data: cpsC, error: eCpsC } = await admin.from('crm_pagos').select('*')
            .eq('pedido_id', ref).order('id', { ascending: false }).limit(1);
          if (eCpsC) console.error('[mp-pagos] leer cobro para el candado:', eCpsC.message);
          else if (cpsC?.[0]) await anotarPagoEnCurso(admin, cpsC[0], pago.id);
          const { data: upC, error: eUpC } = await admin.from('pedidos').update({
            estado: 'pagado',
            referencia_pago: `MP-${pago.id}-SYNC`,
            fecha_pago: pago.date_approved || new Date().toISOString(),
          }).eq('id', ref).in('estado', ['pendiente', 'expirado']).select('id');
          if (eUpC) return new Response(JSON.stringify({ error: 'No se pudo marcar pagada: ' + eUpC.message }), { status: 500, headers: cors });
          if (!upC || !upC.length) {
            // Cambió entre medio: si fue el webhook que la pagó, se sigue igual.
            const { data: ped2 } = await admin.from('pedidos').select('estado').eq('id', ref).maybeSingle();
            if (ped2?.estado !== 'pagado') {
              return new Response(JSON.stringify({ error: `La orden #${ref} cambió a "${ped2?.estado ?? '?'}" mientras se sincronizaba. Revísala antes de volver a intentar.` }), { status: 409, headers: cors });
            }
          }
        }
        try {
          // `pedidoYaPagado` con el estado leído ANTES de marcarla: un cobro viejo
          // pendiente con la orden ya pagada (el «sincronizar» viejo no tocaba la
          // ficha, y el equipo pudo sumarlo a mano) se anota sin sumar y se avisa.
          const rc = await reconciliarCobro(admin, { pedidoId: ref, pago, via: 'sincronizar', pedidoYaPagado: pedido.estado === 'pagado' });
          if (!rc.esCobro) throw new Error('la orden no tiene fila en crm_pagos');
          const folio = rc.cobro ? folioDeCobro(rc.cobro) : 'FCC-' + String(ref).padStart(6, '0');
          const fichaTxt = rc.fichaReintentada
            ? (rc.ficha?.ok ? ' La ficha había quedado pendiente: ahora quedó sumada.' : ` La ficha sigue pendiente (${rc.ficha?.error || 'error'}): vuelve a intentarlo más rato.`)
            : '';
          const devTxt = (rc.devolucion?.montoAplicado || 0) > 0
            ? ` Se descontó una devolución parcial de $${Number(rc.devolucion!.montoAplicado).toLocaleString('es-CL')} hecha en MercadoPago.` : '';
          const nota = rc.sinSumar ? `Cobro ${folio}: la orden ya estaba pagada y el cobro es viejo; el pago quedó anotado SIN sumar a la ficha. Revísala y súmalo a mano si falta.`
                     : rc.yaEstaba ? `Cobro ${folio}: ese pago ya estaba registrado.${fichaTxt}${devTxt}`
                     : rc.dobles ? `Cobro ${folio}: era un SEGUNDO pago del mismo link, se sumó y se avisó al equipo.${devTxt}`
                     : `Cobro ${folio} registrado en la ficha${rc.cotejo && rc.cotejo !== 'cuadra' ? ' (⚠️ ' + rc.cotejo + ')' : ''}.${devTxt}`;
          return new Response(JSON.stringify({
            ok: true, sincronizada: ref, servicio: true, folio, cotejo: rc.cotejo ?? rc.cobro?.cotejo ?? null,
            yaEstaba: !!rc.yaEstaba, dobles: !!rc.dobles, sinSumar: !!rc.sinSumar, nota,
          }), { headers: cors });
        } catch (e) {
          const msg = String((e as any)?.message || e);
          console.error('[mp-pagos] reconciliar cobro:', e);
          await avisarStaff(admin, {
            titulo: `🚨 Cobro de la orden #${ref} sin registrar`,
            detalle: `Se sincronizó el pago MP ${pago.id} ($${(Number(pago.transaction_amount) || 0).toLocaleString('es-CL')}) y la orden quedó pagada, pero el cobro/ficha NO se actualizó: ${msg}.\nVuelve a apretar «Sincronizar» (no suma dos veces) o revisa la ficha.`,
          });
          return new Response(JSON.stringify({ error: `La orden quedó pagada, pero no se pudo registrar el cobro en la ficha: ${msg}. Vuelve a sincronizar (no suma dos veces).` }), { status: 500, headers: cors });
        }
      }

      if (pedido.estado === 'pagado') return new Response(JSON.stringify({ ok: true, nota: 'La orden ya estaba pagada.' }), { headers: cors });

      // ── Solo se revive lo que estaba ESPERANDO pago ──────────────
      // Antes el filtro era `neq('estado','pagado')`, que acepta cancelado,
      // reembolsado y requiere_reembolso. Un admin cancelaba una orden, el
      // pago seguía «approved» en MercadoPago, la pantalla la etiquetaba
      // «webhook_perdido» —que invita a apretar sincronizar— y con un clic
      // volvía a pagada: descontaba el cupo de nuevo y reenviaba los QR de
      // una orden anulada. Los otros tres caminos (mp-webhook, khipu-webhook,
      // khipu-conciliar) ya usaban lista blanca; este era el único que no.
      const REVIVIBLES = ['pendiente', 'expirado'];
      if (!REVIVIBLES.includes(String(pedido.estado))) {
        return new Response(JSON.stringify({
          error: `La orden #${ref} está "${pedido.estado}" y no se puede revivir desde acá. ` +
                 `Si de verdad hay que cobrarla, primero devuélvela a pendiente.`,
        }), { status: 409, headers: cors });
      }

      // ── Cinturón de monto ────────────────────────────────────────
      // Mismo criterio que mp-webhook: el pago tiene que cubrir el total.
      // Este camino era el ÚNICO de los cuatro que no lo comprobaba.
      const montoPagado   = Number(pago.transaction_amount) || 0;
      const montoEsperado = Number(pedido.total_pagado ?? pedido.total) || 0;
      if (montoEsperado > 0 && montoPagado + 1 < montoEsperado) {
        await admin.from('pedidos').update({
          referencia_pago: `MP-${pago.id}-MONTO-${montoPagado}`,
        }).eq('id', ref);
        return new Response(JSON.stringify({
          error: `El pago cubre $${montoPagado.toLocaleString('es-CL')} de $${montoEsperado.toLocaleString('es-CL')}. No se emitieron entradas.`,
        }), { status: 409, headers: cors });
      }

      const _marcarPagada = () => admin.from('pedidos').update({
        estado: 'pagado',
        referencia_pago: `MP-${pago.id}-SYNC`,
        fecha_pago: pago.date_approved || new Date().toISOString(),
      }).eq('id', ref).in('estado', REVIVIBLES).select('id');

      let up = await _marcarPagada();
      if (up.error) {
        // El trigger de stock la bloqueó (tipo agotado). El pago es REAL y aprobado →
        // honramos el pago: le damos el cupo (subimos disponible lo justo) y reintentamos.
        // Mejor un cupo extra que devolverle a un cliente que ya pagó.
        for (const ip of (pedido.items_pedido || [])) {
          if (!ip.tipo_ticket_id) continue;
          const need = ip.cantidad || 1;
          const { data: tt } = await admin.from('tipos_ticket').select('disponible, estado').eq('id', ip.tipo_ticket_id).maybeSingle();
          await admin.from('tipos_ticket').update({
            disponible: (tt?.disponible || 0) + need,
            estado: tt?.estado === 'Agotado' ? 'Activo' : (tt?.estado || 'Activo'),
          }).eq('id', ip.tipo_ticket_id);
        }
        up = await _marcarPagada();
        if (up.error) return new Response(JSON.stringify({ error: 'No se pudo marcar pagada: ' + up.error.message }), { status: 500, headers: cors });
      }

      // Reenviar comprobante con QRs (mejor esfuerzo)
      try {
        const order = {
          id: 'FCC-' + String(pedido.id).padStart(6, '0'),
          pedidoId: pedido.id,
          items: (pedido.items_pedido || []).map((ip: any) => ({
            tipo: ip.producto_tipo === 'ticket' ? (ip.nombre_ticket || 'TICKET') : ip.producto_tipo,
            nombre: ip.nombre_evento || ip.nombre_ticket || 'Producto',
            precio: ip.precio_unitario, cantidad: ip.cantidad,
            ttId: ip.tipo_ticket_id || undefined, productoId: ip.producto_id || undefined,
            personas: Array.isArray(ip.personas) ? ip.personas : [], qr_ids: Array.isArray(ip.qr_ids) ? ip.qr_ids : [],
          })),
          comprador: { nombre: pedido.nombre_cliente, email: pedido.email_cliente },
          total: pedido.total_pagado || pedido.total, fecha: new Date().toISOString(),
        };
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ order }),
        });
      } catch (e) { console.error('[mp-pagos] receipt:', e); }

      return new Response(JSON.stringify({ ok: true, sincronizada: ref }), { headers: cors });
    }

    // ── LISTAR: últimos pagos de MP + cruce con órdenes locales ──
    // Paginamos contra la API de MP para poder revisar bastantes de una (hasta 300).
    const want = Math.min(Number(limit) || 60, 300);
    let resultados: any[] = [];
    let offset = 0;
    while (resultados.length < want) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=50&offset=${offset}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Error consultando MercadoPago');
      const batch = data.results || [];
      resultados = resultados.concat(batch);
      const total = data.paging?.total ?? resultados.length;
      offset += batch.length;
      if (batch.length === 0 || resultados.length >= total || offset > 1000) break;
    }
    resultados = resultados.slice(0, want);

    // Cruce con órdenes locales. Solo ids de pedido PLAUSIBLES (chicos): los de
    // Mercado Libre / marketplace / compras propias traen refs gigantes que NO son órdenes nuestras.
    const esPedidoId = (x: number) => Number.isFinite(x) && x > 0 && x < 1000000;
    const refs = [...new Set(resultados.map((p: any) => parseInt(p.external_reference)).filter(esPedidoId))];
    // Si no se pudieron leer las órdenes (p. ej. falta pedidos.origen porque el SQL
    // 01a no se corrió), se corta con error: sin esto TODAS las ventas web aprobadas
    // salían como «orden perdida» y desaparecía «⚡ Sincronizar».
    const { data: pedidos, error: ePed } = refs.length
      ? await admin.from('pedidos').select('id, estado, total_pagado, total, nombre_cliente, origen').in('id', refs)
      : { data: [], error: null };
    if (ePed) throw new Error('No se pudieron leer las órdenes: ' + ePed.message);
    const pedMap = new Map((pedidos || []).map((p: any) => [p.id, p]));
    // 🎂 Cobros de servicio de esas órdenes (el más nuevo por pedido, como reconciliarCobro).
    // Si esta lectura falla basta con el log: `origen === 'crm'` igual marca el
    // servicio, y sincronizar revisa el cobro en el servidor.
    const { data: cobrosCrm, error: eCob } = refs.length
      ? await admin.from('crm_pagos').select('id, pedido_id, tipo, servicio, folio, estado, mp_payment_id, pagos_extra, cotejo_detalle').in('pedido_id', refs)
      : { data: [], error: null };
    if (eCob) console.error('[mp-pagos] cobros de servicio:', eCob.message);
    const cobroMap = new Map<number, any>();
    for (const c of (cobrosCrm || [])) {
      const prev = cobroMap.get(c.pedido_id);
      if (!prev || c.id > prev.id) cobroMap.set(c.pedido_id, c);
    }

    const hoyCL = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // YYYY-MM-DD
    let totalHoyMP = 0;

    const pagos = resultados.map((p: any) => {
      const refRaw = parseInt(p.external_reference);
      const ref = esPedidoId(refRaw) ? refRaw : null;               // solo ids de pedido reales (chicos)
      const refGigante = !!p.external_reference && !esPedidoId(refRaw); // ML / marketplace / compra propia
      const local: any = ref ? pedMap.get(ref) : null;
      const fechaCL = p.date_created ? new Date(p.date_created).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) : '';
      if (p.status === 'approved' && fechaCL === hoyCL) totalHoyMP += p.transaction_amount || 0;
      // presencial     = pago aprobado SIN external_reference → venta en caja (Point/presencial), no viene del checkout web → normal, no es problema.
      // webhook_perdido = pago aprobado de una ORDEN WEB REAL que quedó sin marcar pagada → SÍ se sincroniza.
      // sin_orden_real  = pago WEB (con FCC ref) aprobado y REAL sin orden local → ⚠️ orden perdida, posible ticket sin entregar.
      // sin_orden_test  = pago en modo prueba (live_mode=false) sin orden → se ignora.
      const live = !!p.live_mode;
      // Venta en vivo (MP Point): el pagador es la cuenta presencial de MercadoPago
      const esPresencial = /ventapresencial/i.test(String(p.payer?.email || ''));
      // cobro_sin_cuadrar = pago aprobado de un COBRO DE SERVICIO (origen 'crm') que no quedó registrado:
      //                     la orden no está pagada, crm_pagos no tiene ese payment id, o el pago quedó
      //                     marcado [ficha-pendiente] (la ficha no se actualizó) → se sincroniza (sin QR).
      const cobro: any = ref ? cobroMap.get(ref) : null;
      const esServicio = !!local && (local.origen === 'crm' || !!cobro);
      const pagoRegistrado = !!cobro && (String(cobro.mp_payment_id || '') === String(p.id)
        || (Array.isArray(cobro.pagos_extra) && cobro.pagos_extra.some((x: any) => String(x?.payment_id) === String(p.id))));
      const fichaPendiente = !!cobro && String(cobro.cotejo_detalle || '').includes(marcaFichaPendiente(p.id));
      let flag = 'ok';
      if (p.status === 'approved') {
        if (esPresencial)                                                           flag = live ? 'presencial' : 'sin_orden_test';   // 🏪 venta en vivo (Point)
        else if (ref && esServicio) {                                               // 🎂 cobro de cumpleaños/reserva: NO es una venta de entradas
          if (local.estado !== 'pagado' && local.estado !== 'reembolsado')          flag = 'cobro_sin_cuadrar';
          else if (local.estado === 'pagado' && (!pagoRegistrado || fichaPendiente)) flag = 'cobro_sin_cuadrar';
        }
        else if (ref) {                                                             // ref = id de pedido plausible → venta WEB (checkout)
          if (local && local.estado !== 'pagado' && local.estado !== 'reembolsado') flag = 'webhook_perdido';
          else if (!local)                                                          flag = live ? 'sin_orden_real' : 'sin_orden_test';
          // else: calzada y pagada → 'ok'
        }
        else                                                                        flag = live ? 'compra' : 'sin_orden_test';       // 🛒 gasto propio / ML / marketplace (plata que SALE)
      } else if (['refunded', 'charged_back'].includes(p.status) && local && local.estado !== 'reembolsado') flag = 'devuelto_en_mp';
      return {
        id: p.id,
        fecha: p.date_created,
        monto: p.transaction_amount,
        neto: p.transaction_details?.net_received_amount ?? null,
        estado: p.status,
        detalle: p.status_detail,
        metodo: [p.payment_type_id, p.payment_method_id].filter(Boolean).join(' · '),
        payerEmail: p.payer?.email || '',
        descripcion: p.description || '',
        live,
        ref,
        local: local ? { id: local.id, estado: local.estado, nombre: local.nombre_cliente, monto: local.total_pagado || local.total } : null,
        servicio: esServicio,
        folio: esServicio ? folioDeCobro(cobro || { pedido_id: ref }) : null,
        flag,
      };
    });

    return new Response(JSON.stringify({ ok: true, pagos, totalHoyMP, hoy: hoyCL }), { headers: cors });

  } catch (err) {
    console.error('[mp-pagos]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
