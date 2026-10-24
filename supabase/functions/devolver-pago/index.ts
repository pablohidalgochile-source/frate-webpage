// ============================================================
// FRATE — Edge Function: devolver-pago
// Hace la devolución REAL de un pago en MercadoPago
// (POST /v1/payments/{id}/refunds). Solo un admin puede llamarla.
// Marca el pedido como 'reembolsado'.
//
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { avisarStaff } from '../_shared/avisar.ts';
import { devolverCobro, devueltoSinRegistrar, folioDeCobro } from '../_shared/cobros.ts';

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
    const { data: perfil } = await admin.from('clientes').select('rol,username,nombres,apellidos,email').eq('id', uid).maybeSingle();
    if (perfil?.rol !== 'admin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403, headers: cors });
    // Quién devuelve la plata. Sale del token, no del navegador: la nota de
    // crédito se la lleva el contador y tiene que decir quién la emitió.
    const quien = perfil.username ? '@' + perfil.username
                : ((perfil.nombres || '') + ' ' + (perfil.apellidos || '')).trim() || perfil.email || 'admin';

    // `medio` (solo cobros de servicio, modo manual): 'transferencia' | 'efectivo' = la
    // plata salió por fuera de MercadoPago. Sin medio (o 'mercadopago'), la devolución
    // manual de un cobro se toma como el registro de lo devuelto por MercadoPago.
    const { pedidoId, modo, motivo, qr, monto, qrs, medio } = await req.json() as { pedidoId: number; modo?: string; motivo?: string; qr?: string; monto?: number; qrs?: string[]; medio?: string };

    // ── Modo RECHAZAR_QR: la incidencia de puerta no procede (no necesita pedido) ──
    if (modo === 'rechazar_qr') {
      if (!qr) throw new Error('Falta qr');
      await admin.from('qr_usados').update({ incidencia: 'rechazada', incidencia_nota: motivo || null }).eq('qr_id', qr);
      return new Response(JSON.stringify({ ok: true, modo: 'rechazar_qr' }), { headers: cors });
    }

    if (!pedidoId) throw new Error('Falta pedidoId');

    const { data: pedido } = await admin.from('pedidos').select('*').eq('id', pedidoId).single();
    if (!pedido) throw new Error('Pedido no encontrado');

    // Días hábiles que se informan al cliente (configurable)
    const { data: cfgDias } = await admin.from('config_valores').select('valor').eq('clave', 'devolucion_dias_habiles').maybeSingle();
    const DIAS = parseInt(cfgDias?.valor || '5') || 5;

    // ══ 🔒 TOPE DE DEVOLUCIÓN ═════════════════════════════════════
    // Ningún modo comparaba el estado antes de devolver: la misma orden se
    // podía devolver dos veces. En automático MercadoPago corta por saldo;
    // en MANUAL y en CRÉDITO no había nada, y la plata salía las veces que
    // se apretara el botón.
    //
    // Van dos candados a propósito:
    //   1. El estado 'reembolsado' — funciona siempre, no depende de columnas.
    //   2. El acumulado en `dev_monto` — más fino, permite parciales legítimas
    //      mientras la suma no pase el total. Si la columna no existe, el
    //      candado 1 igual sostiene.
    const _totalPed = Number(pedido.total_pagado ?? pedido.total) || 0;
    const _yaDev    = Number((pedido as any).dev_monto) || 0;
    const _mueveP   = ['credito', 'credito_qr', 'manual', 'automatico'].includes(String(modo));
    const _porTicket = Array.isArray(qrs) && qrs.filter(Boolean).length > 0;

    // 🎂 Cobro de servicio devuelto por FUERA de 💸 Devolver (panel de MP o contracargo):
    // el aviso de MP ya lo descontó de la ficha, lo sumó a dev_monto y, si fue todo,
    // dejó la orden 'reembolsado'. Faltaba su nota de crédito, y la «Devolución manual»
    // que se hace para sacarla se recortaba al resto (NC de $8.000 por $92.000 devueltos)
    // o daba 409. Ahora esa plata no cuenta contra el tope ni bloquea, SOLO en manual.
    // Con `medio` transferencia/efectivo es otra plata: se aplican los candados de siempre.
    //
    // Mientras esa devolución no tenga su nota de crédito (`exacto` > 0), el cobro no se
    // toca de otra forma. Antes la automática se recortaba en silencio a lo que quedaba y
    // MP devolvía la retención (panel $60.000 + automática → al cliente $100.000), y una
    // manual por otro monto (el 92 % que propone el modal) descontaba la diferencia de la
    // ficha sin avisar. Ahora:
    //   · automático → 409 REGISTRAR_NC_PRIMERO { monto }.
    //   · manual sin medio → solo ese monto exacto (±1), que queda como su nota de
    //     crédito; otro monto → 409 MONTO_NC_EXACTO { monto }. Si antes hubo una manual
    //     dudosa de ese pago (V4/V16: pudo ser una transferencia registrada sin medio),
    //     también se acepta lo que salió del panel completo (`monto_completo`).
    // Con medio transferencia/efectivo no hay monto exacto: es otra plata.
    const _medioAparte = medio === 'transferencia' || medio === 'efectivo';
    let _cobroPrevio: any = null;
    let _sinReg: ReturnType<typeof devueltoSinRegistrar> = { total: 0, porPago: {}, sinPago: 0, exacto: 0, completo: 0 };
    let _montoNC = 0;
    if (((modo === 'manual' && !_medioAparte) || modo === 'automatico') && !_porTicket && (pedido as any).origen === 'crm') {
      const { data: cps, error: eCp } = await admin.from('crm_pagos').select('*').eq('pedido_id', pedidoId).order('id', { ascending: false }).limit(1);
      if (eCp) console.error('[devolver-pago] leer cobro para el tope:', eCp.message);
      else if (cps?.[0]) {
        const sr = devueltoSinRegistrar(cps[0]);
        const _clpExacto = '$' + sr.exacto.toLocaleString('es-CL');
        if (modo === 'automatico') {
          if (sr.exacto > 0) {
            return new Response(JSON.stringify({
              error: `Primero registra la nota de crédito de lo devuelto en el panel de MercadoPago: ${_clpExacto}`,
              code: 'REGISTRAR_NC_PRIMERO', monto: sr.exacto,
            }), { status: 409, headers: cors });
          }
        } else {
          _cobroPrevio = cps[0]; _sinReg = sr;
          const _pedido0 = (typeof monto === 'number' && monto > 0) ? Math.round(monto) : (Number(pedido.total_pagado || pedido.total) || 0);
          // Cobro con devoluciones del panel sin registrar en MÁS de un pago: la manual se ata a
          // uno (el de más plata, abajo), así que el monto exacto es el de ese pago y el resto se
          // registra después (la automática lo sigue pidiendo). Con el total se descontaba de más.
          const _pend = Object.values(sr.porPago).sort((a, b) => b - a);
          const _exacto = _pend.length > 1 ? Math.min(sr.exacto, _pend[0]) : sr.exacto;
          const _completo = _pend.length <= 1 && sr.completo > sr.exacto + 1 ? sr.completo : 0;
          if (_exacto > 0) {
            if (Math.abs(_pedido0 - _exacto) <= 1) _montoNC = _exacto;
            else if (_completo && Math.abs(_pedido0 - _completo) <= 1) _montoNC = _completo;
            else {
              return new Response(JSON.stringify({
                error: `MercadoPago informa $${_exacto.toLocaleString('es-CL')} devueltos desde su panel sin nota de crédito${_pend.length > 1 ? ' en uno de los pagos de este cobro' : ''}. Sin medio, la «Devolución manual» solo registra ese monto exacto`
                  + (_completo ? ` (o $${_completo.toLocaleString('es-CL')}, lo que salió del panel completo, si una «Devolución manual» anterior de este cobro fue por transferencia o efectivo)` : '')
                  + '. Si esta plata salió por transferencia o efectivo, elige ese medio.',
                code: 'MONTO_NC_EXACTO', monto: _exacto, ...(_completo ? { monto_completo: _completo } : {}),
              }), { status: 409, headers: cors });
            }
          }
        }
      }
    }
    // La nota de crédito de lo devuelto desde el panel va por su monto exacto (uno de los dos).
    const _ncExacta = modo === 'manual' && _montoNC > 0;

    if (_mueveP && pedido.estado === 'reembolsado' && !_porTicket && modo !== 'credito_qr' && !(_sinReg.total > 0)) {
      return new Response(JSON.stringify({
        error: 'Esta orden ya está devuelta por completo. Si falta algo, revísalo en el detalle antes de volver a devolver.',
        ya_devuelto: _yaDev || _totalPed,
      }), { status: 409, headers: cors });
    }
    // Lo devuelto por fuera de 💸 Devolver sin registrar no cuenta como devuelto, y
    // siempre se puede registrar (aunque dev_monto venga inflado por devoluciones anteriores).
    const _restante = _totalPed > 0
      ? Math.max(Math.max(0, _totalPed - Math.max(0, _yaDev - _sinReg.total)), _sinReg.total)
      : Number.MAX_SAFE_INTEGER;
    if (_mueveP && _totalPed > 0 && _restante <= 0) {
      return new Response(JSON.stringify({
        error: `Ya se devolvió el total de esta orden ($${_yaDev.toLocaleString('es-CL')} de $${_totalPed.toLocaleString('es-CL')}).`,
        ya_devuelto: _yaDev,
      }), { status: 409, headers: cors });
    }
    // Suma al acumulado. Si la columna no existe, no rompe nada.
    const _anotarDevuelto = async (m: number) => {
      if (!(m > 0)) return;
      await admin.from('pedidos').update({ dev_monto: _yaDev + m }).eq('id', pedidoId)
        .then(() => {}, () => {});
    };
    // ══════════════════════════════════════════════════════════════

    // Aviso por correo al cliente (si Resend está configurado; si no, sigue sin correo)
    // El correo de devolución era texto pelado con un <h2>FRATE</h2>. Ahora usa
    // el lenguaje visual de FRATE: cabecera de color, tipografía y botón.
    const correoHTML = (titulo: string, cuerpo: string) => `
<div style="background:#0a0a0d;margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <div style="max-width:520px;margin:0 auto;background:#0a0a0d;">
  <div style="background:linear-gradient(135deg,#E8363D,#9D4BFF);padding:26px 20px;text-align:center;">
    <div style="color:#fff;font-size:13px;font-weight:700;letter-spacing:4px;">FRATERNIDAD</div>
    <div style="color:#fff;font-size:22px;font-weight:800;margin-top:10px;">${titulo}</div>
  </div>
  <div style="padding:22px 20px;">
    <div style="color:#ccc;font-size:14px;">Hola <b style="color:#fff;">${String(pedido.nombre_cliente||'').split(' ')[0]}</b>,</div>
    <div style="color:#aaa;font-size:13px;line-height:1.65;margin-top:10px;">${cuerpo}</div>
    <a href="https://www.frate.cl" style="display:block;background:#E8363D;color:#fff;text-align:center;padding:13px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;margin-top:20px;">Ver próximos eventos</a>
    <div style="color:#666;font-size:11px;text-align:center;margin-top:14px;line-height:1.5;">¿Dudas? Responde este correo o escríbenos por Instagram.</div>
  </div>
  <div style="border-top:1px solid #26262b;padding:14px 20px;text-align:center;color:#5a5a62;font-size:10px;">
    Orden FCC-${String(pedido.id).padStart(6,'0')} · FRATE · frate.cl</div>
 </div>
</div>`;

    // La cuenta desglosada. Antes decía «se retuvo una parte» sin decir
    // cuánto ni por qué, y esa frase generaba la mitad de las respuestas.
    const cuentaHTML = (pagado: number, devuelto: number) => {
      const dif = Math.max(0, pagado - devuelto);
      const fila = (t: string, v: string, c = '#aaa') =>
        `<tr><td style="color:${c};font-size:13px;padding:5px 0;">${t}</td>
             <td style="color:${c};font-size:13px;padding:5px 0;text-align:right;">${v}</td></tr>`;
      return `<table style="width:100%;border-collapse:collapse;background:#131316;border-radius:10px;padding:0;margin:14px 0;">
        <tr><td colspan="2" style="padding:12px 14px 0;"></td></tr>
        ${fila('Pagaste', '$' + pagado.toLocaleString('es-CL'), '#f4f4f6').replace('<tr>','<tr style="border-bottom:1px solid #26262b;">')}
        ${dif > 0 ? fila('Retención y cargo por servicio', '−$' + dif.toLocaleString('es-CL'), '#ff8a95') : ''}
        <tr><td style="color:#fff;font-size:14px;font-weight:700;padding:11px 14px 14px;border-top:1px solid #26262b;">Te devolvemos</td>
            <td style="color:#00E676;font-size:19px;font-weight:800;padding:11px 14px 14px;text-align:right;border-top:1px solid #26262b;">$${devuelto.toLocaleString('es-CL')}</td></tr>
      </table>`;
    };

    const mailCliente = async (asunto: string, cuerpo: string) => {
      try {
        const key = Deno.env.get('RESEND_API_KEY');
        if (!key || !pedido.email_cliente) return;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Frate Tickets <tickets@frate.cl>',
            to: [pedido.email_cliente],
            subject: asunto,
            html: correoHTML(asunto, cuerpo),
          }),
        });
      } catch (e) { console.error('[devolver-pago] mail:', e); }
    };

    // Registra los NÚMEROS de la devolución para el Centro de Notas de Crédito.
    // Best-effort: si las columnas dev_*/nc_* no existen aún (falta correr frate-notas-credito.sql),
    // el update falla en silencio y NO rompe la devolución (que ya quedó hecha en el update principal).
    const registrarNC = async (tipo: string, montoNC: number, qrsNC: string[] = [], motivoNC: string | null = null) => {
      const neto = Math.round(montoNC / 1.19);
      // ⚠️ Estaba fija en 3,5%. La real de la cuenta es 3,08% (verificado con
      //    una liquidación: MP cobró $898 sobre $29.160 y reintegró $765 sobre
      //    $24.840). Sobreestimaba ~$104 por devolución.
      //    Ahora sale de `config_valores.comision_mp_pct`, editable sin tocar código.
      let mpPct = 3.08;
      try {
        const { data: cfgMp } = await admin.from('config_valores')
          .select('valor').eq('clave','comision_mp_pct').maybeSingle();
        const n = parseFloat(String(cfgMp?.valor ?? ''));
        if (!isNaN(n) && n >= 0 && n <= 20) mpPct = n;
      } catch (_) {}
      const comision = tipo === 'mercadopago' ? Math.round(montoNC * mpPct / 100) : 0;
      // 1) Tabla propia: UNA FILA POR DEVOLUCIÓN. Antes todo vivía en columnas de
      //    `pedidos`, así que dos devoluciones parciales del mismo pedido se pisaban
      //    (dos de $8.000 quedaban como $8.000) y el IVA a recuperar salía a la mitad.
      try {
        await admin.from('notas_credito').insert({
          pedido_id: pedidoId, monto: montoNC, neto, iva: montoNC - neto,
          comision_reintegrada: comision, tipo,
          qrs: qrsNC, motivo: motivoNC, emitida: false,
          emitida_por: quien, emitida_por_id: uid,
        });
      } catch (_) {
        // Sin las columnas nuevas todavía → se guarda igual, sin el emisor.
        try {
          await admin.from("notas_credito").insert({
            pedido_id: pedidoId, monto: montoNC, neto, iva: montoNC - neto,
            comision_reintegrada: comision, tipo, qrs: qrsNC, motivo: motivoNC, emitida: false,
          });
        } catch (_) { /* aún no está creada la tabla */ }
      }
      // 2) Se mantiene el resumen en `pedidos` (lo usan las vistas actuales).
      //    Acumula en vez de pisar, para que el total del pedido cuadre.
      try {
        const { data: pAnt } = await admin.from('pedidos').select('dev_monto,dev_neto,dev_iva,dev_comision_reint').eq('id', pedidoId).maybeSingle();
        await admin.from('pedidos').update({
          dev_monto: (pAnt?.dev_monto || 0) + montoNC,
          dev_neto:  (pAnt?.dev_neto  || 0) + neto,
          dev_iva:   (pAnt?.dev_iva   || 0) + (montoNC - neto),
          dev_comision_reint: (pAnt?.dev_comision_reint || 0) + comision,
          dev_fecha: new Date().toISOString(), dev_tipo: tipo, nc_emitida: false,
        }).eq('id', pedidoId);
      } catch (_) { /* columnas NC no creadas todavía */ }
    };

    // ── Modo CRÉDITO (reactivación): anula la compra y abona crédito FRATE ──
    // No sale plata: el valor de las entradas (sin cargo de servicio)
    // queda como crédito para la próxima compra. QRs mueren solos.
    if (modo === 'credito') {
      if (!pedido.cliente_id) return new Response(JSON.stringify({ error: 'Esta compra no tiene cuenta asociada — usa devolución manual.' }), { status: 409, headers: cors });
      const monto = Math.min(pedido.total || 0, _restante);   // nunca más de lo que queda
      if (!(monto > 0)) return new Response(JSON.stringify({ error: 'No queda saldo por devolver en esta orden.' }), { status: 409, headers: cors });
      await admin.from('pedidos').update({
        estado: 'reembolsado',
        dev_estado: 'aprobada',
        dev_respuesta: 'Convertida en crédito FRATE',
        referencia_pago: (pedido.referencia_pago || '') + '-CREDITO',
      }).eq('id', pedidoId);
      const { data: cli } = await admin.from('clientes').select('credito').eq('id', pedido.cliente_id).maybeSingle();
      await admin.from('clientes').update({ credito: (cli?.credito || 0) + monto }).eq('id', pedido.cliente_id);
      await admin.from('movimientos').insert({ cliente_id: pedido.cliente_id, tipo: 'credito', monto, concepto: 'Reactivación FCC-' + String(pedido.id).padStart(6, '0'), pedido_id: pedido.id });
      await _anotarDevuelto(monto);
      await registrarNC('credito', monto);
      await mailCliente('♻️ Tu entrada quedó como crédito — FRATE',
        `¡Listo! Aprobamos tu solicitud: tus entradas de la orden quedaron anuladas y ahora tienes <b>$${monto.toLocaleString('es-CL')} de crédito FRATE</b> en tu cuenta. Úsalo para el evento que quieras desde <a href="https://frate.cl">frate.cl</a> (en el pago, toca "Usar" tu crédito).`);
      return new Response(JSON.stringify({ ok: true, modo: 'credito', monto }), { headers: cors });
    }

    // ── Modo CRÉDITO_QR (incidencia de puerta): abona SOLO esa entrada ──
    if (modo === 'credito_qr') {
      if (!qr) throw new Error('Falta qr');
      if (!pedido.cliente_id) return new Response(JSON.stringify({ error: 'Compra sin cuenta asociada — resuélvelo manual.' }), { status: 409, headers: cors });
      const { data: item } = await admin.from('items_pedido').select('precio_unitario').eq('pedido_id', pedidoId).filter('qr_ids', 'cs', JSON.stringify([qr])).maybeSingle();
      const _mQr = item?.precio_unitario || 0;
      if (!_mQr) return new Response(JSON.stringify({ error: 'No se encontró esa entrada en la orden.' }), { status: 404, headers: cors });
      const monto = Math.min(_mQr, _restante);
      if (!(monto > 0)) return new Response(JSON.stringify({ error: 'Ya se devolvió el total de esta orden.' }), { status: 409, headers: cors });
      const { data: cli } = await admin.from('clientes').select('credito').eq('id', pedido.cliente_id).maybeSingle();
      await admin.from('clientes').update({ credito: (cli?.credito || 0) + monto }).eq('id', pedido.cliente_id);
      await admin.from('movimientos').insert({ cliente_id: pedido.cliente_id, tipo: 'credito', monto, concepto: 'Incidencia puerta ' + qr, pedido_id: pedido.id });
      await _anotarDevuelto(monto);
      await admin.from('qr_usados').update({ incidencia: 'resuelta_credito' }).eq('qr_id', qr);
      await mailCliente('♻️ Crédito por tu entrada — FRATE',
        `Revisamos lo que pasó en la puerta y te abonamos <b>$${monto.toLocaleString('es-CL')} de crédito FRATE</b> por tu entrada. Úsalo en tu próxima compra en <a href="https://frate.cl">frate.cl</a>.`);
      return new Response(JSON.stringify({ ok: true, modo: 'credito_qr', monto }), { headers: cors });
    }

    // ── Modo RECHAZAR: la solicitud del cliente no procede ───────
    if (modo === 'rechazar') {
      await admin.from('pedidos').update({ dev_estado: 'rechazada', dev_respuesta: motivo || null }).eq('id', pedidoId);
      await mailCliente('Tu solicitud de devolución — FRATE',
        `Revisamos tu solicitud de devolución y no fue aprobada.${motivo ? ` Motivo: <b>${motivo}</b>.` : ''} Tus entradas siguen válidas. Cualquier duda, escríbenos por WhatsApp.`);
      return new Response(JSON.stringify({ ok: true, modo: 'rechazada' }), { headers: cors });
    }

    // Monto a devolver: total por defecto, o parcial si viene un 'monto' menor.
    const totalPed = pedido.total_pagado || pedido.total || 0;
    const _pedido2 = (typeof monto === 'number' && monto > 0 && monto < totalPed) ? Math.round(monto) : totalPed;
    // Nunca más de lo que queda por devolver, pase lo que pase. (La NC de lo devuelto
    // desde el panel ya pasó el candado de monto exacto: va justo por ese monto.)
    const montoDev = _ncExacta ? _montoNC : Math.min(_pedido2, _restante);
    if (!(montoDev > 0)) return new Response(JSON.stringify({ error: 'Ya se devolvió el total de esta orden.' }), { status: 409, headers: cors });
    const parcial = montoDev < totalPed;

    // ── Devolución POR TICKET: qrs = entradas específicas a anular ──
    // Si vienen QRs, quemamos SOLO esas entradas (no pueden entrar) y decidimos
    // si la orden queda 'pagado' (quedan entradas válidas) o 'reembolsado' (todas devueltas).
    const qrList = Array.isArray(qrs) ? qrs.filter(Boolean) : [];
    let estadoFinal = 'reembolsado';
    if (qrList.length) {
      const { data: itemsPed } = await admin.from('items_pedido').select('qr_ids').eq('pedido_id', pedidoId);
      const allQrs = (itemsPed || []).flatMap((i: any) => Array.isArray(i.qr_ids) ? i.qr_ids : []);
      const { data: prevRef } = await admin.from('qr_usados').select('qr_id').eq('pedido_id', pedidoId).eq('incidencia', 'reembolsado');
      const refunded = new Set([...(prevRef || []).map((r: any) => r.qr_id), ...qrList]);
      estadoFinal = (allQrs.length > 0 && allQrs.every((q: string) => refunded.has(q))) ? 'reembolsado' : 'pagado';
    }
    // Quema las entradas devueltas: quedan marcadas 'reembolsado' en qr_usados → la puerta las rechaza.
    // Si la orden sigue 'pagado' (parcial por ticket), el trigger NO devuelve stock (no hay doble conteo);
    // si pasa a 'reembolsado', el trigger repone todo el stock del pedido.
    const quemarQrs = async () => {
      for (const q of qrList) {
        const { data: ex } = await admin.from('qr_usados').select('qr_id').eq('qr_id', q).maybeSingle();
        if (ex) await admin.from('qr_usados').update({ incidencia: 'reembolsado', pedido_id: pedidoId }).eq('qr_id', q);
        else    await admin.from('qr_usados').insert({ qr_id: q, pedido_id: pedidoId, incidencia: 'reembolsado' });
      }
    };
    const sufTk = qrList.length ? `${qrList.length} entrada(s) ` : '';

    // ── 🎂 Cobro de servicio (cumpleaños/reserva, origen 'crm') ─────
    // Antes la devolución no tocaba la ficha: la plata salía y la ficha seguía
    // diciendo «pagado». Ahora, DESPUÉS de que la devolución quedó hecha, se
    // descuenta del cobro y de la ficha con el helper compartido (tiene tope:
    // nunca descuenta más de lo cobrado, así el 'refunded' que después manda MP
    // por el mismo pago no se resta dos veces).
    // ⚠️ La nota de crédito se registra IGUAL que una devolución de entradas
    //    (registrarNC de siempre). Si un servicio debe llevar NC o no es una
    //    decisión pendiente del dueño: no se cambió a propósito.
    // Nunca rompe la devolución: si falla, se avisa al staff para cuadrarlo a mano.
    //
    // ¿Es un cobro? Por origen, y de refuerzo por la fila de crm_pagos (igual
    // que mp-webhook y mp-pagos): un cobro cuyo pedido quedó con origen 'web'
    // (01b sin correr, o link del crm-pago viejo) también descuenta la ficha.
    let _esCobro: boolean | null = null;
    const _esCobroCrm = async (): Promise<boolean> => {
      if (_esCobro != null) return _esCobro;
      if ((pedido as any).origen === 'crm') return (_esCobro = true);
      const { data: cps, error: eCp } = await admin.from('crm_pagos').select('id').eq('pedido_id', pedidoId).limit(1);
      // La devolución ya está hecha: si no se puede revisar, queda en el log (casi siempre es una orden de entradas).
      if (eCp) { console.error('[devolver-pago] ¿es cobro? crm_pagos:', eCp.message); return (_esCobro = false); }
      return (_esCobro = !!(cps && cps.length));
    };
    // `montoCobro` va al helper; `montoTxt` es lo que salió en ESTA devolución
    // (para el aviso). `pago` = devolución de un pago de MP: se lleva por payment
    // id. Si `acumulado`, montoCobro es el total devuelto de ese pago según MP;
    // `registro` es lo que se registra ahora (queda [dev-reg] aunque ya se haya
    // descontado); `refunds` = detalle de MP con fechas; `presunto` = el pago se
    // sacó de la orden (manual), no de la devolución. `motivoCobro` reemplaza al motivo.
    // `aparte` = salió por transferencia o efectivo (con `medio`): queda marcada como otra plata.
    const _devolverCobroCrm = async (montoCobro: number, clave: string | null, montoTxt: number,
                                     pago?: { paymentId: string; acumulado: boolean; registro?: number; refunds?: any[] | null; presunto?: boolean },
                                     motivoCobro?: string | null, aparte = false) => {
      if (!(await _esCobroCrm())) return undefined;
      try {
        const r = await devolverCobro(admin, {
          pedidoId, monto: montoCobro, clave, motivo: motivoCobro ?? (motivo || null),
          ...(aparte ? { aparte: true } : {}),
          ...(pago ? {
            paymentId: pago.paymentId, acumulado: pago.acumulado, registro: pago.registro ?? null,
            refundsMP: pago.refunds ?? null, pagoPresunto: !!pago.presunto,
          } : {}),
        });
        if (r.error || !r.esCobro) {
          const folio = r.cobro ? folioDeCobro(r.cobro) : 'FCC-' + String(pedidoId).padStart(6, '0');
          const porque = r.error === 'sin_pago_registrado'
            ? 'el cobro no tenía ningún pago registrado (nunca se sumó a la ficha)'
            : r.error === 'pago_no_registrado' ? `el pago MP ${pago?.paymentId || ''} no está registrado en ese cobro`
            : r.error === 'ficha_pendiente' ? 'ese pago nunca se alcanzó a sumar a la ficha (ni el pago ni la devolución quedaron en ella; no descuentes nada que la ficha no tenga)'
            : !r.esCobro && !r.error ? 'no se encontró el cobro de esta orden' : (r.error || 'error');
          await avisarStaff(admin, {
            titulo: `🚨 Devolución ${folio} sin registrar en el cobro`,
            detalle: `Se devolvieron $${montoTxt.toLocaleString('es-CL')} de la orden #${pedidoId}, pero el cobro/ficha NO se actualizó: ${porque}.\n`
              + (r.error === 'ficha_pendiente' ? 'Revisa la ficha a mano.' : 'Revisa la ficha y descuéntalo a mano.') + ` Por ${quien}.`,
          });
        }
        return { folio: r.cobro ? folioDeCobro(r.cobro) : null, montoAplicado: r.montoAplicado ?? 0, yaEstaba: !!r.yaEstaba, error: r.error || (!r.esCobro ? 'sin_cobro' : null),
                 sinRegistrar: r.sinRegistrar ?? 0, absorbido: r.absorbido ?? 0 };
      } catch (e) {
        console.error('[devolver-pago] cobro crm:', e);
        return { folio: null, montoAplicado: 0, yaEstaba: false, error: String((e as any)?.message || e), sinRegistrar: 0, absorbido: 0 };
      }
    };
    // Lo que MP informa devuelto de ese pago (con el detalle y sus fechas). null
    // si no se pudo leer: ahí vale solo lo que se registra.
    const _leerPagoMP = async (pid: string): Promise<{ devuelto: number; refunds: any[] | null } | null> => {
      try {
        const rp = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` }, signal: AbortSignal.timeout(10000) });
        if (!rp.ok) { console.error('[devolver-pago] no se pudo leer el pago para el cobro:', rp.status); return null; }
        const pj = await rp.json().catch(() => null);
        if (!pj) return null;
        return { devuelto: Math.round(Number(pj.transaction_amount_refunded) || 0), refunds: Array.isArray(pj.refunds) ? pj.refunds : null };
      } catch (e) {
        console.error('[devolver-pago] leer pago para el cobro:', e);
        return null;
      }
    };

    // ── Modo MANUAL: solo marcar como reembolsado ────────────────
    if (modo === 'manual') {
      await admin.from('pedidos').update({ estado: estadoFinal, dev_estado: pedido.dev_estado === 'pendiente' ? 'aprobada' : pedido.dev_estado, dev_respuesta: `Manual ${parcial ? 'parcial ' : ''}${sufTk}$${montoDev.toLocaleString('es-CL')}`, referencia_pago: (pedido.referencia_pago || '') + '-MANUAL' }).eq('id', pedidoId);
      // Lo que el aviso de MP ya sumó a dev_monto no se vuelve a sumar.
      await _anotarDevuelto(montoDev - Math.min(montoDev, _sinReg.total));
      await quemarQrs();
      await registrarNC('manual', montoDev, qrList);
      // Cobro pagado por MP: la «Devolución manual» casi siempre registra plata que
      // se devolvió en el panel de MP (es la forma de sacar la nota de crédito). Se
      // lleva POR PAGO, con las mismas marcas que el aviso de MP: el que llegue
      // segundo aplica solo la diferencia (antes se descontaba dos veces, #38/#39).
      // Con medio transferencia/efectivo es otra plata: va al cobro, sin marca de pago
      // ([dev-aparte]), y no la toma una devolución del panel (ni antes ni después).
      let cobroCrm: Awaited<ReturnType<typeof _devolverCobroCrm>>;
      let pidManual = String(pedido.referencia_pago || '').match(/MP-(\d+)/)?.[1];
      let presunto = true;
      // Cobro con más de un pago: si uno tiene una devolución de MP sin registrar, esta
      // manual es su registro (antes quedaba sin pago y se descontaba otra vez).
      const pidSinReg = Object.entries(_sinReg.porPago).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (pidSinReg && Array.isArray(_cobroPrevio?.pagos_extra) && _cobroPrevio.pagos_extra.length) { pidManual = pidSinReg; presunto = false; }
      if (_medioAparte) {
        cobroCrm = await _devolverCobroCrm(montoDev, null, montoDev, undefined, `${motivo ? motivo + ' · ' : ''}por ${medio}`, true);
      } else if (pidManual && await _esCobroCrm()) {
        const mp = await _leerPagoMP(pidManual);
        cobroCrm = await _devolverCobroCrm(mp && mp.devuelto > 0 ? mp.devuelto : montoDev, null, montoDev,
          { paymentId: pidManual, acumulado: !!(mp && mp.devuelto > 0), registro: montoDev, refunds: mp?.refunds ?? null, presunto });
      } else {
        cobroCrm = await _devolverCobroCrm(montoDev, null, montoDev);
      }
      // Lo registrado se tomó ENTERO como la nota de crédito de una devolución del
      // panel más grande: puede ser eso con otro monto, u OTRA plata (transferencia).
      // No hay cómo saberlo sin `medio`: se avisa con los dos caminos (SPEC, límites).
      // Con el aviso de MP ya procesado no llega acá (409 MONTO_NC_EXACTO): pasa cuando
      // MP ya informa la devolución del panel pero su aviso todavía no se procesó. El
      // registro quedó [dev-dudosa]: los dos caminos del aviso son montos que se aceptan.
      if (cobroCrm && !cobroCrm.error && cobroCrm.absorbido >= montoDev - 1 && cobroCrm.sinRegistrar - montoDev > 1) {
        const falta = cobroCrm.sinRegistrar - montoDev;
        await avisarStaff(admin, {
          titulo: `🧾 ${cobroCrm.folio || 'FCC-' + String(pedidoId).padStart(6, '0')}: revisa la devolución manual de $${montoDev.toLocaleString('es-CL')}`,
          detalle: `Registraste $${montoDev.toLocaleString('es-CL')} con «Devolución manual» (orden #${pedidoId}) y MercadoPago informa $${cobroCrm.sinRegistrar.toLocaleString('es-CL')} devueltos desde su panel que no estaban registrados. `
            + 'Se tomó como la nota de crédito de esa devolución: NO se descontó de nuevo de la ficha.\n'
            + `· Si era esa devolución: falta registrar $${falta.toLocaleString('es-CL')} más con 💸 Devolver → Devolución manual → «Panel de MercadoPago».\n`
            + `· Si fue OTRA plata (transferencia o efectivo): registra ahora lo devuelto desde el panel por su monto completo ($${cobroCrm.sinRegistrar.toLocaleString('es-CL')}) con 💸 Devolver → Devolución manual → «Panel de MercadoPago»; se descuenta solo la diferencia.\n`
            + `Por ${quien}.`,
        });
      }
      await mailCliente('Devolución aprobada — FRATE', `Tu devolución por <b>$${montoDev.toLocaleString('es-CL')}</b> fue aprobada y se gestionará de forma manual dentro de ${DIAS} días hábiles.${parcial ? ' (Se retuvo una parte por gastos de gestión.)' : ''} ${qrList.length ? 'Las entradas devueltas quedaron anuladas.' : 'Tus entradas quedaron anuladas.'}`);
      return new Response(JSON.stringify({ ok: true, modo: 'manual', monto: montoDev, parcial, tickets: qrList.length, estado: estadoFinal, cobro: cobroCrm }), { headers: cors });
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
      body: JSON.stringify(parcial ? { amount: montoDev } : {}), // vacío = total · con amount = parcial
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || 'MercadoPago rechazó la devolución', detalle: data }), { status: 502, headers: cors });
    }

    await admin.from('pedidos').update({ estado: estadoFinal, dev_estado: pedido.dev_estado === 'pendiente' ? 'aprobada' : pedido.dev_estado, dev_respuesta: `MP ${parcial ? 'parcial ' : ''}${sufTk}$${(data.amount || montoDev).toLocaleString('es-CL')}`, referencia_pago: ref + '-REFUND' }).eq('id', pedidoId);
    await _anotarDevuelto(data.amount || montoDev);
    await quemarQrs();
    await registrarNC('mercadopago', data.amount || montoDev, qrList);
    // Cobro: lo devuelto se lleva POR PAGO. Se registra ESTA devolución y se le
    // pregunta a MP cuánto lleva devuelto ese pago; así da lo mismo si el aviso
    // 'refunded' del webhook (o una parcial del panel que ya vio el cron) se anota
    // antes o después: el segundo aplica solo la diferencia (antes eran dos llaves
    // distintas y, con un segundo pago en el cobro, se descontaba dos veces). Si
    // MP no respondió, vale lo registrado, igual acotado a lo que entró por ese pago.
    let cobroCrm: Awaited<ReturnType<typeof _devolverCobroCrm>>;
    if (await _esCobroCrm()) {
      const montoRefund = Number(data.amount || montoDev);
      const claveRefund = data.id ? `mp-refund:${data.id}` : null;
      const mp = await _leerPagoMP(paymentId);
      cobroCrm = await _devolverCobroCrm(mp && mp.devuelto > 0 ? mp.devuelto : montoRefund, claveRefund, montoRefund,
        { paymentId, acumulado: !!(mp && mp.devuelto > 0), registro: montoRefund, refunds: mp?.refunds ?? null });
    }
    await mailCliente('Tu devolución está lista', `Aprobamos tu solicitud.
      ${cuentaHTML(Number(pedido.total_pagado || pedido.total || 0), Number(data.amount || montoDev))}
      <div style="background:rgba(24,217,255,.08);border:1px solid rgba(24,217,255,.35);border-radius:9px;padding:11px 13px;color:#18D9FF;font-size:12px;line-height:1.6;">
        MercadoPago abona a <b>el mismo medio con que pagaste</b>, dentro de ${DIAS} días hábiles.
        Según tu banco puede aparecer en el próximo estado de cuenta.</div> ${qrList.length ? 'Las entradas devueltas quedaron anuladas.' : 'Tus entradas quedaron anuladas.'}`);
    return new Response(JSON.stringify({ ok: true, modo: 'automatico', refund_id: data.id, monto: data.amount || montoDev, parcial, tickets: qrList.length, estado: estadoFinal, cobro: cobroCrm }), { headers: cors });

  } catch (err) {
    console.error('[devolver-pago]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
