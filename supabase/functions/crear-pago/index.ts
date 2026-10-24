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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { uidDelToken } from '../_shared/guard.ts';
import { tokenVaso, tokenOk } from '../_shared/vaso.ts';

const SITE_URL = 'https://frate.cl';
const FEE_PCT  = 0.04; // cargo por servicio 4%

// Segmento aleatorio impredecible para el token del QR (CSPRNG) → evita que
// alguien adivine/enumere los QR de otros pedidos. Mayúsculas por compatibilidad
// con el validador manual del admin (que hace toUpperCase).
const rndTok = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();

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

    // ⚠️ UNA sola constante para el plazo. Antes el comentario decía 30 minutos,
    //    la variable se llamaba `vencidos` y el código hacía 15: tres verdades
    //    distintas en cuatro líneas.
    //    30 min (decisión del dueño, 2026-07-31): con el reloj a la vista en el
    //    checkout la gente se apura igual, y le da aire a quien tiene que ir a
    //    buscar la tarjeta. Es EL MISMO número que ve el cliente y el que usa
    //    MercadoPago para vencer el link.
    const MIN_PARA_PAGAR = 30;
    const vencidos = new Date(Date.now() - MIN_PARA_PAGAR * 60 * 1000).toISOString();
    // 🎂 Los cobros de servicio (cumpleaños/reservas, origen 'crm') NO vencen a
    //    los 30 min: su link no tiene plazo y lo maneja crm-pago. Por eso los tres
    //    barridos de abajo llevan `.neq('origen', 'crm')` (la columna es NOT NULL
    //    con default 'web', así que el filtro no se come carritos viejos).
    // ⚠️ Sin fallback a propósito: si la columna `origen` no existe (se desplegó
    //    antes del SQL 01a), PostgREST devuelve error y los barridos no hacen nada.
    //    Antes eso pasaba en silencio y los cupos no volvían; ahora cada barrido
    //    deja su error en el log de la función para que se vea al tiro.
    // Restaurar crédito de pedidos que van a expirar (compras abandonadas)
    const { data: expirando, error: eExp } = await sb.from('pedidos')
      .select('id, cliente_id, credito_usado, total, total_pagado, fee_servicio')
      .eq('estado', 'pendiente').neq('origen', 'crm').lt('created_at', vencidos).gt('credito_usado', 0);
    if (eExp) console.error('[crear-pago] barrido crédito:', eExp.message);
    for (const o of (expirando || [])) {
      // 🔒 Candado: se marca el pedido ANTES de devolver la plata y solo si todavía
      //    tiene crédito por devolver. Si otro proceso ya lo hizo, la condición no
      //    matchea y no se devuelve dos veces. Antes esto no existía: el crédito se
      //    reintegraba una y otra vez sobre el MISMO pedido (crédito infinito).
      // ⚠️ Al soltar el crédito HAY QUE SUBIR EL PRECIO DE VUELTA.
      //    El total se guardó como (base − crédito) y el cargo por servicio se
      //    calculó sobre ese precio ya rebajado. Si solo se devolvía el crédito,
      //    el pedido quedaba barato para siempre: el cliente recuperaba su plata
      //    Y además retomaba la compra al precio con descuento. Regalo repetible.
      const _cred  = Number(o.credito_usado) || 0;
      const _base2 = Number(o.total) || 0;             // lo que quedó tras el crédito
      const _fee   = Number(o.fee_servicio) || 0;
      const _base  = _base2 + _cred;                   // el precio de verdad
      // El % de servicio se deduce de lo ya guardado; si no se puede, del config.
      let _pct = _base2 > 0 ? (_fee / _base2) : null;
      if (_pct == null || !isFinite(_pct)) {
        _pct = FEE_PCT;
        try {
          const { data: c } = await sb.from('config_valores').select('valor').eq('clave','comision_pct').maybeSingle();
          const nn = parseFloat(String(c?.valor ?? ''));
          if (!isNaN(nn) && nn >= 0 && nn <= 30) _pct = nn / 100;
        } catch (_) { /* queda el default */ }
      }
      const _feeNuevo = Math.round(_base * _pct);
      const { data: ganado } = await sb.from('pedidos')
        .update({
          estado: 'expirado', credito_usado: 0, stock_reservado: false,
          total: _base, fee_servicio: _feeNuevo, total_pagado: _base + _feeNuevo,
        })
        .eq('id', o.id).gt('credito_usado', 0).select('id');
      if (!ganado || !ganado.length) continue;   // otro proceso se adelantó
      if (o.cliente_id) {
        const { data: cli } = await sb.from('clientes').select('credito').eq('id', o.cliente_id).maybeSingle();
        await sb.from('clientes').update({ credito: (cli?.credito || 0) + o.credito_usado }).eq('id', o.cliente_id);
      }
    }
    // ⚠️ ACÁ SE PERDÍA EL STOCK. Se marcaba el pedido como expirado y el cupo
    //    nunca volvía: 331 carritos caídos en julio = 331 cupos destruidos.
    //    Ahora se devuelve ANTES de marcar, y solo si se gana la carrera —
    //    el `.eq('stock_reservado', true)` es el candado: si otro proceso ya
    //    lo expiró, no matchea y el cupo no se devuelve dos veces.
    try {
      const { data: aExpirar, error: eCupos } = await sb.from('pedidos')
        .select('id, items_pedido(tipo_ticket_id, cantidad)')
        .eq('estado', 'pendiente').neq('origen', 'crm').eq('stock_reservado', true).lt('created_at', vencidos).limit(100);
      if (eCupos) console.error('[crear-pago] barrido cupos:', eCupos.message);
      for (const o of (aExpirar || [])) {
        const { data: ganado } = await sb.from('pedidos')
          .update({ estado: 'expirado', stock_reservado: false })
          .eq('id', o.id).eq('stock_reservado', true).select('id');
        if (!ganado || !ganado.length) continue;        // otro se adelantó
        // ⚠️ ACÁ ESTABA EL DOBLE RETORNO. El UPDATE de arriba ya dispara
        //    fn_descontar_stock, y ese trigger DEVUELVE el cupo solo (su rama de
        //    devolución se activa con old.stock_reservado = true, que es justo el
        //    caso de este barrido). Llamar además a liberar_cupo lo devolvía DOS
        //    veces, así que cada carrito abandonado inventaba un cupo que no existía.
        //    Medido el 18-oct en los 3 eventos de Halloween: el jueves, sin carritos
        //    caídos, tenía desvío 0; el viernes con 16 abandonadas iba +12; el sábado
        //    con 42 iba +41. Dos tramos llegaron a vender MÁS de lo que existía
        //    (PREV 1 MUJER 32 de 30, PREV 2 MUJER 78 de 60).
        //    El candado de más abajo (`.eq('stock_reservado', true)`) protegía contra
        //    OTRO proceso, no contra el trigger de este mismo UPDATE.
      }
    } catch (e) { console.error('[crear-pago] liberar cupos:', e); }
    // Y los que no tenían cupo tomado, se marcan igual.
    const { error: eMarcar } = await sb.from('pedidos').update({ estado: 'expirado', stock_reservado: false })
      .eq('estado', 'pendiente').neq('origen', 'crm').lt('created_at', vencidos);
    if (eMarcar) console.error('[crear-pago] barrido expirar:', eMarcar.message);

    const { items, comprador, codigo, usarCredito, medio, vaso } = await req.json() as {
      items: any[];
      comprador: { nombre: string; email: string; tel?: string; rut?: string; clienteId?: string };
      codigo?: string | null;
      usarCredito?: boolean;
      medio?: string;   // 'mercadopago' (default) | 'khipu'
      // 🔗 Enlace firmado de quien YA compró su entrada: deja comprar un producto
      //    con tope sin llevar entradas en este carrito. Se verifica, no se cree.
      vaso?: { e?: string; t?: string } | null;
    };

    // 🔒 La identidad SIEMPRE sale del login, nunca del navegador. Antes se confiaba
    //    en `comprador.clienteId` del body: mandando el UUID de otra persona se le
    //    gastaba su crédito / membresía y las entradas salían al correo del atacante.
    const clienteId = await uidDelToken(req);

    if (!items?.length) throw new Error('Carrito vacío');
    if (!comprador?.email || !comprador?.nombre) throw new Error('Faltan datos del comprador');

    // ── 1) Re-precio desde la base de datos ──────────────────────
    // Carga precios reales de tickets, carta y tiendita.
    const ttIds   = [...new Set(items.filter(i => i.ttId).map(i => Number(i.ttId)))];
    const cartaId = [...new Set(items.filter(i => i.tipo === 'carta' && i.productoId).map(i => Number(i.productoId)))];
    const merchId = [...new Set(items.filter(i => i.tipo === 'merch' && i.productoId).map(i => Number(i.productoId)))];
    const addonId = [...new Set(items.filter(i => i.tipo === 'addon' && i.productoId).map(i => Number(i.productoId)))];

    const [ttRes, cartaRes, merchRes, addonRes] = await Promise.all([
      ttIds.length   ? sb.from('tipos_ticket').select('*').in('id', ttIds)   : { data: [] },
      cartaId.length ? sb.from('carta').select('id,nombre,precio').in('id', cartaId)                          : { data: [] },
      merchId.length ? sb.from('tiendita').select('id,nombre,precio,stock,disponible,eventos,max_por_entrada,en_tienda,en_checkout,por_link').in('id', merchId) : { data: [] },
      addonId.length ? sb.from('addons').select('id,nombre,precio,activo,stock,eventos').in('id', addonId)    : { data: [] },
    ]);
    const ttMap    = new Map((ttRes.data    || []).map((r: any) => [r.id, r]));
    const cartaMap = new Map((cartaRes.data || []).map((r: any) => [r.id, r]));
    const merchMap = new Map((merchRes.data || []).map((r: any) => [r.id, r]));
    const addonMap = new Map((addonRes.data || []).map((r: any) => [r.id, r]));

    // ── Eventos de los tickets: estado + lógica nocturna ─────────
    // Regla: 12:00–23:59 pertenece al día del evento; 00:00–11:59 a la
    // madrugada siguiente. Todo en hora de Chile (America/Santiago).
    const evIds = [...new Set(items.filter(i => i.ttId).map(i => Number((ttMap.get(Number(i.ttId)) as any)?.evento_id ?? i.eventoId)).filter(n => n > 0))];
    const evRes = evIds.length ? await sb.from('eventos').select('*').in('id', evIds) : { data: [] };
    const evMap = new Map((evRes.data || []).map((r: any) => [r.id, r]));
    const nowCL = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const dtEvento = (fecha: string, hora: string) => {
      const [y, m, d] = String(fecha).split('-').map(Number);
      const [hh, mm]  = String(hora || '23:00').split(':').map(Number);
      const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
      if ((hh || 0) < 12) dt.setDate(dt.getDate() + 1);  // madrugada = día siguiente
      return dt;
    };

    // ── 2) Validar stock + construir filas con precio autoritativo ──
    let total = 0;
    const errores: string[] = [];
    // 🥤 El evento del carro sale de las entradas. Un extra amarrado a ciertas
    //    noches se valida contra esto; sin entradas no hay evento y no pasa.
    const eventoDelCarro = Number((items.find((x: any) => x && x.tipo === 'ticket' && x.eventoId) || {}).eventoId || 0);
    const itemsValidados: any[] = [];
    // 🎁 Entradas de regalo para miembros (tipos_ticket.solo_miembros /
    //    uno_por_persona). Si las columnas no existen, llegan undefined y
    //    todo sigue igual que antes.
    let requiereCuenta = false;
    const unoPorPersona: { tt: any; ruts: string[] }[] = [];
    const normRut = (x: unknown) => String(x ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

    // ── 🎁 Pasada previa: entradas de MIEMBROS ───────────────────
    // Solo corre si el body trae tickets solo_miembros; una compra pagada normal
    // no entra acá ni hace consultas extra. Reglas:
    //  · la entrada va a nombre del dueño de la cuenta (no se regala);
    //  · genero F/M exige ese sexo en el perfil; U exige institución;
    //  · la cortesía no se mezcla con nada cobrado;
    //  · se suman las cantidades del mismo ticket dentro del body.
    const json409 = (o: Record<string, unknown>, status = 409) => new Response(JSON.stringify(o), { status, headers: cors });
    const rutFmt = (x: unknown) => { const c = normRut(x); if (c.length < 2) return String(x ?? '').trim(); return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`; };
    const dvOk = (x: unknown) => {
      const c = normRut(x); if (c.length < 7 || c.length > 9) return false;
      const dv = c.slice(-1), num = c.slice(0, -1); let s2 = 0, m = 2;
      for (let k = num.length - 1; k >= 0; k--) { s2 += parseInt(num[k], 10) * m; m = m < 7 ? m + 1 : 2; }
      const r = 11 - (s2 % 11); return (r === 11 ? '0' : r === 10 ? 'K' : String(r)) === dv;
    };
    // Clave del candado: RUT limpio, o 'X'+documento para extranjeros (igual en el SQL).
    const claveDoc = (c: any) => c?.extranjero ? 'X' + String(c.rut || '').toUpperCase().replace(/[^0-9A-Z]/g, '') : normRut(c?.rut);
    const rutVariantes = (x: unknown) => { const c = normRut(x); if (c.length < 7) return [] as string[]; const b = c.slice(0, -1), dv = c.slice(-1), d = b.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return [...new Set([c, `${b}-${dv}`, `${d}-${dv}`, c.toLowerCase(), `${b}-${dv.toLowerCase()}`, `${d}-${dv.toLowerCase()}`])]; };
    // Sexo que exige una entrada: F/M directo; una universitaria (U) con HOMBRE o
    // MUJER en el nombre exige también ese sexo («CORTESIA HOMBRE UNIVERSITARIO»).
    const sexoReq = (t: any) => {
      const g = String(t?.genero || '').trim().toUpperCase();
      if (g === 'F' || g === 'M') return g;
      if (g === 'U') { const n = String(t?.nombre || '').toUpperCase(); const h = /HOMBRE/.test(n), m = /MUJER/.test(n); return h && !m ? 'M' : (m && !h ? 'F' : ''); }
      return '';
    };
    const sumaPorTt = new Map<number, number>();
    for (const i of items) if (i?.ttId) { const k = Number(i.ttId); sumaPorTt.set(k, (sumaPorTt.get(k) || 0) + Math.max(1, Number(i.cantidad) || 1)); }
    const ttsMiembros: any[] = [...sumaPorTt.keys()].map(k => ttMap.get(k)).filter((t: any) => t?.solo_miembros);
    let cuenta: any = null;
    if (ttsMiembros.length) {
      const hayCortesia = ttsMiembros.some((t: any) => !(Number(t.precio) > 0));
      if (hayCortesia && items.some((i: any) => !i?.ttId || Number((ttMap.get(Number(i.ttId)) as any)?.precio) > 0 || !(ttMap.get(Number(i.ttId)) as any)?.solo_miembros)) {
        return json409({ error: 'Tu cortesía de miembro se reserva sola: no se puede mezclar con otras entradas ni productos.', code: 'NO_MEZCLAR' });
      }
      if (clienteId) {   // sin sesión lo ataja REQUIERE_CUENTA en el loop
        const { data: c, error: cErr } = await sb.from('clientes').select('*').eq('id', clienteId).maybeSingle();
        if (cErr) throw cErr;
        if (!c) return json409({ error: 'Completa tus datos (nombre, RUT y sexo) para reservar esta entrada.', code: 'REQUIERE_PERFIL', faltan: ['perfil'] });
        const pideSexo = ttsMiembros.some((t: any) => !!sexoReq(t));
        if (pideSexo && !('sexo' in c)) return json409({ error: 'Estamos actualizando las reservas de miembros. Intenta en unos minutos.', code: 'PERFIL_NO_DISPONIBLE' }, 503);
        cuenta = c;
        const ext = !!c.extranjero;
        const sexo = String(c.sexo || '').trim().toUpperCase();
        const uni = String(c.universidad || '').trim().toUpperCase();
        const faltan = new Set<string>(); const mal: any[] = [];
        const doc = claveDoc(c);
        if (ext ? doc.length < 6 : (doc.length < 7 || !dvOk(c.rut))) faltan.add('rut');
        for (const t of ttsMiembros) {
          if ((sumaPorTt.get(Number(t.id)) || 0) > 1) return json409({ error: `"${t.nombre}": es personal, va una sola a tu nombre.`, code: 'UNA_POR_PERSONA' });
          const g = String(t.genero || '').trim().toUpperCase();
          const sx = sexoReq(t);
          if (sx) { if (!sexo) faltan.add('sexo'); else if (sexo !== sx) mal.push(t); }
          if (g === 'U') { if (!uni || uni === 'NO SOY ESTUDIANTE') faltan.add('universidad'); }
          else if (g !== '' && g !== 'F' && g !== 'M') mal.push(t);    // valor desconocido en un ticket de miembros: falla cerrada
        }
        if (!`${c.nombres || ''} ${c.apellidos || ''}`.trim()) faltan.add('nombre');
        if (faltan.size) {
          const code = faltan.has('rut') ? 'REQUIERE_RUT' : faltan.has('sexo') ? 'REQUIERE_SEXO' : faltan.has('universidad') ? 'REQUIERE_INSTITUCION' : 'REQUIERE_PERFIL';
          const et: Record<string, string> = { rut: 'tu RUT', sexo: 'tu sexo', universidad: 'tu institución de estudios', nombre: 'tu nombre y apellido' };
          return json409({ error: 'Para reservar esta entrada completa ' + [...faltan].map(f => et[f]).join(', ') + '.', code, faltan: [...faltan] });
        }
        if (mal.length) {
          const g = sexoReq(mal[0]);
          return json409({ error: `"${mal[0].nombre}" es solo para ${g === 'F' ? 'mujeres' : g === 'M' ? 'hombres' : 'otro público'} según el sexo de tu cuenta. Si está mal registrado, escríbenos.`, code: 'SEXO_NO_CORRESPONDE' });
        }
        // Mismo RUT en otra cuenta con otro sexo (alguien que se abrió otra cuenta)
        if (pideSexo && !ext) {
          const vars = rutVariantes(c.rut);
          if (vars.length) {
            const { data: otros, error: oErr } = await sb.from('clientes').select('id, sexo').in('rut', vars).neq('id', clienteId).in('sexo', ['F', 'M']);
            if (oErr) throw oErr;
            if ((otros || []).some((o: any) => String(o.sexo).trim().toUpperCase() !== sexo)) {
              return json409({ error: 'Tu RUT aparece en otra cuenta con un sexo distinto. Escríbenos para revisarlo.', code: 'SEXO_RUT_INCONSISTENTE' });
            }
          }
        }
        // La reserva de miembro va a nombre y correo de la cuenta, no a los del navegador.
        comprador.nombre = `${c.nombres || ''} ${c.apellidos || ''}`.trim() || comprador.nombre;
        comprador.email = String(c.email || '').trim() || comprador.email;
        comprador.rut = ext ? String(c.rut || '').trim().toUpperCase() : rutFmt(c.rut);
      }
    }

    for (const i of items) {
      const cantidad = Math.max(1, Number(i.cantidad) || 1);
      let precio = 0, nombre = i.nombre || 'Producto';
      let persOverride: any[] | null = null;
      let evTt: number | null = null;

      if (i.ttId) {
        const tt: any = ttMap.get(Number(i.ttId));
        if (!tt) { errores.push(`"${i.nombre}" ya no está disponible.`); continue; }
        const sumaTt = sumaPorTt.get(Number(i.ttId)) || cantidad;
        // La identidad sale del login (clienteId), nunca del navegador.
        if (tt.solo_miembros && !clienteId) { requiereCuenta = true; continue; }
        if (tt.uno_por_persona && sumaTt > 1) { errores.push(`"${tt.nombre}": es una por persona.`); continue; }
        if (tt.estado === 'Agotado' || tt.estado === 'Cerrado') { errores.push(`"${tt.nombre}": ${tt.estado.toLowerCase()}.`); continue; }
        if (tt.disponible < sumaTt) { errores.push(`"${tt.nombre}": solo quedan ${tt.disponible}.`); continue; }
        // Tope de máximo por compra (server-side, no solo en el front)
        const maxc = Number(tt.max_por_compra) || 0;
        if (maxc > 0 && sumaTt > maxc) { errores.push(`"${tt.nombre}": máximo ${maxc} por compra.`); continue; }
        // Estado del evento + vencimientos (lógica nocturna)
        evTt = Number(tt.evento_id ?? i.eventoId) || null;
        const evRow: any = evTt ? evMap.get(evTt) : null;
        if (evRow) {
          const estadoEv = evRow.estado || (evRow.activo ? 'publicado' : 'creado');
          // Solo se vende si está publicado o en vivo. Cerrado / planificación / postedición / archivado → NO.
          if (evRow.archivado || (estadoEv !== 'publicado' && estadoEv !== 'en_vivo')) {
            errores.push(`"${evRow.nombre}" no está a la venta.`); continue;
          }
          if (evRow.fecha && nowCL > dtEvento(evRow.fecha, evRow.hora_termino || '05:00')) { errores.push(`"${evRow.nombre}" ya terminó.`); continue; }
          if (evRow.fecha && tt.vence_hora && nowCL > dtEvento(evRow.fecha, tt.vence_hora)) { errores.push(`"${tt.nombre}": venta cerrada (venció a las ${tt.vence_hora}).`); continue; }
        }
        // ⏳ VENTANA DE VENTA (tramos de preventa): venta_desde / venta_hasta son instantes
        //    ABSOLUTOS (timestamptz con offset). Van FUERA del if (evRow) a propósito: la
        //    ventana no está anclada a la fecha del evento, así que no necesita el evento.
        //    ⚠️ Acá NO se usa `nowCL`: ese es un marco falso (una fecha local armada desde un
        //    string en zona Chile) que sirve para comparar HH:MM contra eventos.fecha y da 3 h
        //    de error contra un instante absoluto. Se compara instante contra instante.
        //    Si las columnas todavía no existen, llegan undefined y no se chequea nada: la
        //    entrada se vende siempre, igual que hoy.
        {
          const ahora = new Date();
          const _desde = tt.venta_desde ? new Date(tt.venta_desde) : null;
          const _hasta = tt.venta_hasta ? new Date(tt.venta_hasta) : null;
          if (_desde && !isNaN(+_desde) && ahora < _desde) { errores.push(`"${tt.nombre}": aún no está a la venta.`); continue; }
          if (_hasta && !isNaN(+_hasta) && ahora >= _hasta) { errores.push(`"${tt.nombre}": esta preventa ya cerró.`); continue; }
        }
        // Tickets NOMINATIVOS: cada entrada debe traer nombre y RUT del asistente
        const pers = (tt.solo_miembros && cuenta)
          ? (persOverride = [{ nombre: `${cuenta.nombres || ''} ${cuenta.apellidos || ''}`.trim(),
                               rut: cuenta.extranjero ? String(cuenta.rut || '').trim().toUpperCase() : rutFmt(cuenta.rut) }])
          : (Array.isArray(i.personas) ? i.personas : []);
        if (pers.length < cantidad || pers.slice(0, cantidad).some((p: any) => !String(p?.nombre || '').trim() || !String(p?.rut || '').trim())) {
          errores.push(`"${tt.nombre}": todas las entradas son nominativas — falta nombre y RUT de cada asistente.`); continue;
        }
        if (tt.uno_por_persona) unoPorPersona.push({ tt, ruts: pers.slice(0, cantidad).map((p: any) => normRut(p?.rut)) });
        precio = tt.precio; nombre = tt.nombre;
      } else if (i.tipo === 'carta') {
        const c: any = cartaMap.get(Number(i.productoId));
        if (!c) { errores.push(`"${i.nombre}" ya no está en la carta.`); continue; }
        precio = c.precio; nombre = c.nombre;
      } else if (i.tipo === 'merch') {
        const m: any = merchMap.get(Number(i.productoId));
        if (!m) { errores.push(`"${i.nombre}" ya no está en la tiendita.`); continue; }
        if (m.disponible === false) { errores.push(`"${m.nombre}" ya no está disponible.`); continue; }
        if ((m.stock ?? 0) < cantidad) { errores.push(`"${m.nombre}": sin stock suficiente.`); continue; }
        // 🥤 Un producto de tienda puede estar amarrado a ciertas noches
        //    (`eventos`). Vacío o null = se vende siempre, como los de ropa.
        const evCarroM = Number(i.eventoId || eventoDelCarro || 0);
        if (Array.isArray(m.eventos) && m.eventos.length && !m.eventos.includes(evCarroM)) {
          errores.push(`"${m.nombre}" no se vende para este evento.`); continue;
        }
        precio = m.precio; nombre = m.nombre;
      } else if (i.tipo === 'addon') {
        const a: any = addonMap.get(Number(i.productoId));
        if (!a || a.activo === false) { errores.push(`"${i.nombre}" ya no está disponible.`); continue; }
        // 🥤 El extra puede estar amarrado a ciertas noches. `eventos` vacío = todas.
        const evCarro = Number(i.eventoId || eventoDelCarro || 0);
        if (Array.isArray(a.eventos) && a.eventos.length && !a.eventos.includes(evCarro)) {
          errores.push(`"${a.nombre}" no se vende para este evento.`); continue;
        }
        // Y puede tener cupo. `stock` null = sin límite, como siempre.
        if (a.stock !== null && a.stock !== undefined && Number(a.stock) < cantidad) {
          errores.push(Number(a.stock) <= 0 ? `"${a.nombre}": agotado.` : `"${a.nombre}": solo quedan ${a.stock}.`);
          continue;
        }
        precio = a.precio; nombre = a.nombre;
      } else {
        errores.push(`"${i.nombre}": tipo de producto desconocido.`); continue;
      }

      total += precio * cantidad;
      // Snapshot de condiciones del ticket → la puerta lo lee al escanear (items_pedido.condiciones)
      const _ttFull: any = i.ttId ? ttMap.get(Number(i.ttId)) : null;
      const _cond = _ttFull ? {
        titulo: nombre,
        texto: _ttFull.instrucciones || '',
        instrucciones: _ttFull.instrucciones || '',
        hora_max_llegada: _ttFull.hora_max_ingreso || '',
        genero: _ttFull.genero || '',
        // 🥤 El cover queda congelado en el snapshot, como el género: así sobrevive a que
        //    después le cambien el nombre o el texto al ticket. cover_cc 0 = no se declara
        //    la medida. Si las columnas no existen, queda false / 0 y nada cambia.
        incluye_cover: !!_ttFull.incluye_cover,
        cover_cc: Number(_ttFull.cover_cc) || 0,
      } : null;
      itemsValidados.push({ ...i, cantidad, _precio: precio, _nombre: nombre, _cond,
        ...(i.ttId ? { eventoId: evTt ?? i.eventoId, _ttNombre: nombre } : {}),
        ...(persOverride ? { personas: persOverride } : {}) });
    }

    // Sin sesión y el ticket es solo para miembros: se corta acá, antes de
    // tocar el stock. `code` le dice al checkout que muestre «crea tu cuenta».
    if (requiereCuenta) {
      return new Response(JSON.stringify({
        error: 'Esta entrada es solo para miembros. Entra o crea tu cuenta para reservarla.',
        code: 'REQUIERE_CUENTA',
      }), { status: 401, headers: cors });
    }

    // Una por persona: se mira quién YA tiene ese ticket (pagado o en carro).
    // Por RUT, porque las cuentas no confirman el correo y se pueden inventar;
    // y por cuenta, para que cada persona tenga que hacerse miembro.
    // Paginado: el tope de 1.000 filas ya nos mintió antes.
    // Si la consulta falla se corta: es mejor no regalar que regalar dos.
    for (const u of unoPorPersona) {
      const tomados = new Set<string>();
      let yaEnCuenta = false;
      let from = 0; const PAGE = 1000;
      while (true) {
        const { data: ex, error: exErr } = await sb.from('items_pedido')
          .select('rut_asistente, personas, pedidos!inner(estado, cliente_id)')
          .eq('tipo_ticket_id', u.tt.id)
          .in('pedidos.estado', ['pagado', 'pendiente'])
          .order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (exErr) throw exErr;
        for (const r of (ex || []) as any[]) {
          if (clienteId && r.pedidos?.cliente_id === clienteId) yaEnCuenta = true;
          const ps = Array.isArray(r.personas) ? r.personas : [];
          [r.rut_asistente, ...ps.map((p: any) => p?.rut)].forEach((x: unknown) => {
            const n = normRut(x); if (n.length >= 7) tomados.add(n);
          });
        }
        if (!ex || ex.length < PAGE) break;
        from += PAGE;
      }
      if (yaEnCuenta) errores.push(`"${u.tt.nombre}": tu cuenta ya reservó esta entrada. Es una por persona.`);
      else if (u.ruts.some(r => tomados.has(r))) errores.push(`"${u.tt.nombre}": ese RUT ya tiene esta entrada. Es una por persona.`);
    }

    // 🥤 TOPE POR ENTRADA. El front ya lo limita, pero el front se puede saltar:
    //    acá se decide de verdad.
    //
    //    El tope lo dice el PRODUCTO (`tiendita.max_por_entrada`), no el tipo de
    //    ítem. Así el mismo vaso puede ser «uno por entrada» y una polera puede
    //    venderse suelta, sin una regla escrita a fuego para cada uno.
    //    `max_por_entrada` null = sin tope. 1 = uno por cada entrada del carrito.
    //
    //    Los `addon` viejos conservan su regla de siempre (uno por entrada), para
    //    no cambiarle el comportamiento a nada que siga apuntando ahí.
    {
      const nEntradas = itemsValidados
        .filter((iv: any) => iv.tipo === 'ticket')
        .reduce((n: number, iv: any) => n + (Number(iv.cantidad) || 0), 0);

      const nAddons = itemsValidados
        .filter((iv: any) => iv.tipo === 'addon')
        .reduce((n: number, iv: any) => n + (Number(iv.cantidad) || 0), 0);
      if (nAddons > nEntradas) {
        errores.push(nEntradas === 0
          ? 'Los extras van junto a una entrada: agrega al menos una.'
          : `Solo puedes llevar un extra por entrada (llevas ${nEntradas} entrada(s) y ${nAddons} extra(s)).`);
      }

      // 🔗 PUERTA DEL LINK. Quien YA compró su entrada llega con un carrito que
      //    no trae entradas, y con la cuenta de arriba el tope le daría 0. Para
      //    esa puerta se cuentan las entradas que la persona YA PAGÓ.
      //
      //    La identidad NO la dice el cliente: viene firmada (HMAC del correo con
      //    la llave de servicio, ver _shared/vaso.ts). Sin firma válida, cero.
      //    Y se descuentan los que ya se llevó, para que el link no sirva dos veces.
      let yaPagadas = 0;
      const yaLlevados = new Map<number, number>();
      try {
        const v = vaso;
        if (v && v.e && v.t) {
          const mail = String(v.e).trim().toLowerCase();
          if (tokenOk(String(v.t), await tokenVaso(mail))) {
            const { data: prev } = await sb.from('pedidos')
              .select('id, items_pedido(evento_id, cantidad, producto_tipo, producto_id, qr_ids)')
              .eq('estado', 'pagado').ilike('email_cliente', mail).limit(200);
            const nochesDelCarro = new Set(
              itemsValidados.filter((x: any) => x.tipo === 'merch')
                .flatMap((x: any) => {
                  const m: any = merchMap.get(Number(x.productoId));
                  return Array.isArray(m?.eventos) && m.eventos.length ? m.eventos : [];
                }));
            for (const ped of (prev || [])) {
              for (const it of ((ped as any).items_pedido || [])) {
                const tp = String(it.producto_tipo || 'ticket');
                if (tp === 'ticket') {
                  if (nochesDelCarro.size && !nochesDelCarro.has(it.evento_id)) continue;
                  yaPagadas += Array.isArray(it.qr_ids) ? it.qr_ids.length : (Number(it.cantidad) || 0);
                } else if (tp === 'merch') {
                  const pid = Number(it.producto_id);
                  if (Number.isFinite(pid)) yaLlevados.set(pid, (yaLlevados.get(pid) || 0) + (Number(it.cantidad) || 0));
                }
              }
            }
          }
        }
      } catch (e) { console.error('[crear-pago] tope por link:', e); }

      // Productos de tienda CON tope: se cuenta producto por producto, porque
      // cada uno puede traer el suyo.
      const entradasParaTope = nEntradas + yaPagadas;
      for (const iv of itemsValidados) {
        if (iv.tipo !== 'merch') continue;
        const m: any = merchMap.get(Number(iv.productoId));
        const tope = m && m.max_por_entrada;
        if (tope === null || tope === undefined) continue;   // producto sin tope
        const llevan = itemsValidados
          .filter((x: any) => x.tipo === 'merch' && Number(x.productoId) === Number(iv.productoId))
          .reduce((n: number, x: any) => n + (Number(x.cantidad) || 0), 0);
        const antes = yaLlevados.get(Number(iv.productoId)) || 0;
        const permitido = Math.max(0, entradasParaTope * Math.max(0, Number(tope)) - antes);
        if (llevan > permitido) {
          errores.push(entradasParaTope === 0
            ? `"${m.nombre}" va junto a una entrada: agrega al menos una.`
            : `"${m.nombre}": te alcanza para ${permitido} (tienes ${entradasParaTope} entrada(s)${antes ? ` y ya llevaste ${antes}` : ''}).`);
        }
      }
    }

    if (errores.length) {
      return new Response(JSON.stringify({ error: [...new Set(errores)].join(' · ') }), { status: 409, headers: cors });
    }

    // Beneficio de MEMBRESÍA activa (aplica sobre el valor de las entradas)
    let membDesc = 0;
    if (clienteId) {
      const { data: cli } = await sb.from('clientes').select('membresia_id, membresia_hasta').eq('id', clienteId).maybeSingle();
      if (cli?.membresia_id && cli?.membresia_hasta && new Date(cli.membresia_hasta) > new Date()) {
        const { data: mem } = await sb.from('membresias').select('beneficio_tipo, beneficio_valor').eq('id', cli.membresia_id).maybeSingle();
        if (mem) {
          const ticketSubtotal = itemsValidados.filter(i => i.ttId).reduce((s, i) => s + i._precio * i.cantidad, 0);
          if (mem.beneficio_tipo === 'entrada_gratis') membDesc = ticketSubtotal;
          else if (mem.beneficio_tipo === 'descuento')  membDesc = Math.round(ticketSubtotal * (mem.beneficio_valor || 0) / 100);
        }
      }
    }

    // Descuento por GRUPO (si el grupo del cliente llegó a la meta)
    if (clienteId) {
      const eventoId = itemsValidados.find(i => i.ttId)?.eventoId;
      if (eventoId) {
        try {
          const { data: pct } = await sb.rpc('grupo_descuento_pct', { p_cliente: clienteId, p_evento: Number(eventoId) });
          if (pct && pct > 0) {
            const ticketSubtotal = itemsValidados.filter(i => i.ttId).reduce((s, i) => s + i._precio * i.cantidad, 0);
            membDesc += Math.round(ticketSubtotal * Number(pct) / 100);
          }
        } catch (e) { /* sin grupo */ }
      }
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

    descuento = Math.min(total, descuento + membDesc);  // código + beneficio de membresía
    const base = total - descuento;

    // Crédito del usuario ($1.000 por votar, etc.) — SOLO si el usuario lo pidió
    // explícitamente en el checkout (opt-in). Nunca se aplica automáticamente.
    let creditoUsado = 0;
    if (usarCredito && clienteId) {
      const { data: cli } = await sb.from('clientes').select('credito').eq('id', clienteId).maybeSingle();
      const credito = cli?.credito || 0;
      creditoUsado = Math.min(credito, base);
      if (creditoUsado > 0) await sb.from('clientes').update({ credito: credito - creditoUsado }).eq('id', clienteId);
    }

    // Comisión configurable desde el admin (config_valores.comision_pct = "4" → 4%). Fallback al default.
    let feePct = FEE_PCT;
    try {
      const { data: cfgCom } = await sb.from('config_valores').select('valor').eq('clave','comision_pct').maybeSingle();
      if (cfgCom && cfgCom.valor != null && cfgCom.valor !== '') {
        const n = parseFloat(String(cfgCom.valor));
        if (!isNaN(n) && n >= 0 && n <= 30) feePct = n / 100;
      }
    } catch (_) { /* usa el default */ }

    const base2       = base - creditoUsado;
    const fee         = Math.round(base2 * feePct);
    const totalPagado = base2 + fee;

    // ── 2b) RESERVAR EL CUPO ANTES DE COBRAR ─────────────────────
    // Antes el cupo se descontaba recién al confirmar el pago: varias personas
    // pasaban la validación con el mismo último lugar y todas pagaban, pero solo
    // una recibía entrada (el resto quedaba en 'requiere_reembolso').
    // Ahora se toma el cupo acá: si no alcanza, la persona se entera ANTES de pagar.
    const reservados: { tt: number; n: number }[] = [];
    // 🥤 Los extras con cupo se reservan igual que las entradas, con su propio par
    //    de funciones. Van en una lista aparte porque se sueltan con liberar_extra.
    const reservadosX: { ad: number; n: number }[] = [];
    const soltarReservas = async () => {
      for (const r of reservados)  { try { await sb.rpc('liberar_cupo',  { p_tt: r.tt, p_cant: r.n }); } catch (_) { /* best effort */ } }
      for (const r of reservadosX) { try { await sb.rpc('liberar_extra', { p_addon: r.ad, p_cant: r.n }); } catch (_) { /* best effort */ } }
    };
    {
      const porTt: Record<string, number> = {};
      for (const iv of itemsValidados) {
        if (iv.ttId) porTt[iv.ttId] = (porTt[iv.ttId] || 0) + (iv.cantidad || 0);
      }
      for (const ttId of Object.keys(porTt)) {
        const cant = porTt[ttId];
        const { data: ok, error: eRes } = await sb.rpc('reservar_cupo', { p_tt: Number(ttId), p_cant: cant });
        if (eRes) {
          // La función no existe (falta correr el SQL) o la base falló. Se sueltan
          // las reservas parciales y se sigue con el flujo antiguo: así nunca queda
          // un pedido marcado como "reservado" con solo una parte del cupo tomada
          // (eso haría que el trigger no descontara el resto → sobreventa).
          await soltarReservas();
          reservados.length = 0;
          break;
        }
        if (ok === false) {
          await soltarReservas();
          const tt: any = ttMap.get(Number(ttId));
          return new Response(JSON.stringify({ error: `SIN_STOCK: "${tt?.nombre || 'Ese ticket'}" se acaba de agotar. No se te cobró nada.` }), { status: 409, headers: cors });
        }
        if (ok === true) reservados.push({ tt: Number(ttId), n: cant });
      }
    }

    // ── 3) Crear pedido pendiente ────────────────────────────────
    // 🥤 Reserva del cupo de los extras. Si la función todavía no existe (SQL sin
    //    correr) o el extra no tiene cupo, pasa derecho y el trigger lo descuenta
    //    al pagar. Si se acabó justo ahora, se corta acá con un mensaje claro.
    // Si la reserva de ENTRADAS no ocurrió (falta el SQL, o se soltó), el pedido
    // queda sin `stock_reservado` y el trigger descuenta todo al pagar. En ese caso
    // el extra NO se reserva: si no, se descontaría dos veces (acá y en el trigger).
    if (reservados.length) {
      const porAddon: Record<string, number> = {};
      for (const iv of itemsValidados) {
        if (iv.tipo === 'addon' && iv.productoId) {
          porAddon[iv.productoId] = (porAddon[iv.productoId] || 0) + (iv.cantidad || 0);
        }
      }
      for (const adId of Object.keys(porAddon)) {
        const cant = porAddon[adId];
        const { data: ok, error: eRes } = await sb.rpc('reservar_extra', { p_addon: Number(adId), p_cant: cant });
        if (eRes) { reservadosX.length = 0; break; }   // sin la función: el trigger se encarga
        if (ok === false) {
          await soltarReservas();
          const nom = (addonMap.get(Number(adId)) || {}).nombre || 'Ese extra';
          return new Response(JSON.stringify({ error: `${nom}: se acabó mientras comprabas.` }), { status: 409, headers: cors });
        }
        reservadosX.push({ ad: Number(adId), n: cant });
      }
    }

    // ⚠️ `cliente_id` apunta a public.clientes, NO a auth.users. Hay cuentas que
    // existen en auth pero cuya fila de clientes nunca se escribió: el registro la
    // crea en un SEGUNDO paso (index.html:3839) y si ese paso falla, queda huérfana.
    // Sin esta red el insert muere con `pedidos_cliente_id_fkey` y esa persona no
    // puede comprar NADA. Se crea igual que en el registro, con los mismos campos.
    let clienteRef = clienteId;
    if (clienteRef) {
      const { data: hayCli } = await sb.from('clientes').select('id').eq('id', clienteRef).maybeSingle();
      if (!hayCli) {
        const trozos = String(comprador.nombre || '').trim().split(/\s+/).filter(Boolean);
        const filaCli: any = {
          id:        clienteRef,
          email:     comprador.email || '',
          nombres:   trozos.slice(0, -1).join(' ') || trozos[0] || '',
          apellidos: trozos.length > 1 ? trozos[trozos.length - 1] : '',
        };
        let { error: eCli } = await sb.from('clientes').insert(filaCli);
        // Si alguna columna no existe en esta base, se reintenta con lo mínimo.
        if (eCli) ({ error: eCli } = await sb.from('clientes').insert({ id: clienteRef, email: comprador.email || '' }));
        // Antes que perder la venta: se vende sin amarrar a la cuenta.
        if (eCli) { console.warn('[crear-pago] no pude crear clientes:', eCli.message); clienteRef = null; }
        else console.warn('[crear-pago] fila de clientes creada al vuelo para', clienteRef);
      }
    }

    // `stock_reservado` solo se manda si de verdad se reservó (o sea, si el SQL
    // frate-reserva-cupo.sql ya está corrido). Si aún no lo está, el campo NO va
    // en el insert y el checkout sigue funcionando igual que antes.
    const filaPedido: any = {
      cliente_id:     clienteRef || null,
      nombre_cliente: comprador.nombre,
      email_cliente:  comprador.email,
      estado:         'pendiente',
      total:          base2,
      descuento:      descuento,
      credito_usado:  creditoUsado,
      codigo_id:      codigoRow?.id || null,
      codigo_texto:   codigoRow?.codigo || null,
      fee_servicio:   fee,
      total_pagado:   totalPagado,
      metodo_pago:    'mercadopago',
    };
    // RUT del comprador: es el hilo que amarra la compra a una persona real.
    // El correo se escribe mal o cambia; el RUT no. Va condicional para que una
    // base sin la columna todavía siga vendiendo igual.
    const rutLimpio = String(comprador.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (rutLimpio.length >= 7) filaPedido.rut_cliente = comprador.rut;
    if (reservados.length) filaPedido.stock_reservado = true;

    let { data: pedido, error: e1 } = await sb.from('pedidos').insert(filaPedido).select().single();
    // Si la base todavía no tiene `rut_cliente`, el insert falla por columna
    // desconocida. Antes que romper una venta, se reintenta sin ese campo.
    if (e1 && /rut_cliente|column|schema cache/i.test(String(e1.message || ''))) {
      delete filaPedido.rut_cliente;
      ({ data: pedido, error: e1 } = await sb.from('pedidos').insert(filaPedido).select().single());
    }
    if (e1) { await soltarReservas(); throw e1; }

    // 🔒 Candado de entradas de miembros: la base decide quién llegó primero
    //    (índice único por ticket+cuenta y ticket+documento). La lectura de
    //    arriba queda como aviso amable y para los pedidos anteriores al candado.
    if (cuenta && clienteId) {
      const doc = claveDoc(cuenta);
      const candados = itemsValidados
        .filter((x: any) => x.ttId && (ttMap.get(Number(x.ttId)) as any)?.solo_miembros)
        .map((x: any) => ({ tipo_ticket_id: Number(x.ttId), cliente_id: clienteId, rut_norm: doc, pedido_id: pedido.id, evento_id: x.eventoId ?? null }));
      if (candados.length) {
        const { error: eLock } = await sb.from('reservas_miembros').insert(candados);
        if (eLock) {
          const sinTabla = eLock.code === 'PGRST205' || eLock.code === '42P01';
          if (!sinTabla) {
            await sb.from('pedidos').delete().eq('id', pedido.id);   // aún sin items: no hay QR emitido
            await soltarReservas();
            // Si se había descontado crédito para este pedido, vuelve a la cuenta.
            if (creditoUsado > 0 && clienteId) {
              const { data: cc } = await sb.from('clientes').select('credito').eq('id', clienteId).maybeSingle();
              await sb.from('clientes').update({ credito: (cc?.credito || 0) + creditoUsado }).eq('id', clienteId);
            }
            if (eLock.code === '23505') return json409({ error: 'Ya reservaste esta entrada (o tu RUT ya la tiene). Es una por persona.', code: 'YA_RESERVADA' });
            throw eLock;
          }
          console.warn('[crear-pago] falta reservas_miembros: sigo sin candado');
        }
      }
    }

    // items_pedido con QR ids — el índice de línea (lineIdx) garantiza
    // que NUNCA se repita un código aunque dos líneas compartan el mismo
    // tipo de ticket. El índice u (dentro de la línea) mapea a personas[u].
    // Una sola consulta: qué zona tiene cada tipo de ticket del carrito.
    const zonaDeTt: Record<number, number | null> = {};
    try {
      const tts = [...new Set(itemsValidados.filter((x: any) => x.ttId).map((x: any) => Number(x.ttId)))];
      if (tts.length) {
        const { data: zz } = await sb.from('tipos_ticket').select('id,zona_id').in('id', tts);
        (zz || []).forEach((t: any) => { zonaDeTt[t.id] = t.zona_id ?? null; });
      }
    } catch (_) { /* sin la columna todavía → todas sin zona, como antes */ }

    const rows = itemsValidados.map((i, lineIdx) => {
      const isTicket = !!i.ttId;
      const isCarta  = i.tipo === 'carta';
      const isMerch  = i.tipo === 'merch';
      const isAddon  = i.tipo === 'addon';
      const personas = Array.isArray(i.personas) ? i.personas : [];
      const qrIds: string[] = [];
      const key = i.ttId || i.productoId || i.tipo;
      for (let u = 0; u < i.cantidad; u++) qrIds.push(`FCC-${pedido.id}-${key}-${lineIdx}-${u}-${rndTok()}`);
      return {
        pedido_id:        pedido.id,
        producto_tipo:    isTicket ? 'ticket' : (isCarta ? 'carta' : (isMerch ? 'merch' : (isAddon ? 'addon' : 'otro'))),
        producto_id:      isTicket ? null : (i.productoId || null),
        evento_id:        isTicket ? (i.eventoId ?? null) : null,
        tipo_ticket_id:   isTicket ? Number(i.ttId) : null,
        nombre_evento:    isTicket ? i._nombre : null,
        nombre_ticket:    isTicket ? (i._ttNombre || i.tipo) : i._nombre,
        detalle:          i.detalle || null,
        cantidad:         i.cantidad,
        precio_unitario:  i._precio,
        personas,
        qr_ids:           qrIds,
        condiciones:      i._cond || null,
        nombre_asistente: personas[0]?.nombre || '',
        rut_asistente:    personas[0]?.rut    || '',
        // ⚠️ La zona del TIPO DE TICKET viaja con la entrada. Sin esto,
        //    `items_pedido.zona_id` quedaba NULL siempre —100% de las 467
        //    entradas de CELOSA— y el ERP no podía cruzar el VIP contra las
        //    pulseras: lo único que quedaba era el NOMBRE del ticket, que
        //    detectaba 28 de 158.
        zona_id:          isTicket ? (zonaDeTt[Number(i.ttId)] ?? null) : null,
      };
    });
    let { error: e2 } = await sb.from('items_pedido').insert(rows);
    // Si la columna no existe todavía, se guarda sin ella: mejor perder la
    // zona que dejar a alguien sin su entrada después de haber pagado.
    if (e2 && /zona_id|column|schema cache/i.test(String(e2.message || ''))) {
      (rows as Record<string, unknown>[]).forEach(r => { delete r.zona_id; });
      ({ error: e2 } = await sb.from('items_pedido').insert(rows));
    }
    if (e2) { await sb.from('pedidos').delete().eq('id', pedido.id); throw e2; }

    // ── PEDIDO GRATIS ($0 por membresía entrada_gratis) ──────────
    // MercadoPago no puede cobrar $0. Marcamos pagado directo, lo que
    // dispara el trigger de stock, y enviamos el comprobante con QRs.
    if (totalPagado <= 0) {
      await sb.from('pedidos').update({
        estado: 'pagado', referencia_pago: membDesc > 0 ? 'GRATIS-MEMBRESIA' : 'GRATIS', fecha_pago: new Date().toISOString(),
      }).eq('id', pedido.id).eq('estado', 'pendiente');
      // Enviar comprobante con QRs (reusa send-receipt)
      try {
        const { data: full } = await sb.from('pedidos').select('*, items_pedido(*)').eq('id', pedido.id).single();
        const order = {
          id: 'FCC-' + String(pedido.id).padStart(6, '0'),
          pedidoId: pedido.id,
          items: (full?.items_pedido || []).map((ip: any) => ({
            tipo: ip.producto_tipo === 'ticket' ? (ip.nombre_ticket || 'TICKET') : ip.producto_tipo,
            nombre: ip.nombre_evento || ip.nombre_ticket || 'Producto',
            precio: ip.precio_unitario, cantidad: ip.cantidad,
            ttId: ip.tipo_ticket_id || undefined, productoId: ip.producto_id || undefined,
            personas: Array.isArray(ip.personas) ? ip.personas : [], qr_ids: Array.isArray(ip.qr_ids) ? ip.qr_ids : [],
          })),
          comprador: { nombre: comprador.nombre, email: comprador.email },
          total: 0, fecha: new Date().toISOString(),
        };
        const rr = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ order }),
        });
        // Que quede en el log si el QR no salió, para poder reenviarlo desde el admin.
        if (!rr.ok) console.error('[crear-pago] receipt gratis NO enviado · pedido', pedido.id, rr.status, (await rr.text().catch(() => '')).slice(0, 300));
      } catch (e) { console.error('[crear-pago] receipt gratis:', e); }
      return new Response(JSON.stringify({ ok: true, pedidoId: pedido.id, freeOrder: true }), { headers: cors });
    }

    // ── 4a) KHIPU (transferencia bancaria) ───────────────────────
    if (medio === 'khipu') {
      const KHIPU_KEY = Deno.env.get('KHIPU_API_KEY');
      if (!KHIPU_KEY) {
        await sb.from('items_pedido').delete().eq('pedido_id', pedido.id);
        await sb.from('pedidos').delete().eq('id', pedido.id);
        throw new Error('Khipu no está configurado todavía (falta KHIPU_API_KEY).');
      }
      const khRes = await fetch('https://payment-api.khipu.com/v3/payments', {
        method: 'POST',
        headers: { 'x-api-key': KHIPU_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:      totalPagado,
          currency:    'CLP',
          subject:     `Entradas Frate — Orden #${pedido.id}`,
          transaction_id: String(pedido.id),          // nuestra referencia (= pedido)
          return_url:  `${SITE_URL}/pago-exitoso.html`,
          cancel_url:  `${SITE_URL}/pago-error.html`,
          notify_url:  `${Deno.env.get('SUPABASE_URL')}/functions/v1/khipu-webhook`,
          notify_api_version: '3.0',
        }),
      });
      const khData = await khRes.json();
      if (!khRes.ok || !khData?.payment_url) {
        await sb.from('items_pedido').delete().eq('pedido_id', pedido.id);
        await sb.from('pedidos').delete().eq('id', pedido.id);
        throw new Error(khData?.message || khData?.detail || 'Error creando el pago en Khipu');
      }
      await sb.from('pedidos').update({
        metodo_pago: 'khipu', referencia_pago: `KHIPU-${khData.payment_id}`,
      }).eq('id', pedido.id);
      return new Response(JSON.stringify({
        ok: true, pedidoId: pedido.id, initPoint: khData.payment_url, total: totalPagado,
        expiraEn: new Date(Date.now() + MIN_PARA_PAGAR * 60 * 1000).toISOString(),
        minutosParaPagar: MIN_PARA_PAGAR,
      }), { headers: cors });
    }

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
      // 🔒 EL LINK VENCE CUANDO VENCE EL CUPO. Antes la preferencia se creaba sin
      //    vencimiento: nuestro cupo moría a los 15 min y el link seguía vivo para
      //    siempre. Alguien podía pagar al día siguiente un cupo ya liberado —
      //    ese es el caso «pagó y no había entradas» que termina en devolución.
      //    Con esto MercadoPago lo rechaza ANTES de cobrarle.
      //    Se dan 2 minutos de gracia para que no falle justo al apretar pagar.
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + (MIN_PARA_PAGAR + 2) * 60 * 1000).toISOString(),
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
      // El checkout necesita saber hasta cuándo para poder mostrar el reloj.
      // Va la hora exacta, no los minutos: así el reloj no se desfasa si el
      // navegador se duerme o la pestaña queda en segundo plano.
      expiraEn: new Date(Date.now() + MIN_PARA_PAGAR * 60 * 1000).toISOString(),
      minutosParaPagar: MIN_PARA_PAGAR,
      total:     totalPagado,
    }), { headers: cors });

  } catch (err) {
    console.error('[crear-pago]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
