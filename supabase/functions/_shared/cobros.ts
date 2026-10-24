// ============================================================
// FRATE — Cobros de servicio (cumpleaños / reservas) compartido.
// Contrato: SPEC «Cobros de servicio» del 16-sep-2026.
//
// UNA sola forma de decidir qué pasa con la plata de un cobro del CRM.
// Antes cada función tenía su versión (mp-webhook sumaba, sincronizar no,
// la devolución no tocaba la ficha) y cada vista decía «pagado» distinto.
//
// Lo usan: crm-pago, mp-webhook, mp-pagos, devolver-pago, api-crm.
// NO cambies una firma sin revisar a esos cinco.
//
// ── EXPORTS (firmas) ─────────────────────────────────────────
//   type Servicio    = 'cumpleanos' | 'reserva' | 'otro'
//   type Prefijo     = 'CUM' | 'RES' | 'SRV'
//   type TablaFicha  = 'formularios' | 'reservas' | 'listas'
//   type ViaPago     = 'webhook' | 'sincronizar' | 'manual' | 'erp'
//   type MedioManual = 'efectivo' | 'transferencia' | 'tarjeta'
//   type FichaInfo, ResultadoFicha, ResultadoReconciliar,
//        ResultadoDevolver, ResultadoManual        (definidos abajo)
//   const MEDIOS_MANUALES: MedioManual[]
//   const CANALES_ENVIO: string[]        ('whatsapp'|'correo'|'whatsapp_frate')
//
//   prefijoDe(servicio: string): Prefijo
//   folioDe(prefijo: string, n: number | string, manual?: boolean): string
//       → 'CUM-004567'  ·  manual=true → 'CUM-M000123'
//   folioDeCobro(cobro: any): string      (folio guardado o 'FCC-' + lpad)
//   prefIdDe(ref: string | null | undefined): string | null
//       → saca el id de 'PREF-xxx' (o lo devuelve tal cual); 'MP-…' → null
//   linkDePref(prefId: string | null | undefined): string | null
//       → 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=xxx'
//   vencerPreferencia(token: string, prefId: string, creadoIso?: string | null)
//       : Promise<{ ok: boolean; error?: string }>
//   buscarPreferenciaDePedido(token: string, pedidoId: number)
//       : Promise<string | null>
//   resolverFicha(sb: any, tipo: string, refId: number | null)
//       : Promise<FichaInfo | null>   (null = no existe; lanza si falla la base)
//   actualizarFichaFormulario(sb: any, id: number,
//       mezclar: (gestion: Record<string, any>, historial: any[]) =>
//                { gestion?: Record<string, any>; historial?: any[] } | null)
//       : Promise<{ ok: boolean; fila?: any; error?: string }>
//   aplicarPagoAFicha(sb: any, cobro: any, montoDelta: number,
//       lineaHistorial: string, por?: string | null, mpId?: string | null): Promise<ResultadoFicha>
//       `mpId` = payment id del pago que se suma: queda en la línea del historial
//       y, si ya está ahí, NO se vuelve a sumar (reintentos de una ficha pendiente).
//   reconciliarCobro(sb: any, opts: { pedidoId: number; pago: any; via: ViaPago | string;
//       pedidoYaPagado?: boolean }): Promise<ResultadoReconciliar>
//       `pago` = el objeto de GET /v1/payments/{id} de MP. IDEMPOTENTE por pago.id.
//       NO marca `pedidos` pagado (es del que llama). Si MP informa una devolución
//       parcial de ese pago (transaction_amount_refunded), la descuenta con
//       devolverCobro (que sí anota dev_monto en el pedido). `pedidoYaPagado` =
//       la orden ya estaba 'pagado' ANTES de esta llamada (no cuenta si el cobro
//       tiene [pago-en-curso:<id>] de ese pago: la pagó otro aviso casi al mismo
//       tiempo). LANZA si falla la base, si el pago no trae id o si su
//       external_reference es de otro pedido: el que llama hace try/catch + avisarStaff.
//   anotarPagoEnCurso(sb: any, cobro: any, paymentId: string | number): Promise<boolean>
//       Antes de marcar pagada la orden de un cobro VIEJO (sin creado_por): deja
//       [pago-en-curso:<id>] con candado. No lanza. En cobros nuevos no escribe nada.
//   devolverCobro(sb: any, opts: { pedidoId: number; monto: number;
//       clave?: string | null; motivo?: string | null; paymentId?: string | number | null;
//       acumulado?: boolean; enPedido?: boolean; registro?: number | null;
//       refundsMP?: any[] | null; pagoPresunto?: boolean; aparte?: boolean }): Promise<ResultadoDevolver>
//       No lanza. Lo devuelto se lleva POR PAGO (marca [dev:<paymentId>:<monto>] en
//       cotejo_detalle). `acumulado` = `monto` es el total devuelto de ese pago según
//       MP (transaction_amount_refunded): se aplica solo lo que falta. `registro` =
//       esta llamada es la devolución que registró devolver-pago (automática o
//       manual) por ese monto: queda [dev-reg:<paymentId>:<monto>] aunque no
//       descuente nada, y se descuenta hasta que lo descontado de ese pago llegue a
//       max(lo que MP informa, lo registrado). `refundsMP` = el detalle `refunds` del
//       pago en MP (con fecha): separa lo devuelto antes del corte del SQL 01b.
//       `pagoPresunto` = el pago se sacó de la orden (devolución manual): si el
//       cobro tiene más de un pago, se lleva solo con el tope por cobro. `aparte` = la
//       plata salió por transferencia o efectivo (devolver-pago con `medio`): sin pago,
//       queda [dev-aparte] y no cuenta como devuelto «sin pago asociado». `clave` =
//       llave extra de esa devolución ('mp-refund:<refundId>'). `enPedido` = la
//       devolución NO pasó por devolver-pago: suma dev_monto y, si se devolvió todo,
//       deja la orden 'reembolsado', y avisa al staff que falta la nota de crédito.
//       Tope: nunca descuenta más de lo cobrado. Con `registro`, el resultado trae
//       `sinRegistrar` (lo que MP informaba devuelto de ese pago sin registrar, antes
//       de esta llamada) y `absorbido` (la parte de lo registrado que era eso).
//   devueltoSinRegistrar(cobro: any): { total: number; porPago: Record<string, number>; sinPago: number; exacto: number; completo: number }
//       Lo que MP devolvió por fuera de devolver-pago (panel o contracargo) que ya se
//       descontó de la ficha pero todavía no tiene su registro: por pago, [dev] − [dev-reg].
//       `sinPago` = devuelto con «Devolución manual» sin pago asociado (cobro con más de
//       un pago, V18a): puede ser el registro de eso mismo. `exacto` = total − sinPago: lo
//       que devolver-pago exige registrar (la nota de crédito) antes de cualquier otra
//       devolución de ese cobro. `completo` = exacto + lo registrado antes con una
//       «Devolución manual» dudosa ([dev-dudosa], V4/V16): el otro monto que se acepta
//       (lo que salió del panel completo, si lo de antes era otra plata). No lee la base.
//   registrarPagoManual(sb: any, opts: { tipo: string; refId: number; monto: number;
//       medio: string; nota?: string | null; via?: 'manual' | 'erp';
//       creadoPor?: string | null; creadoPorNombre?: string | null })
//       : Promise<ResultadoManual>
//       No lanza. tipo 'formulario' | 'reserva'. via 'erp' no le reenvía el
//       aviso de 'pago' al ERP (eco). NO es idempotente.
//   anularPagoManual(sb: any, opts: { cobroId: number; motivo?: string | null; por?: string | null })
//       : Promise<ResultadoManual>
//       No lanza. Solo un pago manual (sin pedido) 'pagado': lo deja 'anulado',
//       lo descuenta de la ficha y avisa al ERP 'devuelto' (salvo via 'erp').
//
// Secrets que lee: RESEND_API_KEY (correo al cliente; si falta, se salta).
// ============================================================

import { avisarStaff } from './avisar.ts';
import { despacharWebhook, formularioAPayloadERP } from './crm.ts';

export type Servicio = 'cumpleanos' | 'reserva' | 'otro';
export type Prefijo = 'CUM' | 'RES' | 'SRV';
export type TablaFicha = 'formularios' | 'reservas' | 'listas';
export type ViaPago = 'webhook' | 'sincronizar' | 'manual' | 'erp';
export type MedioManual = 'efectivo' | 'transferencia' | 'tarjeta';

export const MEDIOS_MANUALES: MedioManual[] = ['efectivo', 'transferencia', 'tarjeta'];
export const CANALES_ENVIO = ['whatsapp', 'correo', 'whatsapp_frate'];

/** Lo que se sabe de la ficha a la que apunta un cobro. */
export type FichaInfo = {
  tipo: string;                 // tipo de crm_pagos: formulario | reserva | lista | generico
  refId: number | null;
  tabla: TablaFicha | null;
  servicio: Servicio;
  prefijo: Prefijo;
  nombre: string | null;
  email: string | null;
  fila: any | null;             // la fila leída (null en lista/generico)
};

/** Resultado de aplicar plata a la ficha. `montoPagadoTotal` es lo que la
 *  ficha dice pagado DESPUÉS de aplicar (null si la tabla no lleva plata). */
export type ResultadoFicha = {
  ok: boolean;
  tabla: TablaFicha | null;
  montoPagadoTotal: number | null;
  montoTotal: number | null;
  pago: string | null;          // 'pagado' | 'abonado' | 'sin_pago' (solo formularios)
  sumaCobros?: number | null;   // reservas: suma de crm_pagos, SOLO como dato de control (no se escribe)
  error?: string;
};

export type ResultadoReconciliar = {
  esCobro: boolean;             // false = el pedido no es un cobro del CRM (sigue el flujo de entradas)
  yaEstaba?: boolean;           // ese pago ya estaba registrado (a lo más se reintentó la ficha pendiente)
  adoptado?: boolean;           // cobro viejo ya sumado a la ficha: solo se anotó el payment id
  sinSumar?: boolean;           // cobro viejo pendiente con la orden ya pagada: se anotó SIN sumar + aviso
  noAprobado?: boolean;         // el pago no viene 'approved': no se tocó nada
  dobles?: boolean;             // segundo pago aprobado sobre el mismo link
  fichaReintentada?: boolean;   // la ficha había quedado pendiente y se volvió a intentar (ver `ficha`)
  cotejo?: string | null;
  cobro?: any;
  ficha?: ResultadoFicha;
  devolucion?: ResultadoDevolver; // devolución parcial que MP ya informaba en ese pago
};

export type ResultadoDevolver = {
  esCobro: boolean;
  yaEstaba?: boolean;           // esa devolución ya estaba registrada (o no queda nada por devolver)
  montoAplicado?: number;
  sinRegistrar?: number;        // con `registro`: lo que MP informaba devuelto de ese pago sin registrar (antes de esta llamada)
  absorbido?: number;           // con `registro`: la parte de lo registrado que era esa devolución (no se descontó otra vez)
  cobro?: any;
  ficha?: ResultadoFicha;
  error?: string;
};

export type ResultadoManual = {
  ok: boolean;
  code?: 'DATOS' | 'NO_EXISTE_FICHA' | 'NO_EXISTE_COBRO' | 'NO_ANULABLE' | 'ERROR';
  error?: string;
  folio?: string;
  cobro?: any;
  ficha?: ResultadoFicha;
  aviso?: string;               // el pago quedó registrado, pero algo después falló (ver texto)
};

// ── utilidades chicas ────────────────────────────────────────
const _pad = (n: number | string) => String(n).padStart(6, '0');
const _int = (v: unknown): number => parseInt(String(v ?? '').replace(/\D/g, ''), 10) || 0;
const _clp = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const _msg = (e: unknown) => String((e as any)?.message || e);
const _esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const _sumaExtras = (c: any): number =>
  (Array.isArray(c?.pagos_extra) ? c.pagos_extra : []).reduce((a: number, x: any) => a + (Math.round(Number(x?.monto)) || 0), 0);
const _agregarDetalle = (previo: unknown, linea: string) =>
  (String(previo || '').trim() ? String(previo).trim() + '\n' : '') + linea;
// Candado optimista sobre una columna que puede venir null (.eq no calza con null).
const _conCandado = (q: any, col: string, valor: unknown) => (valor == null ? q.is(col, null) : q.eq(col, valor));

// Lo que se cobró de verdad en ese cobro (primer pago + extras). Filas viejas
// marcadas pagadas antes de existir monto_pagado cuentan por su monto.
const _cobradoDe = (c: any): number =>
  (c?.monto_pagado != null ? Number(c.monto_pagado) || 0
    : (c?.estado === 'pagado' || c?.estado === 'devuelto') ? Number(c?.monto) || 0 : 0) + _sumaExtras(c);

// ── Marcas en cotejo_detalle (sin SQL nuevo) ──
// [dev:<paymentId>:<monto>]       lo devuelto de ESE pago que YA se descontó de la ficha (se suman todas las del pago)
// [dev-reg:<paymentId>:<monto>]   devolución de ESE pago registrada en devolver-pago (lleva nota de crédito)
// [dev-previa:<paymentId>:<monto>] devuelto de ESE pago antes de los cobros nuevos: contado SIN tocar la ficha
// [dev-aparte:<monto>]            devuelto por transferencia o efectivo (con `medio`): descontado del cobro, sin pago
// [dev-dudosa:<paymentId>:<monto>] registro de ESE pago que no calzaba con lo que MP informaba sin registrar
//                                  (V4/V16): pudo ser esa devolución u otra plata (transferencia sin medio)
// [dev-previa-hasta:<paymentId>:<fecha ISO>] la pone el SQL 01b: lo que MP devolvió de ese pago hasta
//                                  esa fecha es del código viejo (se resuelve a [dev-previa] la primera vez)
// [ficha-pendiente:<paymentId>]   el pago quedó en el cobro pero la ficha no se actualizó
// [aviso-orden:<paymentId>]       ya se avisó que entró un pago a una orden que no espera pago
// [pago-en-curso:<paymentId>]     este pago está marcando pagada la orden de un cobro viejo (#36)
const _marcaDev = (pid: string, monto: number) => `[dev:${pid}:${Math.round(monto)}]`;
const _marcaDevReg = (pid: string, monto: number) => `[dev-reg:${pid}:${Math.round(monto)}]`;
const _marcaDevPrevia = (pid: string, monto: number) => `[dev-previa:${pid}:${Math.round(monto)}]`;
export const marcaFichaPendiente = (pid: string | number) => `[ficha-pendiente:${pid}]`;
export const marcaAvisoOrden = (pid: string | number) => `[aviso-orden:${pid}]`;
export const marcaPagoEnCurso = (pid: string | number) => `[pago-en-curso:${pid}]`;
/** Suma las marcas [<tipo>:<pid>:<monto>] de ese pago ('dev' no calza con 'dev-reg' ni 'dev-previa'). */
function _sumaMarcas(detalle: unknown, tipo: 'dev' | 'dev-reg' | 'dev-previa' | 'dev-dudosa', pid: string): number {
  let s = 0;
  const re = new RegExp(`\\[${tipo}:([^:\\]\\s]+):(\\d+)\\]`, 'g');
  for (const m of String(detalle || '').matchAll(re)) if (m[1] === pid) s += Number(m[2]) || 0;
  return s;
}
const _devueltoDePago = (detalle: unknown, pid: string) => _sumaMarcas(detalle, 'dev', pid);
/** Las marcas [<tipo>:<pid>:<monto>] de TODOS los pagos, sumadas por pago. */
function _marcasPorPago(detalle: unknown, tipo: 'dev' | 'dev-reg' | 'dev-previa'): Record<string, number> {
  const out: Record<string, number> = {};
  const re = new RegExp(`\\[${tipo}:([^:\\]\\s]+):(\\d+)\\]`, 'g');
  for (const m of String(detalle || '').matchAll(re)) out[m[1]] = (out[m[1]] || 0) + (Number(m[2]) || 0);
  return out;
}
const _sumaDe = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + n, 0);
const _marcaDevAparte = (monto: number) => `[dev-aparte:${Math.round(monto)}]`;
const _marcaDevDudosa = (pid: string, monto: number) => `[dev-dudosa:${pid}:${Math.round(monto)}]`;
/** Lo registrado de ESE pago con «Devolución manual» dudosa ([dev-dudosa]) que ningún registro
 *  posterior de ese pago aclaró: cualquier otro [dev-reg] de ese pago (la nota de crédito del
 *  panel, por uno de sus dos montos, o una automática) lo deja en cero. */
function _dudosoSinAclarar(detalle: unknown, pid: string): number {
  let pend = 0;
  for (const l of String(detalle || '').split('\n')) {
    const dudosa = _sumaMarcas(l, 'dev-dudosa', pid);
    if (dudosa > 0) pend += dudosa;
    else if (_sumaMarcas(l, 'dev-reg', pid) > 0) pend = 0;
  }
  return pend;
}
const _sumaAparte = (detalle: unknown): number =>
  [...String(detalle || '').matchAll(/\[dev-aparte:(\d+)\]/g)].reduce((a, m) => a + (Number(m[1]) || 0), 0);

/** Devuelto de un cobro con más de un pago que no quedó atado a ninguno: «Devolución
 *  manual» SIN medio y sin devolución de MP a la vista (V18a). Lo que se registró con
 *  medio transferencia/efectivo ([dev-aparte]) no cuenta: es otra plata, se sabe. */
function _devueltoSinPago(cobro: any): number {
  if (!(Array.isArray(cobro?.pagos_extra) && cobro.pagos_extra.length)) return 0;
  return Math.max(0, (Number(cobro?.devuelto_monto) || 0)
    - _sumaDe(_marcasPorPago(cobro?.cotejo_detalle, 'dev')) - _sumaAparte(cobro?.cotejo_detalle));
}

/** Lo que MercadoPago devolvió POR FUERA de devolver-pago (panel o contracargo) y ya
 *  se descontó de la ficha y de dev_monto, pero todavía no tiene su registro (ni su
 *  nota de crédito): por pago, lo descontado [dev] menos lo registrado [dev-reg].
 *  Una «Devolución manual» por ese monto es su registro y no descuenta de nuevo.
 *  `exacto` es lo que devolver-pago exige registrar antes de otra devolución del cobro:
 *  el total menos lo devuelto sin pago asociado (V18a: si era la misma plata, ya tiene
 *  su nota de crédito y no se puede pedir otra). `completo` suma a `exacto` lo registrado
 *  antes con una «Devolución manual» dudosa de esos pagos (V4/V16): si eso era otra plata,
 *  la nota de crédito del panel va por ese monto (se descuenta solo la diferencia). */
export function devueltoSinRegistrar(cobro: any): { total: number; porPago: Record<string, number>; sinPago: number; exacto: number; completo: number } {
  const dev = _marcasPorPago(cobro?.cotejo_detalle, 'dev');
  const reg = _marcasPorPago(cobro?.cotejo_detalle, 'dev-reg');
  const porPago: Record<string, number> = {};
  let total = 0;
  for (const [pid, d] of Object.entries(dev)) {
    const falta = Math.max(0, d - (reg[pid] || 0));
    if (falta > 0) { porPago[pid] = falta; total += falta; }
  }
  const sinPago = total > 0 ? _devueltoSinPago(cobro) : 0;
  const exacto = Math.max(0, total - sinPago);
  const completo = exacto > 0
    ? exacto + Object.keys(porPago).reduce((a, pid) => a + _dudosoSinAclarar(cobro?.cotejo_detalle, pid), 0) : 0;
  return { total, porPago, sinPago, exacto, completo };
}
/** El corte que dejó el SQL 01b para ese pago (null si no hay o ya se resolvió). */
function _previaHasta(detalle: unknown, pid: string): { token: string; ms: number } | null {
  for (const m of String(detalle || '').matchAll(/\[dev-previa-hasta:(\d+):([^\]\s]+)\]/g)) {
    const ms = Date.parse(m[2]);
    if (m[1] === pid && !isNaN(ms)) return { token: m[0], ms };
  }
  return null;
}
const _quitarLinea = (detalle: unknown, linea: string): string | null =>
  String(detalle || '').split('\n').filter((l) => l.trim() !== linea).join('\n').trim() || null;

/** Cuánto entró por ESE pago en el cobro; null = ese pago no está registrado ahí. */
function _montoDePago(cobro: any, pid: string): number | null {
  const base = cobro?.monto_pagado != null ? Number(cobro.monto_pagado) || 0 : Number(cobro?.monto) || 0;
  if (String(cobro?.mp_payment_id || '') === pid) return base;
  const ex = (Array.isArray(cobro?.pagos_extra) ? cobro.pagos_extra : []).find((x: any) => String(x?.payment_id) === pid);
  if (ex) return Math.round(Number(ex.monto)) || 0;
  // Cobro viejo pagado sin payment id: su único pago es el de la orden.
  if (!cobro?.mp_payment_id && (cobro?.estado === 'pagado' || cobro?.estado === 'devuelto')) return base;
  return null;
}

export function prefijoDe(servicio: string): Prefijo {
  return servicio === 'cumpleanos' ? 'CUM' : servicio === 'reserva' ? 'RES' : 'SRV';
}

export function folioDe(prefijo: string, n: number | string, manual = false): string {
  return `${prefijo}-${manual ? 'M' : ''}${_pad(n)}`;
}

/** El folio para mostrar: el guardado, o el de la orden como lo mostraba el admin. */
export function folioDeCobro(cobro: any): string {
  if (cobro?.folio) return String(cobro.folio);
  if (cobro?.pedido_id) return 'FCC-' + _pad(cobro.pedido_id);
  return folioDe(prefijoDe(servicioDeCobro(cobro)), cobro?.id ?? 0, true);
}

function servicioDeCobro(cobro: any): Servicio {
  const s = String(cobro?.servicio || '');
  if (s === 'cumpleanos' || s === 'reserva' || s === 'otro') return s;
  // Filas viejas sin backfill: se adivina por el tipo (la reserva manda).
  return cobro?.tipo === 'reserva' ? 'reserva' : 'otro';
}

function tablaDeCobro(cobro: any): TablaFicha | null {
  const t = String(cobro?.tabla || '');
  if (t === 'formularios' || t === 'reservas' || t === 'listas') return t;
  return cobro?.tipo === 'formulario' ? 'formularios' : cobro?.tipo === 'reserva' ? 'reservas'
       : cobro?.tipo === 'lista' ? 'listas' : null;
}

export function prefIdDe(ref: string | null | undefined): string | null {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (s.startsWith('MP-')) return null;             // eso es un pago, no una preferencia
  return s.startsWith('PREF-') ? (s.slice(5) || null) : s;
}

export function linkDePref(prefId: string | null | undefined): string | null {
  const id = prefIdDe(prefId);
  return id ? `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${encodeURIComponent(id)}` : null;
}

// ============================================================
// MERCADO PAGO: dar de baja un link
// Un link sin vencimiento se puede pagar para siempre. Antes, «generar otro»
// dejaba los dos vivos y el cliente podía pagar los dos.
// ============================================================
export async function vencerPreferencia(token: string, prefId: string, creadoIso?: string | null): Promise<{ ok: boolean; error?: string }> {
  const id = prefIdDe(prefId);
  if (!token) return { ok: false, error: 'sin_token' };
  if (!id) return { ok: false, error: 'sin_preferencia' };
  const url = `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(id)}`;
  try {
    let desde = String(creadoIso || '');
    if (!desde) {
      const g = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      const gd = await g.json().catch(() => ({}));
      if (!g.ok) return { ok: false, error: gd?.message || `HTTP ${g.status}` };
      desde = String(gd?.date_created || '');
    }
    const ahora = new Date();
    let d = new Date(desde);
    // El «desde» tiene que ser anterior al «hasta», o MP rechaza el cambio.
    if (isNaN(d.getTime()) || d.getTime() >= ahora.getTime()) d = new Date(ahora.getTime() - 60000);
    const r = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires: true, expiration_date_from: d.toISOString(), expiration_date_to: ahora.toISOString() }),
      signal: AbortSignal.timeout(10000),
    });
    const rd = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: rd?.message || `HTTP ${r.status}` };
    // Si MP contesta 200 pero la deja sin vencer, NO se da por vencida.
    if (rd && rd.expires === false) return { ok: false, error: 'MercadoPago no dejó el link vencido' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}

/** Respaldo para cobros viejos: si el pedido perdió el 'PREF-…' (un pago
 *  rechazado lo pisa con 'MP-…-rejected'), se busca la preferencia en MP
 *  por external_reference. Devuelve null si no la encuentra. */
export async function buscarPreferenciaDePedido(token: string, pedidoId: number): Promise<string | null> {
  if (!token || !pedidoId) return null;
  try {
    const r = await fetch(`https://api.mercadopago.com/checkout/preferences/search?external_reference=${encodeURIComponent(String(pedidoId))}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json().catch(() => ({}));
    const el = (Array.isArray(d?.elements) ? d.elements : [])
      .find((x: any) => x?.id && String(x?.external_reference ?? '') === String(pedidoId));
    return el?.id ? String(el.id) : null;
  } catch (_) { return null; }
}

// ============================================================
// LA FICHA
// ============================================================

/** Valida que la ficha exista y deriva servicio/tabla/prefijo.
 *  null = no existe (formulario/reserva). Lanza si la base falla, para que
 *  una caída no se confunda con «no existe». */
export async function resolverFicha(sb: any, tipo: string, refId: number | null): Promise<FichaInfo | null> {
  if (tipo === 'formulario') {
    if (!refId) return null;
    const { data, error } = await sb.from('formularios')
      .select('id,tipo,nombre,email,datos,gestion,historial').eq('id', refId).maybeSingle();
    if (error) throw new Error('formularios: ' + error.message);
    if (!data) return null;
    const servicio: Servicio = data.tipo === 'cumple' ? 'cumpleanos' : data.tipo === 'reserva' ? 'reserva' : 'otro';
    const d = data.datos || {};
    return {
      tipo, refId, tabla: 'formularios', servicio, prefijo: prefijoDe(servicio),
      nombre: data.nombre || d.nombre || null,
      email: String(data.email || d.email || d.correo || '').trim() || null,
      fila: data,
    };
  }
  if (tipo === 'reserva') {
    if (!refId) return null;
    const { data, error } = await sb.from('reservas').select('id,tipo,nombre,email').eq('id', refId).maybeSingle();
    if (error) throw new Error('reservas: ' + error.message);
    if (!data) return null;
    const servicio: Servicio = data.tipo === 'cumpleanos' ? 'cumpleanos' : 'reserva';
    return {
      tipo, refId, tabla: 'reservas', servicio, prefijo: prefijoDe(servicio),
      nombre: data.nombre || null, email: String(data.email || '').trim() || null, fila: data,
    };
  }
  // lista / generico: no hay ficha con plata que validar.
  return {
    tipo, refId, tabla: tipo === 'lista' && refId ? 'listas' : null, servicio: 'otro', prefijo: 'SRV',
    nombre: null, email: null, fila: null,
  };
}

/** Escribe gestion/historial de un formulario SIN pisar lo que otro escribió.
 *  Lee la fila FRESCA, mezcla, y actualiza solo si `updated_at` no cambió
 *  entre medio (si cambió, vuelve a leer y mezclar). `mezclar` recibe copias
 *  frescas y devuelve lo que se escribe (o null para no escribir nada). */
export async function actualizarFichaFormulario(
  sb: any, id: number,
  mezclar: (gestion: Record<string, any>, historial: any[]) => { gestion?: Record<string, any>; historial?: any[] } | null,
): Promise<{ ok: boolean; fila?: any; error?: string }> {
  for (let intento = 0; intento < 4; intento++) {
    const { data: fila, error: eL } = await sb.from('formularios').select('id,gestion,historial,updated_at').eq('id', id).maybeSingle();
    if (eL) return { ok: false, error: 'leer formulario: ' + eL.message };
    if (!fila) return { ok: false, error: 'no_existe' };
    const cambios = mezclar({ ...(fila.gestion || {}) }, Array.isArray(fila.historial) ? fila.historial.slice() : []);
    if (!cambios) return { ok: true, fila };
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (cambios.gestion) upd.gestion = cambios.gestion;
    if (cambios.historial) upd.historial = cambios.historial;
    let q = sb.from('formularios').update(upd).eq('id', id);
    // Candado optimista. En el último intento se escribe igual (con la fila
    // recién leída): es mejor eso que perder un pago por un formato de fecha.
    if (intento < 3 && fila.updated_at) q = q.eq('updated_at', fila.updated_at);
    const { data: filas, error: eU } = await q.select('*');
    if (eU) return { ok: false, error: 'actualizar formulario: ' + eU.message };
    if (filas && filas.length) return { ok: true, fila: filas[0] };
  }
  return { ok: false, error: 'la ficha cambió muchas veces seguidas' };
}

/** Suma (o resta, si montoDelta < 0) plata a la ficha del cobro.
 *  · formularios: g.monto = max(0, previo + delta), recalcula g.pago, agrega
 *    la línea al historial FRESCO y reenvía la ficha al ERP. Con `mpId`, si
 *    ese pago ya tiene su línea en el historial, no se suma de nuevo.
 *  · reservas: pagado_monto = previo FRESCO + delta, con candado. El ERP
 *    también escribe pagado_monto en absoluto (marcar_pagado): reemplazarlo
 *    por la suma de los cobros borraba lo que puso el ERP. La suma de crm_pagos
 *    queda solo como dato de control (`sumaCobros`). Ojo: se aparta de la SPEC
 *    a propósito (decisión del coordinador, hallazgos #9/#35).
 *  · listas / genérico: no hay plata en la ficha → ok sin tocar nada.
 *  Nunca lanza: devuelve ok:false con el error. */
export async function aplicarPagoAFicha(sb: any, cobro: any, montoDelta: number, lineaHistorial: string, por?: string | null, mpId?: string | null): Promise<ResultadoFicha> {
  const tabla = tablaDeCobro(cobro);
  const refId = Number(cobro?.ref_id) || 0;
  const delta = Math.round(Number(montoDelta) || 0);
  const pid = String(mpId ?? '').trim();
  const vacio: ResultadoFicha = { ok: true, tabla, montoPagadoTotal: null, montoTotal: null, pago: null };
  if (!refId || (tabla !== 'formularios' && tabla !== 'reservas')) return vacio;

  try {
    if (tabla === 'formularios') {
      let pagadoTotal = 0, total = 0, estadoPago = 'sin_pago', yaSumado = false;
      const r = await actualizarFichaFormulario(sb, refId, (g, hist) => {
        total = _int(g.monto_total);
        // Reintento de una ficha pendiente cuya escritura anterior SÍ alcanzó a
        // entrar (respondió error, pero quedó): la línea del pago ya está.
        if (pid && hist.some((h: any) => String(h?.mp ?? '') === pid)) {
          yaSumado = true;
          pagadoTotal = _int(g.monto);
          estadoPago = String(g.pago || '') || (pagadoTotal > 0 ? 'pagado' : 'sin_pago');
          return null;
        }
        pagadoTotal = Math.max(0, _int(g.monto) + delta);
        // Sin total acordado y con plata adentro queda «pagado» (antes quedaba
        // «abonado» para siempre aunque el link fuera por el total).
        estadoPago = total > 0
          ? (pagadoTotal >= total ? 'pagado' : pagadoTotal > 0 ? 'abonado' : 'sin_pago')
          : (pagadoTotal > 0 ? 'pagado' : 'sin_pago');
        g.monto = pagadoTotal;
        g.pago = estadoPago;
        const linea: Record<string, unknown> = { ts: new Date().toISOString(), ev: lineaHistorial };
        if (por) linea.por = por;
        if (pid) linea.mp = pid;
        hist.push(linea);
        return { gestion: g, historial: hist };
      });
      if (!r.ok) return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: r.error };
      // Y se reenvía la ficha al ERP con el monto nuevo (como siempre). Si ya
      // estaba sumado, la fila leída viene incompleta: se lee entera.
      try {
        let filaERP = r.fila;
        if (yaSumado) {
          const { data: completa } = await sb.from('formularios').select('*').eq('id', refId).maybeSingle();
          filaERP = completa || null;
        }
        const pERP = filaERP ? formularioAPayloadERP(filaERP) : null;
        if (pERP) await despacharWebhook(sb, pERP);
      } catch (e) { console.error('[cobros] reenvío ficha ERP:', e); }
      return { ok: true, tabla, montoPagadoTotal: pagadoTotal, montoTotal: total > 0 ? total : null, pago: estadoPago };
    }

    // ── reservas: delta sobre el pagado_monto FRESCO, con candado ──
    let nuevo = 0, escrito = false;
    for (let intento = 0; intento < 3 && !escrito; intento++) {
      const { data: res, error: eR } = await sb.from('reservas').select('id,pagado_monto').eq('id', refId).maybeSingle();
      if (eR) return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: 'leer reserva: ' + eR.message };
      if (!res) return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: 'no_existe' };
      nuevo = Math.max(0, (Number(res.pagado_monto) || 0) + delta);
      const q = _conCandado(sb.from('reservas').update({
        pagado_monto: nuevo, pagado_medio: String(cobro?.medio || 'mercadopago').slice(0, 40), updated_at: new Date().toISOString(),
      }).eq('id', refId), 'pagado_monto', res.pagado_monto);
      const { data: filas, error: eU } = await q.select('id');
      if (eU) return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: 'actualizar reserva: ' + eU.message };
      escrito = !!(filas && filas.length);   // si no tocó filas, alguien escribió entre medio: se relee
    }
    if (!escrito) return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: 'la reserva cambió muchas veces seguidas' };
    // Dato de control: lo que suman los cobros de la web (el ERP puede tener más, en efectivo).
    let sumaCobros: number | null = null;
    try {
      const { data: cobros, error: eC } = await sb.from('crm_pagos')
        .select('id,estado,monto,monto_pagado,pagos_extra,devuelto_monto').eq('tipo', 'reserva').eq('ref_id', refId);
      if (eC) console.error('[cobros] suma de control reserva:', eC.message);
      else sumaCobros = (cobros || []).reduce((a: number, c: any) => a + Math.max(0, _cobradoDe(c) - (Number(c.devuelto_monto) || 0)), 0);
    } catch (e) { console.error('[cobros] suma de control reserva:', e); }
    return { ok: true, tabla, montoPagadoTotal: nuevo, montoTotal: null, pago: null, sumaCobros };
  } catch (e) {
    return { ok: false, tabla, montoPagadoTotal: null, montoTotal: null, pago: null, error: _msg(e) };
  }
}

// ── el aviso de plata al ERP (tipo 'pago'; los campos nuevos son aditivos) ──
function payloadPagoERP(cobro: any, o: { estado: 'aprobado' | 'devuelto'; monto: number; ficha: ResultadoFicha | null; mpPaymentId: string | null; pagadoAt: string | null }) {
  const servicio = servicioDeCobro(cobro);
  const total = o.ficha?.montoTotal ?? null;
  const pagadoTotal = o.ficha?.montoPagadoTotal ?? null;
  return {
    tipo: 'pago',
    web_id: cobro.ref_id,
    web_tipo: servicio === 'cumpleanos' ? 'cumpleanos' : 'reserva',
    tabla: tablaDeCobro(cobro),
    folio: folioDeCobro(cobro),
    // Los pagos manuales no tienen pedido: viaja el folio para que igual tengan llave.
    external_reference: cobro.pedido_id != null ? String(cobro.pedido_id) : folioDeCobro(cobro),
    mp_payment_id: o.mpPaymentId,
    estado: o.estado,
    monto: o.monto,
    monto_pagado_total: pagadoTotal,
    monto_total: total,
    es_abono: total != null && total > 0 && pagadoTotal != null ? pagadoTotal < total : false,
    medio: cobro.medio || 'mercadopago',
    concepto: cobro.concepto ?? null,
    tipo_pago: cobro.tipo,
    pagado_at: o.pagadoAt,
    // Reservas: lo que suman los cobros de la web, solo para cotejar (monto_pagado_total es el de la ficha).
    suma_cobros: o.ficha?.sumaCobros ?? null,
  };
}

async function _despacharPago(sb: any, payload: Record<string, unknown>) {
  try { await despacharWebhook(sb, payload); } catch (e) { console.error('[cobros] webhook ERP pago:', e); }
}

// ── correo corto al cliente (mismo remitente y estilo que form-submit) ──
async function _correoPagoRecibido(sb: any, cobro: any, monto: number) {
  try {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key || !cobro?.pedido_id) return;
    const { data: ped } = await sb.from('pedidos').select('nombre_cliente,email_cliente').eq('id', cobro.pedido_id).maybeSingle();
    const to = String(ped?.email_cliente || '').trim();
    if (!to) return;
    const servicio = servicioDeCobro(cobro);
    const pn = String(ped?.nombre_cliente || '').trim().split(/\s+/)[0] || '';
    const que = servicio === 'cumpleanos' ? 'el pago de tu cumpleaños 🎂' : servicio === 'reserva' ? 'el pago de tu reserva 🍾' : 'tu pago';
    const asunto = servicio === 'cumpleanos' ? 'Recibimos el pago de tu cumpleaños 🎂'
                 : servicio === 'reserva' ? 'Recibimos el pago de tu reserva 🍾' : 'Recibimos tu pago · FRATE';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Frate <tickets@frate.cl>', to: [to], subject: asunto,
        html: `<div style="font-family:sans-serif;max-width:520px;background:#0a0a0b;color:#f4f4f5;padding:28px 24px;border-radius:12px;">
            <div style="font-weight:900;font-size:26px;letter-spacing:2px;">FRAT<span style="color:#E8363D;">E</span></div>
            <p style="font-size:15px;line-height:1.6;">${pn ? ('¡Hola ' + _esc(pn) + '! ') : ''}Recibimos ${que} por <b>${_clp(monto)}</b>. Te escribimos para coordinar los detalles.</p>
            <p style="font-size:13px;color:#a1a1aa;line-height:1.6;">Orden <b>${_esc(folioDeCobro(cobro))}</b> · Si tienes dudas, escríbenos por WhatsApp al <b>+56 9 8131 1548</b> 🎧</p>
            <p style="font-size:11px;color:#52525b;margin-top:18px;">Fraternidad · Campus Central del carrete universitario · frate.cl</p>
          </div>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { console.error('[cobros] correo cliente:', e); }
}

// ============================================================
// RECONCILIAR: un pago aprobado de MP → el cobro y la ficha
// IDEMPOTENTE: lo pueden llamar el webhook, sus reintentos y «sincronizar»
// sobre el mismo pago, y la plata se suma UNA vez. El «candado» es el
// update condicionado a que nadie haya puesto el payment id antes, y a que
// el estado y el cotejo_detalle sigan siendo los que se leyeron.
// ============================================================

// La línea del historial de un pago de MP (la misma al sumar y al reintentar).
const _lineaPagoMP = (cobro: any, monto: number, esPrimero: boolean) => esPrimero
  ? `💳 Pago MercadoPago ${folioDeCobro(cobro)} ${_clp(monto)}${cobro?.concepto ? ' · ' + cobro.concepto : ''}`
  : `💸 Pagaron dos veces ${folioDeCobro(cobro)}: otro pago MercadoPago ${_clp(monto)}`;

/** Saca [ficha-pendiente:<pid>] con candado. Devuelve la fila nueva, o null si
 *  cotejo_detalle cambió entre medio: la marca queda y el próximo reintento no
 *  suma dos veces (la línea del pago ya está en el historial). */
async function _quitarMarcaPendiente(sb: any, cobro: any, pid: string): Promise<any | null> {
  try {
    const q = _conCandado(sb.from('crm_pagos')
      .update({ cotejo_detalle: _quitarLinea(cobro.cotejo_detalle, marcaFichaPendiente(pid)) })
      .eq('id', cobro.id), 'cotejo_detalle', cobro.cotejo_detalle);
    const { data, error } = await q.select('*');
    if (error) { console.error('[cobros] quitar ficha-pendiente:', error.message); return null; }
    return data?.[0] || null;
  } catch (e) { console.error('[cobros] quitar ficha-pendiente:', e); return null; }
}

/** Vuelve a aplicar a la ficha un pago marcado [ficha-pendiente:<pid>]. Sin
 *  aviso al staff: ya se avisó la primera vez y el cron lo repite cada 10 min. */
async function _reintentarFicha(sb: any, cobro: any, pid: string): Promise<{ ficha: ResultadoFicha; fila: any | null }> {
  const monto = _montoDePago(cobro, pid) ?? 0;
  const esPrimero = String(cobro?.mp_payment_id || '') === pid;
  const ficha = await aplicarPagoAFicha(sb, cobro, monto, _lineaPagoMP(cobro, monto, esPrimero), 'MercadoPago', pid);
  if (!ficha.ok) { console.error('[cobros] reintento de ficha pendiente', cobro?.id, pid, ficha.error); return { ficha, fila: null }; }
  return { ficha, fila: await _quitarMarcaPendiente(sb, cobro, pid) };
}

/** Devolución parcial hecha en el panel de MP: el pago sigue 'approved' con
 *  transaction_amount_refunded > 0 y no llega ningún 'refunded' que la traiga.
 *  Va acumulada por pago: el cron la repite sin descontar dos veces, y si esa
 *  misma plata ya se registró con «Devolución manual» (misma marca por pago),
 *  aplica 0. */
async function _devolucionParcialMP(sb: any, pedidoId: number, pid: string, pago: any): Promise<ResultadoDevolver | undefined> {
  const devuelto = Math.round(Number(pago?.transaction_amount_refunded) || 0);
  if (!(devuelto > 0)) return undefined;
  const d = await devolverCobro(sb, {
    pedidoId, monto: devuelto, paymentId: pid, acumulado: true, enPedido: true, motivo: 'hecha en el panel de MercadoPago',
    refundsMP: Array.isArray(pago?.refunds) ? pago.refunds : null,
  });
  // Sin aviso: si falló, el próximo repaso lo vuelve a intentar.
  if (d.error) console.error('[cobros] devolución parcial MP', pedidoId, pid, d.error);
  return d;
}

/** Candado de #36. Un cobro VIEJO (sin creado_por) pendiente con la orden ya
 *  pagada se anota SIN sumar: lo pagó el «sincronizar» viejo y pudo sumarse a
 *  mano. Pero si MP manda dos avisos casi juntos, el segundo lee la orden que
 *  acaba de pagar el primero y la tomaba por pagada «de antes»: la ficha se
 *  quedaba sin la plata. Por eso, ANTES de marcar pagada la orden, el proceso
 *  deja [pago-en-curso:<pid>] en el cobro (con candado sobre cotejo_detalle y
 *  mp_payment_id): el otro aviso lee la orden después, así que también ve la
 *  marca, y los dos deciden igual (sumar). Cobros nuevos: no escribe nada.
 *  Nunca lanza; si no puede escribir, se sigue como antes (queda en el log). */
export async function anotarPagoEnCurso(sb: any, cobro: any, paymentId: string | number): Promise<boolean> {
  const pid = String(paymentId ?? '').trim();
  if (!pid || !cobro?.id || cobro.creado_por || cobro.mp_payment_id || cobro.estado === 'pagado' || cobro.estado === 'devuelto') return false;
  const marca = marcaPagoEnCurso(pid);
  let previo: string | null = cobro.cotejo_detalle ?? null;
  try {
    for (let intento = 0; intento < 3; intento++) {
      if (String(previo || '').includes(marca)) return true;
      const q = _conCandado(sb.from('crm_pagos').update({ cotejo_detalle: _agregarDetalle(previo, marca) })
        .eq('id', cobro.id).is('mp_payment_id', null), 'cotejo_detalle', previo);
      const { data: up, error: eU } = await q.select('id');
      if (eU) { console.error('[cobros] marca de pago en curso:', eU.message); return false; }
      if (up && up.length) return true;
      // Otro proceso escribió entre medio: se relee (si ya registró el pago, no hace falta la marca).
      const { data: fila, error: eL } = await sb.from('crm_pagos').select('id,cotejo_detalle,mp_payment_id').eq('id', cobro.id).maybeSingle();
      if (eL || !fila || fila.mp_payment_id) return false;
      previo = fila.cotejo_detalle ?? null;
    }
  } catch (e) { console.error('[cobros] marca de pago en curso:', e); }
  return false;
}

export async function reconciliarCobro(sb: any, opts: { pedidoId: number; pago: any; via: ViaPago | string; pedidoYaPagado?: boolean }): Promise<ResultadoReconciliar> {
  const pedidoId = Number(opts?.pedidoId) || 0;
  const pago = opts?.pago || {};
  const via = ['webhook', 'sincronizar', 'manual', 'erp'].includes(String(opts?.via)) ? String(opts.via) : 'webhook';
  if (!pedidoId) return { esCobro: false };

  for (let intento = 0; intento < 3; intento++) {
    const { data: filas, error: eL } = await sb.from('crm_pagos').select('*')
      .eq('pedido_id', pedidoId).order('id', { ascending: false }).limit(1);
    if (eL) throw new Error('crm_pagos: ' + eL.message);
    const cobro = filas?.[0];
    if (!cobro) return { esCobro: false };

    const pid = String(pago?.id ?? '').trim();
    if (!pid) throw new Error('reconciliarCobro: el pago no trae id');
    if (pago.status && pago.status !== 'approved') return { esCobro: true, noAprobado: true, cobro };
    if (pago.external_reference != null && pago.external_reference !== '' && String(pago.external_reference) !== String(pedidoId)) {
      throw new Error(`reconciliarCobro: el pago ${pid} es de otro pedido (${pago.external_reference})`);
    }
    const monto = Math.round(Number(pago.transaction_amount) || 0);
    const devueltoMP = Math.round(Number(pago.transaction_amount_refunded) || 0);
    const folio = folioDeCobro(cobro);
    const extras = Array.isArray(cobro.pagos_extra) ? cobro.pagos_extra : [];
    if (String(cobro.mp_payment_id || '') === pid || extras.some((x: any) => String(x?.payment_id) === pid)) {
      // Ya registrado. Si la ficha quedó pendiente se reintenta (sin sumar dos
      // veces) y, recién con la ficha al día, se mira si MP informa una devolución parcial.
      let fila = cobro;
      let ficha: ResultadoFicha | undefined;
      if (String(cobro.cotejo_detalle || '').includes(marcaFichaPendiente(pid))) {
        const rf = await _reintentarFicha(sb, cobro, pid);
        ficha = rf.ficha;
        if (rf.fila) fila = rf.fila;
      }
      const devolucion = (!ficha || ficha.ok) ? await _devolucionParcialMP(sb, pedidoId, pid, pago) : undefined;
      return {
        esCobro: true, yaEstaba: true, cobro: devolucion?.cobro || fila,
        ...(ficha ? { ficha, fichaReintentada: true } : {}), ...(devolucion ? { devolucion } : {}),
      };
    }
    const ahora = new Date().toISOString();
    const pagadoAt = String(pago.date_approved || ahora);

    // ── Cobro viejo: quedó 'pagado' antes de existir mp_payment_id. El código
    //    anterior YA sumó esa plata a la ficha: volver a sumarla sería doble. ──
    let idPrevio = cobro.mp_payment_id ? String(cobro.mp_payment_id) : '';
    if (!idPrevio && (cobro.estado === 'pagado' || cobro.estado === 'devuelto')) {
      const { data: ped, error: eP } = await sb.from('pedidos').select('referencia_pago').eq('id', pedidoId).maybeSingle();
      if (eP) throw new Error('pedidos: ' + eP.message);
      const m = String(ped?.referencia_pago || '').match(/^MP-(\d+)/);
      if (!m || m[1] === pid) {
        const cot = cobro.cotejo || (Math.abs(monto - (Number(cobro.monto) || 0)) <= 1 ? 'cuadra' : 'monto_distinto');
        let det = _agregarDetalle(cobro.cotejo_detalle, `Pago MP ${pid} anotado después: la ficha ya lo tenía sumado.`);
        // El código viejo tampoco descontaba devoluciones: lo que MP ya informa
        // devuelto queda como contado de antes (marca), sin tocar la ficha.
        if (devueltoMP > 0) det = _agregarDetalle(det, `MP ya informa ${_clp(devueltoMP)} devuelto de ese pago: no se descontó de la ficha (revísala). ${_marcaDevPrevia(pid, devueltoMP)}`);
        const q = _conCandado(sb.from('crm_pagos').update({
          mp_payment_id: pid,
          monto_pagado: cobro.monto_pagado ?? monto,
          pagado_via: cobro.pagado_via || via,
          cotejo: cot,
          cotejo_detalle: det,
        }).eq('id', cobro.id).is('mp_payment_id', null), 'estado', cobro.estado);
        const { data: up, error: eU } = await q.select('*');
        if (eU) throw new Error('crm_pagos (adoptar): ' + eU.message);
        if (!up || !up.length) continue;       // otro proceso lo tomó: se relee
        return { esCobro: true, yaEstaba: true, adoptado: true, cotejo: cot, cobro: up[0] };
      }
      // El código viejo registró OTRO pago: se anota ese como el primero y
      // este cae abajo como segundo pago.
      const { data: up, error: eU } = await sb.from('crm_pagos').update({
        mp_payment_id: m[1], monto_pagado: cobro.monto_pagado ?? cobro.monto,
      }).eq('id', cobro.id).is('mp_payment_id', null).select('*');
      if (eU) throw new Error('crm_pagos (primer pago viejo): ' + eU.message);
      if (!up || !up.length) continue;
      idPrevio = m[1];
      Object.assign(cobro, up[0]);
    }

    // Solo en formularios el pago queda marcado [ficha-pendiente] hasta que la
    // ficha lo tenga: su historial evita sumar dos veces al reintentar. En
    // reservas un reintento no se distingue de un pago nuevo (sin marca: aviso).
    const marca = tablaDeCobro(cobro) === 'formularios' ? marcaFichaPendiente(pid) : null;

    // ── Segundo pago aprobado sobre el mismo link ──
    if (idPrevio) {
      const nuevos = [...extras, { payment_id: pid, monto, at: pagadoAt }];
      let det = _agregarDetalle(cobro.cotejo_detalle, `Segundo pago MP ${pid} por ${_clp(monto)} (${via}).`);
      if (marca) det = _agregarDetalle(det, marca);
      // Candado también sobre cotejo_detalle: una devolución que entró entre
      // medio dejó ahí su marca, y no se puede pisar con la lectura vieja.
      const q = _conCandado(sb.from('crm_pagos').update({
        pagos_extra: nuevos,
        cotejo: 'pagado_doble',
        cotejo_detalle: det,
      }).eq('id', cobro.id).eq('mp_payment_id', idPrevio)
        .not('pagos_extra', 'cs', JSON.stringify([{ payment_id: pid }])), 'cotejo_detalle', cobro.cotejo_detalle);
      const { data: up, error: eU } = await q.select('*');
      if (eU) throw new Error('crm_pagos (doble): ' + eU.message);
      if (!up || !up.length) continue;
      let fila = up[0];
      const ficha = await aplicarPagoAFicha(sb, fila, monto, _lineaPagoMP(fila, monto, false), 'MercadoPago', pid);
      if (ficha.ok && marca) fila = (await _quitarMarcaPendiente(sb, fila, pid)) || fila;
      await avisarStaff(sb, {
        titulo: `💸 Pagaron dos veces ${folio}`,
        detalle: `Entró un SEGUNDO pago de ${_clp(monto)} por el mismo link (${fila.concepto || 'cobro'}).\n`
          + `Ya se sumó a la ficha${ficha.ok ? '' : ' (⚠️ NO se pudo sumar: ' + (ficha.error || 'error')
            + (marca ? '; se vuelve a intentar solo, no lo sumes a mano' : '; súmalo a mano') + ')'}.\n`
          + 'Revisa con el cliente si corresponde devolver uno.',
      });
      await _despacharPago(sb, payloadPagoERP(fila, { estado: 'aprobado', monto, ficha, mpPaymentId: pid, pagadoAt }));
      const devolucion = ficha.ok ? await _devolucionParcialMP(sb, pedidoId, pid, pago) : undefined;
      return { esCobro: true, dobles: true, cotejo: 'pagado_doble', cobro: devolucion?.cobro || fila, ficha, ...(devolucion ? { devolucion } : {}) };
    }

    // ── Primer pago ──
    const estadoPrevio = String(cobro.estado || '');
    const esperado = Number(cobro.monto) || 0;
    const cotejo = (estadoPrevio === 'reemplazado' || estadoPrevio === 'anulado') ? 'link_reemplazado'
                 : Math.abs(monto - esperado) <= 1 ? 'cuadra' : 'monto_distinto';
    const detalle = cotejo === 'link_reemplazado' ? `Pagaron un link ${estadoPrevio}: ${_clp(monto)} (${via}).`
                  : cotejo === 'monto_distinto' ? `Se esperaba ${_clp(esperado)} y MP informa ${_clp(monto)} (${via}).` : null;
    // Cobro viejo (sin creado_por: el crm-pago nuevo siempre lo llena) que seguía
    // pendiente con la orden YA pagada: el «sincronizar» viejo la pagó sin tocar
    // la ficha y el equipo pudo sumarla a mano. Se anota SIN sumar y se avisa.
    // Candado (#36): si la orden la marcó pagada ESTE pago (otro aviso de MP que
    // corrió casi al mismo tiempo dejó [pago-en-curso:<pid>] antes de marcarla),
    // no es una orden pagada «de antes»: se suma normal, decida quien decida.
    const enCurso = marcaPagoEnCurso(pid);
    const hayEnCurso = String(cobro.cotejo_detalle || '').includes(enCurso);
    const sinSumar = !!opts?.pedidoYaPagado && !cobro.creado_por && !hayEnCurso;
    // La marca de «en curso» ya cumplió: sale en esta misma escritura.
    const detBase: string | null = hayEnCurso ? _quitarLinea(cobro.cotejo_detalle, enCurso) : (cobro.cotejo_detalle ?? null);
    let det: string | null = detalle ? _agregarDetalle(detBase, detalle) : detBase;
    if (sinSumar) {
      det = _agregarDetalle(det, `Pago MP ${pid} anotado SIN sumar a la ficha: la orden ya estaba pagada y el cobro es de antes de los cobros nuevos (${via}).`);
      if (devueltoMP > 0) det = _agregarDetalle(det, `MP ya informa ${_clp(devueltoMP)} devuelto de ese pago: tampoco se descontó. ${_marcaDevPrevia(pid, devueltoMP)}`);
    } else if (marca) {
      det = _agregarDetalle(det, marca);
    }
    // Candado de estado: si entre la lectura y acá lo reemplazaron o anularon,
    // se relee y cae en 'link_reemplazado' con su aviso.
    const q = _conCandado(sb.from('crm_pagos').update({
      estado: 'pagado',
      paid_at: cobro.paid_at || pagadoAt,
      mp_payment_id: pid,
      monto_pagado: monto,
      pagado_via: via,
      medio: 'mercadopago',
      cotejo,
      cotejo_detalle: det,
    }).eq('id', cobro.id).is('mp_payment_id', null), 'estado', cobro.estado);
    const { data: up, error: eU } = await q.select('*');
    if (eU) throw new Error('crm_pagos (pagado): ' + eU.message);
    if (!up || !up.length) continue;           // lo tomó otro proceso: se relee
    let fila = up[0];

    if (sinSumar) {
      await avisarStaff(sb, {
        titulo: `🧾 ${folio}: pago anotado sin sumar a la ficha`,
        detalle: `La orden #${pedidoId} ya estaba pagada (pago MP ${pid}, ${_clp(monto)}), pero su cobro seguía pendiente: es de antes de los cobros nuevos.\n`
          + 'Se anotó en el cobro SIN sumarlo a la ficha, para no contarlo dos veces.\n'
          + 'Súmalo en la ficha si no estaba sumado a mano.'
          + (detalle ? `\n⚠️ Ojo: ${detalle}` : ''),
      });
      return { esCobro: true, sinSumar: true, cotejo, cobro: fila };
    }

    const ficha = await aplicarPagoAFicha(sb, fila, monto, _lineaPagoMP(fila, monto, true), 'MercadoPago', pid);
    if (ficha.ok && marca) fila = (await _quitarMarcaPendiente(sb, fila, pid)) || fila;
    if (!ficha.ok) {
      await avisarStaff(sb, {
        titulo: `🚨 Pago ${folio} sin sumar a la ficha`,
        detalle: `Entró ${_clp(monto)} por MercadoPago y el cobro quedó pagado, pero la ficha NO se actualizó (${ficha.error || 'error'}).\n`
          + (marca ? 'Se vuelve a intentar solo en el próximo repaso de pagos (o con «Sincronizar» en Pagos MP). No lo sumes a mano.'
                   : 'Súmalo a mano en la ficha.'),
      });
    }
    if (cotejo === 'monto_distinto') {
      await avisarStaff(sb, {
        titulo: `⚠️ ${folio}: pagaron un monto distinto`,
        detalle: `El link era por ${_clp(esperado)} y MercadoPago informa ${_clp(monto)}.\nSe sumó lo que llegó de verdad. Revisa la ficha.`,
      });
    } else if (cotejo === 'link_reemplazado') {
      await avisarStaff(sb, {
        titulo: `⚠️ ${folio}: pagaron un link dado de baja`,
        detalle: `Entró ${_clp(monto)} por un link que estaba ${estadoPrevio}. Se sumó a la ficha.\nRevisa que no quede otro link vivo para la misma ficha (posible doble cobro).`,
      });
    }
    await _despacharPago(sb, payloadPagoERP(fila, { estado: 'aprobado', monto, ficha, mpPaymentId: pid, pagadoAt }));
    await _correoPagoRecibido(sb, fila, monto);
    const devolucion = ficha.ok ? await _devolucionParcialMP(sb, pedidoId, pid, pago) : undefined;
    return { esCobro: true, cotejo, cobro: devolucion?.cobro || fila, ficha, ...(devolucion ? { devolucion } : {}) };
  }
  throw new Error(`reconciliarCobro: el cobro del pedido ${pedidoId} cambió muchas veces seguidas`);
}

// ============================================================
// DEVOLVER: la plata que sale también se descuenta de la ficha
// Lo devuelto se lleva POR PAGO de MP con marcas [dev:<paymentId>:<monto>] en
// cotejo_detalle. Así la devolución que hace devolver-pago y el aviso
// 'refunded' que después (o antes) manda MP por el MISMO pago no se descuentan
// dos veces, aunque el cobro tenga un segundo pago que todavía deja margen.
// Candados: `clave` (esa devolución ya se anotó), la marca por pago, el TOPE
// (nunca más de lo cobrado, ni más de lo que entró por ese pago) y el update
// condicionado a devuelto_monto y cotejo_detalle.
//
// UNA contabilidad por pago para los dos caminos (#38/#39): lo que MP informa
// devuelto (webhook, cron, sincronizar) y lo que se registra en devolver-pago
// («Devolución manual» o automática, [dev-reg]). Lo descontado de ese pago
// ([dev]) tiene que llegar a max(lo que MP informa, lo registrado), y cada
// camino aplica solo la diferencia. Así una parcial hecha en el panel de MP y
// registrada además como manual (para la nota de crédito) se descuenta UNA vez,
// en cualquier orden, y una devolución por transferencia registrada aparte
// igual se descuenta… salvo que ese pago tenga plata devuelta desde el panel que
// todavía no se registró: ahí lo registrado se toma como su nota de crédito (no
// hay cómo saber si es otra plata). Para eso devolver-pago acepta `medio`
// ('transferencia' | 'efectivo'): esa devolución va al cobro, sin marca de pago
// ([dev-aparte]). Lo que salió por MP sin pasar por devolver-pago se avisa al staff
// (falta la nota de crédito) y, mientras no se registre, devolver-pago no hace otra
// devolución de ese cobro (409 REGISTRAR_NC_PRIMERO / MONTO_NC_EXACTO).
// Límites conocidos y procedimiento: SPEC, «Límites conocidos y procedimiento».
// Lo devuelto ANTES de los cobros nuevos (corte [dev-previa-hasta] del SQL 01b)
// no se descuenta solo: queda [dev-previa] sin tocar la ficha y se avisa.
// ============================================================

async function _avisarDevolucionPrevia(sb: any, cobro: any, pedidoId: number, pid: string, monto: number) {
  await avisarStaff(sb, {
    titulo: `🧾 ${folioDeCobro(cobro)}: devolución de antes de los cobros nuevos`,
    detalle: `MercadoPago informa ${_clp(monto)} devuelto del pago ${pid} (orden #${pedidoId}), hecho antes de los cobros nuevos.\n`
      + 'Quedó anotado en el cobro SIN descontarlo de la ficha: el sistema de antes no lo descontaba y pudo corregirse a mano.\n'
      + 'Revisa la ficha: si todavía cuenta esa plata como pagada, descuéntala a mano.',
  });
}

/** Devolución que llegó por MercadoPago sin pasar por devolver-pago (panel o
 *  contracargo): la orden también se entera. dev_monto acumula (lo usa el tope
 *  de devolver-pago) y, si ya se devolvió todo lo cobrado, pasa a 'reembolsado'
 *  (sale del KPI de servicios). Los pedidos crm no tienen items: el trigger de
 *  stock no hace nada. Nunca lanza. */
async function _devolucionEnPedido(sb: any, pedidoId: number, aplicado: number, cobro: any) {
  try {
    for (let intento = 0; intento < 3; intento++) {
      const { data: ped, error: eP } = await sb.from('pedidos').select('id,dev_monto').eq('id', pedidoId).maybeSingle();
      // Sin la columna dev_monto (SQL de notas de crédito sin correr) se sigue igual.
      if (eP) { console.error('[cobros] leer dev_monto:', eP.message); break; }
      if (!ped) break;
      const q = _conCandado(sb.from('pedidos').update({ dev_monto: (Number(ped.dev_monto) || 0) + aplicado }).eq('id', pedidoId),
        'dev_monto', ped.dev_monto);
      const { data: up, error: eU } = await q.select('id');
      if (eU) { console.error('[cobros] dev_monto:', eU.message); break; }
      if (up && up.length) break;
    }
    const cobrado = _cobradoDe(cobro);
    if (cobrado > 0 && (Number(cobro?.devuelto_monto) || 0) >= cobrado) {
      const { error } = await sb.from('pedidos').update({ estado: 'reembolsado' }).eq('id', pedidoId).eq('estado', 'pagado');
      if (error) console.error('[cobros] orden reembolsada:', error.message);
    }
  } catch (e) { console.error('[cobros] devolución en la orden:', e); }
}

/** Plata que salió por MercadoPago SIN pasar por 💸 Devolver (panel o contracargo).
 *  La ficha ya quedó bien, pero nadie registró la nota de crédito: se avisa con el
 *  monto exacto a registrar (una vez: solo cuando se descuenta algo nuevo). Si
 *  devolver-pago ya dejó la nota (carrera con el aviso de MP), no se avisa.
 *  Las notas de crédito de la orden incluyen las del devolver-pago viejo: lo devuelto
 *  antes de los cobros nuevos ([dev-previa]) se suma a lo devuelto antes de comparar
 *  (si no, en un cobro viejo la NC de antes tapaba la que falta ahora).
 *  El monto que se pide es el mismo que exige devolver-pago (devueltoSinRegistrar().exacto).
 *  `sinAtribuir` = devuelto de este cobro con «Devolución manual» sin pago asociado
 *  (cobro con más de un pago): puede ser la misma plata y quedar descontada dos
 *  veces. Eso NO se arregla solo (límite conocido, ver SPEC): se avisa. Nunca lanza. */
async function _avisarDevolucionFueraDeDevolver(sb: any, cobro: any, pedidoId: number, pid: string, aplicado: number, sinAtribuir: number) {
  try {
    let notas: number | null = null;
    try {
      const { data, error } = await sb.from('notas_credito').select('monto').eq('pedido_id', pedidoId);
      if (error) console.error('[cobros] leer notas de crédito:', error.message);
      else notas = (data || []).reduce((a: number, n: any) => a + (Math.round(Number(n?.monto)) || 0), 0);
    } catch (e) { console.error('[cobros] leer notas de crédito:', e); }
    const devuelto = (Number(cobro?.devuelto_monto) || 0) + _sumaDe(_marcasPorPago(cobro?.cotejo_detalle, 'dev-previa'));
    const faltaNC = notas == null ? aplicado : Math.min(aplicado, Math.max(0, devuelto - notas));
    if (faltaNC <= 1 && !(sinAtribuir > 0)) return;
    const folio = folioDeCobro(cobro);
    const sr = devueltoSinRegistrar(cobro);
    const exacto = sr.exacto || faltaNC;
    const registrar = `regístrala con 💸 Devolver → Devolución manual → «Panel de MercadoPago» por ${_clp(exacto)} exactos (con esa opción 💸 Devolver no acepta otro monto). No se descuenta de nuevo de la ficha.`;
    // V16: una «Devolución manual» anterior de ese pago pudo ser una transferencia registrada sin medio.
    const otroMonto = sr.completo > sr.exacto + 1 ? sr.completo : 0;
    if (sinAtribuir > 0) {
      await avisarStaff(sb, {
        titulo: `⚠️ ${folio}: posible devolución descontada dos veces`,
        detalle: `MercadoPago informa ${_clp(aplicado)} devueltos del pago ${pid} (orden #${pedidoId}) y se descontaron de la ficha. `
          + `Este cobro tiene más de un pago y ya tenía ${_clp(sinAtribuir)} devueltos con «Devolución manual» sin pago asociado.\n`
          + `· Si era la MISMA plata: la ficha quedó descontada dos veces. Súmale ${_clp(aplicado)} a mano y no registres otra nota de crédito.\n`
          + `· Si era OTRA plata: ${faltaNC > 1 ? 'falta la nota de crédito, ' + registrar : 'no hay que hacer nada.'}\n`
          + 'En un cobro pagado dos veces, el pago repetido se devuelve con 💸 Devolver → automático, no desde el panel de MercadoPago.',
      });
      return;
    }
    await avisarStaff(sb, {
      titulo: `🧾 ${folio}: devolución sin nota de crédito`,
      detalle: `Salieron ${_clp(aplicado)} del pago ${pid} por MercadoPago (orden #${pedidoId}) sin pasar por 💸 Devolver del admin: una devolución desde el panel de MercadoPago o un contracargo. Ya se descontó de la ficha.\n`
        + (notas == null
          ? `No se pudo revisar si la orden ya tiene su nota de crédito: míralo en 🧾 Notas de Crédito. Si no está, ${registrar}\n`
          : `Falta la nota de crédito: ${registrar} Mientras no la registres, 💸 Devolver → automático de este cobro queda bloqueado. Si además devolviste plata de este cobro por transferencia o efectivo, regístrala antes con su medio: después de esta nota de crédito la orden queda devuelta.\n`)
        + (otroMonto
          ? `· Si la «Devolución manual» que registraste antes en este pago salió por transferencia o efectivo (no por el panel), regístrala en cambio por ${_clp(otroMonto)}, lo que salió del panel completo: se descuenta solo la diferencia.\n`
          : '')
        + 'Los cobros de servicio se devuelven con 💸 Devolver en el admin, no desde el panel de MercadoPago.',
    });
  } catch (e) { console.error('[cobros] aviso devolución fuera de 💸 Devolver:', e); }
}

export async function devolverCobro(sb: any, opts: {
  pedidoId: number; monto: number; clave?: string | null; motivo?: string | null;
  paymentId?: string | number | null; acumulado?: boolean; enPedido?: boolean;
  registro?: number | null; refundsMP?: any[] | null; pagoPresunto?: boolean; aparte?: boolean;
}): Promise<ResultadoDevolver> {
  const pedidoId = Number(opts?.pedidoId) || 0;
  const montoPedido = Math.round(Number(opts?.monto) || 0);
  const clave = String(opts?.clave || '').trim();
  const pidOpt = String(opts?.paymentId ?? '').trim();
  const registroOpt = opts?.registro != null ? Math.max(0, Math.round(Number(opts.registro) || 0)) : null;
  const refundsMP = Array.isArray(opts?.refundsMP) ? opts.refundsMP : null;
  // Sin corchetes: el motivo lo escribe una persona y no puede fabricar marcas.
  const motivo = String(opts?.motivo || '').replace(/[[\]]/g, '').trim().slice(0, 120);
  if (!pedidoId) return { esCobro: false };

  for (let intento = 0; intento < 4; intento++) {
    const { data: filas, error: eL } = await sb.from('crm_pagos').select('*')
      .eq('pedido_id', pedidoId).order('id', { ascending: false }).limit(1);
    if (eL) return { esCobro: false, error: 'crm_pagos: ' + eL.message };
    let cobro = filas?.[0];
    if (!cobro) return { esCobro: false };
    if (montoPedido <= 0) return { esCobro: true, error: 'monto_invalido', cobro };
    if (clave && String(cobro.cotejo_detalle || '').includes(`[${clave}]`)) return { esCobro: true, yaEstaba: true, montoAplicado: 0, cobro };

    const cobrado = _cobradoDe(cobro);
    if (cobrado <= 0) {
      console.warn('[cobros] devolución sobre un cobro sin pago registrado', pedidoId);
      return { esCobro: true, montoAplicado: 0, cobro, error: 'sin_pago_registrado' };
    }
    const previo = Number(cobro.devuelto_monto) || 0;
    // Devolución manual: el pago se sacó de la orden. Con más de un pago en el
    // cobro no se sabe de cuál salió la plata: se lleva solo con el tope por cobro.
    const pid = opts?.pagoPresunto && Array.isArray(cobro.pagos_extra) && cobro.pagos_extra.length ? '' : pidOpt;
    const acumulado = !!opts?.acumulado && !!pid;
    const registro = pid ? registroOpt : null;
    // Sin el pago, lo que se devuelve es lo registrado (no lo que MP informa de uno de los pagos).
    let solicitado = !pid && pidOpt && registroOpt != null ? registroOpt : montoPedido;
    let tope = Math.max(0, cobrado - previo);
    let nuevaPrevia = 0, previaResuelta = false;
    // Con `registro`: lo que MP informaba devuelto de ese pago sin registrar, y la
    // parte de lo registrado que es eso (su nota de crédito, no plata nueva).
    let sinRegistrar = 0, absorbido = 0, dudosa = false;
    if (pid) {
      const delPago = _montoDePago(cobro, pid);
      if (delPago == null) {
        console.warn('[cobros] devolución de un pago que no está registrado en el cobro', pedidoId, pid);
        return { esCobro: true, montoAplicado: 0, cobro, error: 'pago_no_registrado' };
      }
      // Si ese pago nunca llegó a la ficha, primero se suma (sin duplicar): si
      // no, se descontaría plata que la ficha nunca tuvo.
      if (String(cobro.cotejo_detalle || '').includes(marcaFichaPendiente(pid))) {
        const rf = await _reintentarFicha(sb, cobro, pid);
        if (!rf.ficha.ok) return { esCobro: true, montoAplicado: 0, cobro, error: 'ficha_pendiente' };
        if (!rf.fila) continue;                // cotejo_detalle cambió entre medio: se relee
        cobro = rf.fila;
      }
      const det = cobro.cotejo_detalle;
      const yaDelPago = _devueltoDePago(det, pid);                 // ya descontado de la ficha
      const previa = _sumaMarcas(det, 'dev-previa', pid);          // de antes, sin tocar la ficha
      const registrado = _sumaMarcas(det, 'dev-reg', pid);         // registrado en devolver-pago
      // ── Devoluciones de ANTES de los cobros nuevos (corte del SQL 01b) ──
      // Se resuelven la primera vez que llega lo que MP informa de ese pago: lo
      // devuelto hasta el corte queda [dev-previa] (sin tocar la ficha) y el corte sale.
      let usarMP = acumulado;
      const corte = _previaHasta(det, pid);
      if (corte && acumulado) {
        let antes: number | null = null;
        if (refundsMP) {
          antes = refundsMP
            .filter((x: any) => (x?.status == null || x.status === 'approved') && Date.parse(String(x?.date_created || '')) <= corte.ms)
            .reduce((a: number, x: any) => a + (Math.round(Number(x?.amount)) || 0), 0);
        } else if (registro == null) {
          // Sin el detalle con fechas, lo que no está descontado se toma como de antes (y se avisa).
          antes = Math.max(0, montoPedido - yaDelPago);
        }
        if (antes != null) { nuevaPrevia = Math.max(0, antes - previa); previaResuelta = true; }
        else usarMP = false;                   // devolver-pago sin el detalle: vale solo lo registrado
      }
      const mpNuevo = usarMP ? Math.max(0, montoPedido - previa - nuevaPrevia) : 0;
      if (registro != null) {
        solicitado = Math.max(0, Math.max(mpNuevo, registrado + registro) - yaDelPago);
        sinRegistrar = Math.max(0, Math.max(mpNuevo, yaDelPago) - registrado);
        absorbido = Math.min(registro, sinRegistrar);
        // Registro de devolver-pago que no calza con lo que MP informaba sin registrar (ni
        // con eso más lo dudoso de antes): puede ser esa devolución u otra plata sin medio
        // (V4: cabe en una del panel más grande · V16: MP todavía no informaba nada). Queda
        // marcado para que la nota de crédito del panel se pueda registrar por su monto completo.
        dudosa = !clave && Math.abs(registro - sinRegistrar) > 1
          && Math.abs(registro - (sinRegistrar + _dudosoSinAclarar(det, pid))) > 1;
      } else if (acumulado) solicitado = Math.max(0, mpNuevo - yaDelPago);
      tope = Math.min(tope, Math.max(0, delPago - yaDelPago));
    }
    const aplicado = Math.min(solicitado, tope);
    // cotejo_detalle con el corte ya resuelto (si tocaba).
    const corteTok = previaResuelta ? _previaHasta(cobro.cotejo_detalle, pid)?.token : null;
    const detBase: string | null = corteTok
      ? String(cobro.cotejo_detalle).replace(corteTok, `${_clp(nuevaPrevia)} ${_marcaDevPrevia(pid, nuevaPrevia)}`)
      : (cobro.cotejo_detalle ?? null);

    // Devuelto con «Devolución manual» sin pago asociado (cobro con más de un pago):
    // si ahora MP informa una devolución de uno de sus pagos, puede ser la misma plata.
    // Lo registrado con medio transferencia/efectivo ([dev-aparte]) no entra: es otra plata.
    const sinAtribuir = opts?.enPedido ? _devueltoSinPago(cobro) : 0;
    // Transferencia o efectivo (sin pago de MP): queda marcado como plata aparte.
    const aparte = !!opts?.aparte && !pid;
    const extraReg = registro != null && pid ? { sinRegistrar, absorbido } : {};

    if (aplicado <= 0) {
      // Nada que descontar de la ficha. Igual se anota la devolución registrada
      // (para que la siguiente no la vuelva a contar) y el corte resuelto.
      if (!previaResuelta && !registro) return { esCobro: true, yaEstaba: true, montoAplicado: 0, cobro };
      // Lo registrado era lo que MP ya informaba devuelto (su nota de crédito) o ese
      // pago ya no tiene plata por descontar: dice cuál de las dos, no «ya estaba descontada».
      const porque = absorbido > 0 ? 'es lo que MercadoPago ya informaba devuelto de ese pago (ya estaba descontado de la ficha)'
                                   : 'ese pago ya no tiene plata por descontar de la ficha';
      const det2 = registro
        ? _agregarDetalle(detBase, `Devolución ${_clp(registro)} registrada sin descontar de nuevo: ${porque}${motivo ? ' · ' + motivo : ''}${clave ? ` [${clave}]` : ''} ${_marcaDevReg(pid, registro)}${dudosa ? ' ' + _marcaDevDudosa(pid, registro) : ''}`)
        : detBase;
      const q0 = _conCandado(sb.from('crm_pagos').update({ cotejo_detalle: det2 }).eq('id', cobro.id), 'cotejo_detalle', cobro.cotejo_detalle);
      const { data: up0, error: eU0 } = await q0.select('*');
      if (eU0) return { esCobro: true, cobro, error: 'crm_pagos (anotar devolución): ' + eU0.message };
      if (!up0 || !up0.length) continue;       // otra escritura entró entre medio: se relee
      if (nuevaPrevia > 0) await _avisarDevolucionPrevia(sb, up0[0], pedidoId, pid, nuevaPrevia);
      return { esCobro: true, yaEstaba: true, montoAplicado: 0, cobro: up0[0], ...extraReg };
    }

    const folio = folioDeCobro(cobro);
    const linea = `Devolución ${_clp(aplicado)}${motivo ? ' · ' + motivo : ''}${clave ? ` [${clave}]` : ''}`
      + `${pid ? ' ' + _marcaDev(pid, aplicado) : ''}${registro ? ' ' + _marcaDevReg(pid, registro) : ''}${dudosa ? ' ' + _marcaDevDudosa(pid, registro!) : ''}${aparte ? ' ' + _marcaDevAparte(aplicado) : ''}`;
    let q = sb.from('crm_pagos').update({
      estado: 'devuelto',
      devuelto_at: new Date().toISOString(),
      devuelto_monto: previo + aplicado,
      cotejo_detalle: _agregarDetalle(detBase, linea),
    }).eq('id', cobro.id);
    q = _conCandado(q, 'devuelto_monto', cobro.devuelto_monto);
    // cotejo_detalle es la «versión» de las marcas: un pago doble u otra
    // devolución que entró entre medio no se borra con esta lectura vieja.
    q = _conCandado(q, 'cotejo_detalle', cobro.cotejo_detalle);
    const { data: up, error: eU } = await q.select('*');
    if (eU) return { esCobro: true, cobro, error: 'crm_pagos (devuelto): ' + eU.message };
    if (!up || !up.length) continue;           // otra escritura entró entre medio: se relee
    const fila = up[0];

    const ficha = await aplicarPagoAFicha(sb, fila, -aplicado, `↩️ Devolución ${folio} ${_clp(aplicado)}`);
    if (!ficha.ok) {
      await avisarStaff(sb, {
        titulo: `🚨 Devolución ${folio} sin descontar de la ficha`,
        detalle: `Se devolvieron ${_clp(aplicado)} pero la ficha NO se actualizó (${ficha.error || 'error'}).\nDescuéntalo a mano en la ficha.`,
      });
    }
    await _despacharPago(sb, payloadPagoERP(fila, { estado: 'devuelto', monto: aplicado, ficha, mpPaymentId: pid || (fila.mp_payment_id ?? null), pagadoAt: fila.paid_at ?? null }));
    if (opts?.enPedido) {
      await _devolucionEnPedido(sb, pedidoId, aplicado, fila);
      await _avisarDevolucionFueraDeDevolver(sb, fila, pedidoId, pid, aplicado, sinAtribuir);
    }
    if (nuevaPrevia > 0) await _avisarDevolucionPrevia(sb, fila, pedidoId, pid, nuevaPrevia);
    return { esCobro: true, montoAplicado: aplicado, cobro: fila, ficha, ...extraReg };
  }
  return { esCobro: true, error: 'el cobro cambió muchas veces seguidas' };
}

// ============================================================
// PAGO MANUAL (efectivo / transferencia / tarjeta en el local)
// Crea el cobro YA pagado, sin pedido ni link, y lo aplica a la ficha con
// el mismo camino que un pago de MP. via 'erp' = lo informó el ERP: no se le
// devuelve el aviso de 'pago' (sería un eco), solo la ficha actualizada.
// ⚠️ No es idempotente: quien llama cuida no registrar dos veces lo mismo.
// ============================================================
export async function registrarPagoManual(sb: any, opts: {
  tipo: string; refId: number; monto: number; medio: string; nota?: string | null;
  via?: 'manual' | 'erp'; creadoPor?: string | null; creadoPorNombre?: string | null;
}): Promise<ResultadoManual> {
  const tipo = String(opts?.tipo || '');
  const refId = Number(opts?.refId) || 0;
  const monto = Math.round(Number(opts?.monto) || 0);
  const medio = String(opts?.medio || '');
  const via = opts?.via === 'erp' ? 'erp' : 'manual';
  const nota = String(opts?.nota || '').trim().slice(0, 200);
  if (tipo !== 'formulario' && tipo !== 'reserva') return { ok: false, code: 'DATOS', error: 'El pago manual es para un cumpleaños o una reserva.' };
  if (!refId) return { ok: false, code: 'NO_EXISTE_FICHA', error: 'Falta la ficha.' };
  if (!monto || monto < 1) return { ok: false, code: 'DATOS', error: 'Monto inválido.' };
  if (!(MEDIOS_MANUALES as string[]).includes(medio)) return { ok: false, code: 'DATOS', error: 'Medio inválido (efectivo, transferencia o tarjeta).' };

  let ficha0: FichaInfo | null;
  try { ficha0 = await resolverFicha(sb, tipo, refId); } catch (e) { return { ok: false, code: 'ERROR', error: _msg(e) }; }
  if (!ficha0) return { ok: false, code: 'NO_EXISTE_FICHA', error: 'No existe esa ficha.' };

  const ahora = new Date().toISOString();
  const { data: ins, error: eI } = await sb.from('crm_pagos').insert({
    pedido_id: null, tipo, ref_id: refId, monto,
    concepto: nota || `Pago ${medio}`,
    servicio: ficha0.servicio, tabla: ficha0.tabla,
    estado: 'pagado', paid_at: ahora, pagado_via: via, medio,
    monto_pagado: monto, cotejo: 'cuadra',
    creado_por: opts?.creadoPor || null, creado_por_nombre: opts?.creadoPorNombre || null,
  }).select('*').single();
  if (eI || !ins) return { ok: false, code: 'ERROR', error: 'No se pudo registrar el pago: ' + (eI?.message || 'sin fila') };

  const folio = folioDe(ficha0.prefijo, ins.id, true);
  const { data: conFolio, error: eF } = await sb.from('crm_pagos').update({ folio }).eq('id', ins.id).select('*').single();
  if (eF || !conFolio) {
    // Sin folio no se aplica nada: se borra para no dejar plata a medias.
    const { error: eD } = await sb.from('crm_pagos').delete().eq('id', ins.id);
    if (eD) console.error('[cobros] no se pudo borrar el pago manual a medias', ins.id, eD.message);
    return { ok: false, code: 'ERROR', error: 'No se pudo asignar el folio: ' + (eF?.message || 'sin fila') };
  }

  const medioTxt = medio === 'efectivo' ? 'efectivo' : medio === 'transferencia' ? 'transferencia' : 'tarjeta';
  const ficha = await aplicarPagoAFicha(sb, conFolio, monto,
    `💵 Pago manual ${folio} ${_clp(monto)} · ${medioTxt}${nota ? ' · ' + nota : ''}${via === 'erp' ? ' · desde el ERP' : ''}`,
    opts?.creadoPorNombre || (via === 'erp' ? 'ERP' : null));
  let aviso: string | undefined;
  if (!ficha.ok) {
    aviso = `El pago ${folio} quedó registrado, pero la ficha no se actualizó (${ficha.error || 'error'}). No lo registres de nuevo: súmalo a mano.`;
    await avisarStaff(sb, { titulo: `🚨 Pago manual ${folio} sin sumar a la ficha`, detalle: aviso });
  }
  if (via !== 'erp') {
    await _despacharPago(sb, payloadPagoERP(conFolio, { estado: 'aprobado', monto, ficha, mpPaymentId: null, pagadoAt: ahora }));
  }
  return { ok: true, folio, cobro: conFolio, ficha, aviso };
}

// ============================================================
// ANULAR UN PAGO MANUAL mal digitado ($300.000 en vez de $30.000)
// Antes no había vuelta: 'anular' exige un link pendiente y devolver-pago
// exige un pedido. Solo para pagos manuales (sin pedido) que estén 'pagado';
// el candado es el estado. Descuenta de la ficha con el mismo camino que una
// devolución y le avisa al ERP 'devuelto' (salvo si el pago lo informó el
// ERP: via 'erp', sin eco). ⚠️ Si alguien ya corrigió «$ Pagado» a mano,
// esto resta dos veces. El admin lo advierte antes de llamar («🚫 Anular pago
// manual» de la tarjeta 💳 Cobros, _fcAnularManual, en los dos admin); quien
// llame desde otro lado tiene que advertirlo igual.
// ============================================================
export async function anularPagoManual(sb: any, opts: { cobroId: number; motivo?: string | null; por?: string | null }): Promise<ResultadoManual> {
  const cobroId = Number(opts?.cobroId) || 0;
  const motivo = String(opts?.motivo || '').trim().slice(0, 200);
  if (!cobroId) return { ok: false, code: 'DATOS', error: 'Falta el cobro.' };
  try {
    const { data: c, error: eL } = await sb.from('crm_pagos').select('*').eq('id', cobroId).maybeSingle();
    if (eL) return { ok: false, code: 'ERROR', error: 'crm_pagos: ' + eL.message };
    if (!c) return { ok: false, code: 'NO_EXISTE_COBRO', error: 'No existe ese cobro.' };
    if (c.pedido_id != null) return { ok: false, code: 'NO_ANULABLE', error: 'Ese cobro es un link de MercadoPago: se devuelve con 💸 Devolver, no se anula.' };
    if (c.estado !== 'pagado') return { ok: false, code: 'NO_ANULABLE', error: `Ese pago está «${c.estado}»: solo se anula un pago manual pagado.` };
    const monto = Math.round(Number(c.monto_pagado ?? c.monto) || 0);

    const ahora = new Date().toISOString();
    const { data: up, error: eU } = await sb.from('crm_pagos').update({
      estado: 'anulado', anulado_at: ahora, anulado_motivo: motivo || null,
    }).eq('id', cobroId).eq('estado', 'pagado').is('pedido_id', null).select('*');
    if (eU) return { ok: false, code: 'ERROR', error: 'crm_pagos (anular pago manual): ' + eU.message };
    if (!up || !up.length) return { ok: false, code: 'NO_ANULABLE', error: 'El pago cambió mientras lo anulabas. Revisa antes de seguir.' };
    const fila = up[0];
    const folio = folioDeCobro(fila);

    const ficha = await aplicarPagoAFicha(sb, fila, -monto, `🚫 Pago manual ${folio} anulado${motivo ? ' · ' + motivo : ''}`, opts?.por || null);
    let aviso: string | undefined;
    if (!ficha.ok) {
      aviso = `El pago ${folio} quedó anulado, pero la ficha no se actualizó (${ficha.error || 'error'}). No lo anules de nuevo: descuéntalo a mano.`;
      await avisarStaff(sb, { titulo: `🚨 Pago manual ${folio} anulado sin descontar de la ficha`, detalle: aviso });
    }
    if (fila.pagado_via !== 'erp') {
      await _despacharPago(sb, payloadPagoERP(fila, { estado: 'devuelto', monto, ficha, mpPaymentId: null, pagadoAt: fila.paid_at ?? null }));
    }
    return { ok: true, folio, cobro: fila, ficha, aviso };
  } catch (e) {
    return { ok: false, code: 'ERROR', error: _msg(e) };
  }
}
