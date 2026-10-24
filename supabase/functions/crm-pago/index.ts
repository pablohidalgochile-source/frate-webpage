// ============================================================
// FRATE — Edge Function: crm-pago (cobros de servicio)
// ÚNICA puerta de escritura de los cobros del CRM (cumpleaños, reservas,
// abonos, botellas). El navegador NUNCA escribe crm_pagos ni la plata de
// la ficha: todo pasa por acá o por _shared/cobros.ts.
//
// Acciones (body.accion, por defecto 'crear'):
//   crear   {tipo, ref_id, monto, concepto?, comprador:{nombre,email}, reemplazar?, motivo?}
//           → pedido (origen 'crm') + crm_pagos con folio CUM/RES/SRV-000123
//             + preferencia MP (external_reference = pedido.id, NUMÉRICO).
//             Si ya hay un link sin pagar: 409 YA_HAY_LINK, salvo reemplazar:true
//             (vence el viejo en MP; si MP no lo vence, 502 y NO crea otro).
//   enviado {cobro_id, canal}   → cuenta el envío y lo anota en el historial.
//   anular  {cobro_id, motivo}  → vence el link en MP y lo da de baja.
//   manual  {tipo, ref_id, monto, medio, nota?} → pago en el local (efectivo,
//           transferencia, tarjeta), ya pagado, aplicado a la ficha.
//   anular_manual {cobro_id, motivo} → deshace un pago manual mal digitado
//           (lo descuenta de la ficha y avisa al ERP 'devuelto').
// Al pagar, mp-webhook llama a reconciliarCobro (suma a la ficha y avisa al ERP).
//
// verify_jwt=false; exige JWT admin/rrpp (lo genera el equipo).
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import {
  CANALES_ENVIO, actualizarFichaFormulario, anularPagoManual, buscarPreferenciaDePedido, folioDe, folioDeCobro,
  linkDePref, prefIdDe, registrarPagoManual, resolverFicha, vencerPreferencia,
} from '../_shared/cobros.ts';

const SITE_URL = 'https://www.frate.cl';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });
  const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: cors });

  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Candado admin/rrpp (igual que antes). De paso se sabe QUIÉN cobra:
    // sale del token, no del navegador.
    let rol = '';
    let uid: string | null = null;
    let quien: string | null = null;
    try {
      const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (jwt) {
        const { data: u } = await sb.auth.getUser(jwt);
        if (u?.user?.id) {
          const { data: p } = await sb.from('clientes').select('rol,username,nombres,apellidos,email').eq('id', u.user.id).maybeSingle();
          rol = p?.rol || '';
          uid = u.user.id;
          quien = p?.username ? '@' + p.username
                : (`${p?.nombres || ''} ${p?.apellidos || ''}`.trim() || p?.email || null);
        }
      }
    } catch (_e) { /* sin sesión */ }
    if (!['admin', 'rrpp'].includes(rol)) return resp({ error: 'Solo admin o RRPP.' }, 403);

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || 'crear');
    const ahora = () => new Date().toISOString();
    const clp = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
    const TIPOS = ['reserva', 'lista', 'formulario', 'generico'];

    // Resumen del cobro que ve el admin en un 409 (sin tokens ni datos del pago).
    const resumen = (c: any, refPedido?: string | null) => ({
      id: c.id, folio: folioDeCobro(c), monto: c.monto,
      link: c.link || linkDePref(c.preferencia_id) || linkDePref(prefIdDe(refPedido)),
      enviado_at: c.enviado_at ?? null, envios: c.envios ?? 0, created_at: c.created_at,
    });

    // ¿Ese link se pagó de verdad? La orden 'pagado' por MercadoPago lleva
    // 'MP-<id>' (webhook) o 'MP-<id>-SYNC' (sincronizar). Una marcada pagada a
    // mano en Órdenes («Marcar pagadas») no tiene pago que sincronizar: ese
    // link se puede anular o reemplazar igual.
    const pagadoPorMP = (ped: any) => ped?.estado === 'pagado' && /^MP-\d+(-SYNC)?$/.test(String(ped?.referencia_pago || ''));
    const pagadoAMano = (ped: any) => ped?.estado === 'pagado' && !pagadoPorMP(ped);
    const NOTA_A_MANO = 'Orden marcada pagada a mano (sin pago MercadoPago): el link se dio de baja igual.';
    const conNota = (previo: unknown, nota: string) => (String(previo || '').trim() ? String(previo).trim() + '\n' : '') + nota;

    // Lee un cobro por id (404 si no existe).
    const leerCobro = async (id: number) => {
      const { data, error } = await sb.from('crm_pagos').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error('crm_pagos: ' + error.message);
      return data;
    };

    // Historial de la ficha (solo formularios tiene historial).
    const anotarEnFicha = async (cobro: any, ev: string, extra?: (g: Record<string, any>) => void) => {
      if (cobro?.tipo !== 'formulario' || !cobro?.ref_id) return null;
      const r = await actualizarFichaFormulario(sb, Number(cobro.ref_id), (g, hist) => {
        if (extra) extra(g);
        hist.push({ ts: ahora(), ev, ...(quien ? { por: quien } : {}) });
        return { gestion: g, historial: hist };
      });
      if (!r.ok) { console.error('[crm-pago] historial ficha:', r.error); return r.error || 'error'; }
      return null;
    };

    // El link viejo se da de baja en MP. Sin esto, «generar otro» deja los dos
    // vivos y el cliente puede pagar dos veces.
    const darDeBajaEnMP = async (cobro: any, refPedido: string | null): Promise<{ ok: boolean; error?: string; prefId?: string }> => {
      if (!MP_TOKEN) return { ok: false, error: 'MP_ACCESS_TOKEN no configurada' };
      const prefId = cobro.preferencia_id || prefIdDe(refPedido)
        || (cobro.pedido_id ? await buscarPreferenciaDePedido(MP_TOKEN, Number(cobro.pedido_id)) : null);
      if (!prefId) return { ok: false, error: 'No se encontró la preferencia de ese link en MercadoPago' };
      const v = await vencerPreferencia(MP_TOKEN, prefId, cobro.created_at || null);
      return v.ok ? { ok: true, prefId } : { ok: false, error: v.error, prefId };
    };

    // ══ ENVIADO ═══════════════════════════════════════════════
    if (accion === 'enviado') {
      const cobroId = parseInt(body.cobro_id);
      const canal = String(body.canal || '');
      if (!cobroId) return resp({ error: 'Falta el cobro.', code: 'DATOS' }, 400);
      if (!CANALES_ENVIO.includes(canal)) return resp({ error: 'Canal inválido.', code: 'DATOS' }, 400);
      for (let intento = 0; intento < 3; intento++) {
        const c = await leerCobro(cobroId);
        if (!c) return resp({ error: 'No existe ese cobro.', code: 'NO_EXISTE_COBRO' }, 404);
        const previos = Number(c.envios) || 0;
        // Candado: si otro envío se anotó entre medio, se relee y se suma sobre ese.
        const { data: up, error } = await sb.from('crm_pagos')
          .update({ envios: previos + 1, enviado_at: ahora(), enviado_canal: canal })
          .eq('id', cobroId).eq('envios', previos).select('*');
        if (error) throw new Error('crm_pagos (enviado): ' + error.message);
        if (!up || !up.length) continue;
        const fila = up[0];
        const nombreCanal = canal === 'correo' ? 'correo' : canal === 'whatsapp_frate' ? 'WhatsApp FRATE' : 'WhatsApp';
        const avisoFicha = await anotarEnFicha(fila, `📤 Link ${folioDeCobro(fila)} enviado por ${nombreCanal}`);
        return resp({ ok: true, cobro: fila, ...(avisoFicha ? { aviso: 'El envío quedó anotado en el cobro, pero no en el historial de la ficha.' } : {}) });
      }
      return resp({ error: 'El cobro cambió muchas veces seguidas; intenta de nuevo.', code: 'REINTENTAR' }, 409);
    }

    // ══ ANULAR ════════════════════════════════════════════════
    if (accion === 'anular') {
      const cobroId = parseInt(body.cobro_id);
      const motivo = String(body.motivo || '').trim().slice(0, 200);
      if (!cobroId) return resp({ error: 'Falta el cobro.', code: 'DATOS' }, 400);
      const c = await leerCobro(cobroId);
      if (!c) return resp({ error: 'No existe ese cobro.', code: 'NO_EXISTE_COBRO' }, 404);
      if (c.estado !== 'pendiente') return resp({ error: `Ese cobro está «${c.estado}»: solo se anula un link sin pagar.`, code: 'NO_PENDIENTE' }, 409);
      let refPedido: string | null = null;
      let aMano = false;
      if (c.pedido_id) {
        const { data: ped, error: eP } = await sb.from('pedidos').select('estado,referencia_pago').eq('id', c.pedido_id).maybeSingle();
        if (eP) throw new Error('pedidos: ' + eP.message);
        // Si MercadoPago pagó ese link (falta reconciliar), no se anula.
        if (pagadoPorMP(ped)) return resp({ error: 'Ese link ya se pagó. Sincronízalo en Pagos MP antes de tocarlo.', code: 'YA_PAGADO', cobro: resumen(c, ped?.referencia_pago) }, 409);
        aMano = pagadoAMano(ped);
        refPedido = ped?.referencia_pago || null;
      }
      const baja = await darDeBajaEnMP(c, refPedido);
      if (!baja.ok) return resp({ error: 'MercadoPago no dejó dar de baja el link: ' + (baja.error || 'error') + '. No se anuló nada.', code: 'NO_SE_PUDO_VENCER' }, 502);

      // La orden pagada a mano queda 'pagado' (el update a 'expirado' exige
      // 'pendiente'); en el cobro queda anotado por qué se anuló igual.
      const { data: up, error: eU } = await sb.from('crm_pagos').update({
        estado: 'anulado', anulado_at: ahora(), anulado_motivo: motivo || null,
        ...(baja.prefId && !c.preferencia_id ? { preferencia_id: baja.prefId } : {}),
        ...(aMano ? { cotejo_detalle: conNota(c.cotejo_detalle, NOTA_A_MANO) } : {}),
      }).eq('id', cobroId).eq('estado', 'pendiente').select('*');
      if (eU) throw new Error('crm_pagos (anular): ' + eU.message);
      if (!up || !up.length) {
        const ahoraC = await leerCobro(cobroId);
        return resp({ error: `El cobro cambió a «${ahoraC?.estado || '?'}» mientras lo anulabas. Revisa antes de seguir.`, code: 'CAMBIO_ESTADO' }, 409);
      }
      const fila = up[0];
      if (fila.pedido_id) {
        const { error: eE } = await sb.from('pedidos').update({ estado: 'expirado' }).eq('id', fila.pedido_id).eq('estado', 'pendiente');
        if (eE) console.error('[crm-pago] pedido expirado (anular):', eE.message);
      }
      const folio = folioDeCobro(fila);
      // Si la ficha guardaba ESTE link como «el último», se saca: un link
      // anulado no se puede reenviar por error.
      const avisoFicha = await anotarEnFicha(fila, `🚫 Link ${folio} anulado${motivo ? ' · ' + motivo : ''}`, (g) => {
        if (Number(g.pago_cobro_id) === fila.id || (fila.link && g.pago_link === fila.link)) {
          delete g.pago_link; delete g.pago_link_monto; delete g.pago_link_at; delete g.pago_folio; delete g.pago_cobro_id;
        }
      });
      return resp({ ok: true, cobro: fila, ...(avisoFicha ? { aviso: 'El link quedó anulado, pero no se pudo anotar en la ficha.' } : {}) });
    }

    // ══ MANUAL ════════════════════════════════════════════════
    if (accion === 'manual') {
      const tipo = String(body.tipo || '');
      const r = await registrarPagoManual(sb, {
        tipo, refId: parseInt(body.ref_id) || 0, monto: parseInt(body.monto) || 0,
        medio: String(body.medio || ''), nota: body.nota ? String(body.nota) : null,
        via: 'manual', creadoPor: uid, creadoPorNombre: quien,
      });
      if (!r.ok) {
        const st = r.code === 'NO_EXISTE_FICHA' ? 404 : r.code === 'DATOS' ? 400 : 500;
        return resp({ error: r.error || 'No se pudo registrar el pago.', code: r.code || 'ERROR' }, st);
      }
      return resp({ ok: true, folio: r.folio, cobro: r.cobro, ficha: r.ficha, ...(r.aviso ? { aviso: r.aviso } : {}) });
    }

    // ══ ANULAR PAGO MANUAL ════════════════════════════════════
    // Un «💵 Pago manual» mal digitado no tenía vuelta: 'anular' es solo para
    // links sin pagar y devolver-pago necesita un pedido.
    if (accion === 'anular_manual') {
      const cobroId = parseInt(body.cobro_id);
      if (!cobroId) return resp({ error: 'Falta el cobro.', code: 'DATOS' }, 400);
      const r = await anularPagoManual(sb, { cobroId, motivo: body.motivo ? String(body.motivo) : null, por: quien });
      if (!r.ok) {
        const st = r.code === 'NO_EXISTE_COBRO' ? 404 : r.code === 'NO_ANULABLE' ? 409 : r.code === 'DATOS' ? 400 : 500;
        return resp({ error: r.error || 'No se pudo anular el pago.', code: r.code || 'ERROR' }, st);
      }
      return resp({ ok: true, folio: r.folio, cobro: r.cobro, ficha: r.ficha, ...(r.aviso ? { aviso: r.aviso } : {}) });
    }

    if (accion !== 'crear') return resp({ error: 'Acción desconocida.', code: 'ACCION_INVALIDA' }, 400);

    // ══ CREAR ═════════════════════════════════════════════════
    if (!MP_TOKEN) return resp({ error: 'MP_ACCESS_TOKEN no configurada' }, 503);
    const monto = parseInt(body.monto);
    // 'formulario' = un cumpleaños o reserva del Centro de Cumpleaños. Antes
    // solo se podía cobrar desde la pestaña vieja «Solicitudes Web».
    const tipo = TIPOS.includes(body.tipo) ? body.tipo : 'generico';
    const refId = parseInt(body.ref_id) || null;
    const concepto = String(body.concepto || 'Pago FRATE').slice(0, 80);
    const comprador = body.comprador || {};
    const motivoReemplazo = String(body.motivo || '').trim().slice(0, 200);
    if (!monto || monto < 1) return resp({ error: 'Monto inválido.' }, 400);

    // 1) La ficha tiene que existir: un link que apunta a nada es plata sin dueño.
    const ficha = await resolverFicha(sb, tipo, refId);
    if (!ficha) return resp({ error: 'No existe esa ficha.', code: 'NO_EXISTE_FICHA' }, 404);
    const email = String(comprador.email || ficha.email || '').trim();
    const nombre = String(comprador.nombre || ficha.nombre || 'Cliente').trim() || 'Cliente';
    if (!email) return resp({ error: 'Falta el email del cliente.' }, 400);

    // 2) ¿Ya hay un link sin pagar para esta misma ficha?
    const reemplazados: { id: number; folio: string }[] = [];
    if (refId) {
      const { data: pend, error: eP } = await sb.from('crm_pagos').select('*')
        .eq('tipo', tipo).eq('ref_id', refId).eq('estado', 'pendiente').order('created_at', { ascending: false });
      if (eP) throw new Error('crm_pagos (pendientes): ' + eP.message);
      if (pend && pend.length) {
        const pedIds = pend.map((p: any) => p.pedido_id).filter(Boolean);
        const peds: Record<number, any> = {};
        if (pedIds.length) {
          const { data: ps, error: ePs } = await sb.from('pedidos').select('id,estado,referencia_pago').in('id', pedIds);
          if (ePs) throw new Error('pedidos: ' + ePs.message);
          (ps || []).forEach((p: any) => { peds[p.id] = p; });
        }
        // Un «pendiente» cuyo pedido MercadoPago ya pagó es un pago sin reconciliar.
        // Va ANTES del YA_HAY_LINK: si no, el admin ofrece «Reenviar el mismo»
        // con un link ya pagado (y vivo: el cliente lo podía pagar de nuevo).
        // Reemplazarlo tampoco: lo marcaría como link muerto cuando entró plata.
        const yaPagado = pend.find((p: any) => pagadoPorMP(peds[p.pedido_id]));
        if (yaPagado) {
          return resp({
            error: 'Ese link ya se pagó. Sincronízalo en Pagos MP antes de generar otro.', code: 'YA_PAGADO',
            cobro: resumen(yaPagado, peds[yaPagado.pedido_id]?.referencia_pago),
          }, 409);
        }
        if (!body.reemplazar) {
          return resp({
            error: 'Esta ficha ya tiene un link sin pagar.', code: 'YA_HAY_LINK',
            cobro: resumen(pend[0], peds[pend[0].pedido_id]?.referencia_pago), pendientes: pend.length,
          }, 409);
        }
        for (const viejo of pend) {
          const refPed = peds[viejo.pedido_id]?.referencia_pago || null;
          const baja = await darDeBajaEnMP(viejo, refPed);
          if (!baja.ok) {
            return resp({
              error: `MercadoPago no dejó dar de baja el link ${folioDeCobro(viejo)}: ${baja.error || 'error'}. No se creó otro link.`,
              code: 'NO_SE_PUDO_VENCER', cobro: resumen(viejo, refPed),
            }, 502);
          }
          const { data: upV, error: eV } = await sb.from('crm_pagos').update({
            estado: 'reemplazado',
            ...(baja.prefId && !viejo.preferencia_id ? { preferencia_id: baja.prefId } : {}),
            ...(pagadoAMano(peds[viejo.pedido_id]) ? { cotejo_detalle: conNota(viejo.cotejo_detalle, NOTA_A_MANO) } : {}),
          }).eq('id', viejo.id).eq('estado', 'pendiente').select('id');
          if (eV) throw new Error('crm_pagos (reemplazar): ' + eV.message);
          if (!upV || !upV.length) {
            const ahoraC = await leerCobro(viejo.id);
            return resp({
              error: `El link ${folioDeCobro(viejo)} cambió a «${ahoraC?.estado || '?'}» mientras lo reemplazabas. Revisa antes de seguir.`,
              code: ahoraC?.estado === 'pagado' ? 'YA_PAGADO' : 'CAMBIO_ESTADO',
            }, 409);
          }
          if (viejo.pedido_id) {
            const { error: eE } = await sb.from('pedidos').update({ estado: 'expirado' }).eq('id', viejo.pedido_id).eq('estado', 'pendiente');
            if (eE) console.error('[crm-pago] pedido expirado (reemplazar):', eE.message);
          }
          reemplazados.push({ id: viejo.id, folio: folioDeCobro(viejo) });
        }
      }
    }

    // 3) Pedido pendiente (origen 'crm': no es una compra de entradas)
    const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
      nombre_cliente: nombre, email_cliente: email,
      estado: 'pendiente', total: monto, total_pagado: monto, metodo_pago: 'mercadopago', origen: 'crm',
    }).select('id').single();
    if (e1) throw e1;
    const folio = folioDe(ficha.prefijo, pedido.id);

    const deshacer = async (cobroId: number | null) => {
      if (cobroId) {
        const { error } = await sb.from('crm_pagos').delete().eq('id', cobroId);
        if (error) console.error('[crm-pago] no se pudo borrar el cobro', cobroId, error.message);
      }
      const { error } = await sb.from('pedidos').delete().eq('id', pedido.id);
      if (error) console.error('[crm-pago] no se pudo borrar el pedido', pedido.id, error.message);
    };

    // 4) Enlace CRM
    const { data: cobro, error: e2 } = await sb.from('crm_pagos').insert({
      pedido_id: pedido.id, tipo, ref_id: refId, monto, concepto, estado: 'pendiente',
      folio, servicio: ficha.servicio, tabla: ficha.tabla, medio: 'mercadopago',
      creado_por: uid, creado_por_nombre: quien,
    }).select('*').single();
    if (e2 || !cobro) {
      await deshacer(null);
      return resp({ error: 'No se pudo registrar el cobro: ' + (e2?.message || 'sin fila'), code: 'NO_SE_PUDO_REGISTRAR' }, 500);
    }

    // Dos personas cobrando la misma ficha al mismo tiempo: se queda el
    // primero que entró y el otro se deshace.
    if (refId) {
      const { data: otros, error: eO } = await sb.from('crm_pagos').select('*')
        .eq('tipo', tipo).eq('ref_id', refId).eq('estado', 'pendiente').lt('id', cobro.id).order('id', { ascending: true }).limit(1);
      if (eO) { await deshacer(cobro.id); throw new Error('crm_pagos (revisar duplicado): ' + eO.message); }
      if (otros && otros.length) {
        await deshacer(cobro.id);
        return resp({ error: 'Alguien acaba de generar un link para esta ficha.', code: 'YA_HAY_LINK', cobro: resumen(otros[0]), pendientes: 1 }, 409);
      }
    }

    // 5) Preferencia MercadoPago
    const prefijo = ficha.prefijo;
    const pref = {
      items: [{
        id: folio, title: `${concepto} · ${folio}`.slice(0, 120), description: 'Servicio FRATE',
        quantity: 1, currency_id: 'CLP', unit_price: monto,
      }],
      payer: { name: nombre, email },
      // ⚠️ NUMÉRICO y no cambia: mp-webhook, mp-pagos, mp-conciliar y
      //    devolver-pago lo leen como número de pedido.
      external_reference: String(pedido.id),
      metadata: { frate_tipo: 'servicio', folio, servicio: ficha.servicio, tabla: ficha.tabla, ficha_id: refId },
      // Página propia: un cobro de servicio no promete entradas con QR.
      back_urls: {
        success: `${SITE_URL}/pago-servicio.html?s=${prefijo}&estado=ok`,
        pending: `${SITE_URL}/pago-servicio.html?s=${prefijo}&estado=pendiente`,
        failure: `${SITE_URL}/pago-servicio.html?s=${prefijo}&estado=error`,
      },
      auto_return: 'approved',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      statement_descriptor: 'FRATE',
    };
    let mpData: any = {};
    let mpOk = false;
    try {
      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST', headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(pref),
      });
      mpData = await mpRes.json().catch(() => ({}));
      mpOk = mpRes.ok && !!mpData?.id && !!mpData?.init_point;
    } catch (e) { mpData = { message: String((e as any)?.message || e) }; }
    if (!mpOk) {
      await deshacer(cobro.id);
      throw new Error(mpData?.message || 'Error creando la preferencia MercadoPago');
    }

    // 6) Guardar el link: sin esto no se puede ver ni reenviar
    const avisos: string[] = [];
    const { data: upC, error: eL } = await sb.from('crm_pagos')
      .update({ link: mpData.init_point, preferencia_id: String(mpData.id) }).eq('id', cobro.id).select('*').single();
    if (eL) { console.error('[crm-pago] guardar link:', eL.message); avisos.push('El link no quedó guardado en el cobro: cópialo ahora.'); }
    const { error: eR } = await sb.from('pedidos').update({ referencia_pago: `PREF-${mpData.id}` }).eq('id', pedido.id);
    if (eR) console.error('[crm-pago] referencia_pago:', eR.message);
    const fila = upC || { ...cobro, link: mpData.init_point, preferencia_id: String(mpData.id) };

    if (reemplazados.length) {
      const { error: eRp } = await sb.from('crm_pagos').update({ reemplazado_por: fila.id }).in('id', reemplazados.map((r) => r.id));
      if (eRp) console.error('[crm-pago] reemplazado_por:', eRp.message);
    }

    // 7) La ficha: fila FRESCA + solo los campos del link (nunca se pisa el resto)
    if (ficha.tabla === 'formularios' && refId) {
      const r = await actualizarFichaFormulario(sb, refId, (g, hist) => {
        const ts = ahora();
        const g2 = { ...g, pago_link: mpData.init_point, pago_link_monto: monto, pago_link_at: ts, pago_folio: folio, pago_cobro_id: fila.id };
        for (const rv of reemplazados) hist.push({ ts, ev: `↩️ ${rv.folio} reemplazado por ${folio}${motivoReemplazo ? ' · ' + motivoReemplazo : ''}`, ...(quien ? { por: quien } : {}) });
        hist.push({ ts, ev: `🔗 Link de pago ${folio} ${clp(monto)} · ${concepto}`, ...(quien ? { por: quien } : {}) });
        return { gestion: g2, historial: hist };
      });
      if (!r.ok) { console.error('[crm-pago] ficha:', r.error); avisos.push('El link se creó, pero no quedó anotado en la ficha.'); }
    }

    return resp({
      ok: true, pedidoId: pedido.id, initPoint: mpData.init_point, folio, cobro: fila,
      ...(reemplazados.length ? { reemplazados: reemplazados.map((r) => r.folio) } : {}),
      ...(avisos.length ? { aviso: avisos.join(' ') } : {}),
    });

  } catch (err) {
    console.error('[crm-pago]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
