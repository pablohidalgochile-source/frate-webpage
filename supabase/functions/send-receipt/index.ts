// ============================================================
// FRATE — Edge Function: send-receipt
// Envía comprobante de compra con 1 QR real por cada producto.
// Deploy: Supabase Dashboard → Edge Functions → New function
// Env secret requerido: RESEND_API_KEY
// ============================================================

import { permitirStaffOServicio } from '../_shared/guard.ts';

const RESEND_API = 'https://api.resend.com/emails';
const FROM       = 'Frate Tickets <tickets@frate.cl>';
const SITE_URL   = 'https://frate.cl';

// Email del admin que recibe copia (BCC) de cada venta/cortesía.
// Configurable via env. Si está vacío, no se envía BCC.
const ADMIN_BCC  = Deno.env.get('ADMIN_BCC_EMAIL') || '';

// QR como imagen real desde NUESTRO dominio (ya no api.qrserver.com):
// el token del ticket viaja solo a nuestra infraestructura.
const qrUrl = (data: string) =>
  `https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/qr?s=300&d=${encodeURIComponent(data)}`;


// 🏷️ La etiqueta que ve el CLIENTE en su correo. El nombre real del tipo NO se
//    toca: lo usan la puerta (arma sus mapas por nombre), el ERP (lo recibe
//    congelado en cada venta) y el importador de briefs. Acá sólo se reordena
//    para imprimirlo, porque «PREV 3 MUJER» se lee como «3 entradas de mujer».
//      PREV 3 MUJER + COVER HALLOWEEN → MUJER + COVER HALLOWEEN · PREVENTA 3
//    Espejo de etiquetaPublica() en frate-afiche.js — si cambia una, cambian las dos.
function etiquetaPublica(nombre: unknown): string {
  const n = String(nombre == null ? '' : nombre);
  const m = n.match(/^\s*PREV(?:ENTA)?\s*(\d+)\s+(.+)$/i);
  return m ? `${m[2].trim()} · PREVENTA ${m[1]}` : n;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  // 🔒 Solo el backend (service role) o staff logueado. Antes cualquiera podía
  // mandar correos con la marca FRATE desde tickets@frate.cl (phishing + tickets falsos).
  const permiso = await permitirStaffOServicio(req);
  if (!permiso.ok) return new Response(JSON.stringify({ error: permiso.error }), { status: permiso.status, headers: corsHeaders });

  try {
    const reqBody = await req.json() as { order: Order; preview?: boolean };
    const order = reqBody.order;
    const isPreview = !!reqBody.preview;
    if (!order?.comprador?.email && !isPreview) {
      return new Response(JSON.stringify({ error: 'order.comprador.email requerido' }), { status: 400, headers: corsHeaders });
    }

    // Validez POR TICKET: traer hora máx de ingreso + descripción de cada tipo de ticket comprado
    let ttMap: Record<string, any> = {};
    try {
      const ttIds = [...new Set((order.items || []).filter((it: any) => it && it.ttId != null).map((it: any) => String(it.ttId)))];
      if (ttIds.length) {
        const sbUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
        if (sbUrl && anon) {
          let r = await fetch(`${sbUrl}/rest/v1/tipos_ticket?id=in.(${ttIds.map(encodeURIComponent).join(',')})&select=id,hora_max_ingreso,descripcion,instrucciones,genero`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
          if (!r.ok) r = await fetch(`${sbUrl}/rest/v1/tipos_ticket?id=in.(${ttIds.map(encodeURIComponent).join(',')})&select=id,hora_max_ingreso,descripcion,instrucciones`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
          if (!r.ok) r = await fetch(`${sbUrl}/rest/v1/tipos_ticket?id=in.(${ttIds.map(encodeURIComponent).join(',')})&select=id,hora_max_ingreso,descripcion`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
          if (r.ok) { const rows = await r.json(); (rows || []).forEach((x: any) => { ttMap[String(x.id)] = x; }); }
        }
      }
    } catch (_) { /* sin validez por ticket, sigue igual */ }

    // Expandir items en entradas individuales
    const entries = buildEntries(order, ttMap);

    const mailCfg = await getMailCfg();
    // Validez POR EVENTO: cada evento usa su propia hora de término. Si el ítem no la trae, se busca por eventoId; si no, queda el default global de Config.
    try {
      let evIt: any = (order.items || []).find((it: any) => it && (it.fecha || it.eventoId)) || null;
      // Sin fecha ni evento en los ítems (reserva gratis de crear-pago, reenvíos
      // de mp-pagos): se deduce del tipo de ticket. Antes caía a la hora fija de
      // Config y una noche hasta las 04:00 salía «hasta las 02:00».
      if (!evIt) {
        const itTt: any = (order.items || []).find((it: any) => it && it.ttId != null) || null;
        const sbUrl0 = Deno.env.get('SUPABASE_URL'); const anon0 = Deno.env.get('SUPABASE_ANON_KEY');
        if (itTt && sbUrl0 && anon0) {
          const r0 = await fetch(`${sbUrl0}/rest/v1/tipos_ticket?id=eq.${encodeURIComponent(String(itTt.ttId))}&select=evento_id`, { headers: { apikey: anon0, Authorization: `Bearer ${anon0}` } });
          if (r0.ok) { const x = ((await r0.json()) || [])[0]; if (x && x.evento_id) evIt = { eventoId: x.evento_id }; }
        }
      }
      let hi = (evIt?.hora || evIt?.horaInicio || '') as string;
      let hf = (evIt?.horaTermino || evIt?.hora_termino || '') as string;
      let fch = (evIt?.fecha || '') as string;
      if ((!hf || !hi || !fch) && evIt?.eventoId) {
        const sbUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
        if (sbUrl && anon) {
          const r = await fetch(`${sbUrl}/rest/v1/eventos?id=eq.${encodeURIComponent(String(evIt.eventoId))}&select=hora,hora_termino,fecha`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
          if (r.ok) { const rows = await r.json(); if (rows?.[0]) { if (!hi && rows[0].hora) hi = rows[0].hora; if (!hf && rows[0].hora_termino) hf = rows[0].hora_termino; if (!fch && rows[0].fecha) fch = rows[0].fecha; } }
        }
      }
      if (hi) mailCfg.eventoHoraIni = hi;
      if (hf) mailCfg.eventoHoraFin = hf;
      if (fch) mailCfg.eventoFecha = fch;
    } catch (_) { /* usa el default de config */ }
    // ── Incentivo · APAGADO por defecto ────────────────────────────────
    // El interruptor maestro manda: si `incentivos_on` es false, no se
    // consulta nada. A quien ya tiene cuenta no se le invita a crearla.
    if (mailCfg.incentivosOn) {
      try {
        const SB_URL = Deno.env.get('SUPABASE_URL'); const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY');
        const esCort = Number(order.total || 0) === 0;
        const destino = esCort ? 'cortesia' : 'compra';
        const ri = await fetch(
          `${SB_URL}/rest/v1/incentivos?activo=eq.true&aplica_a=in.(${destino},ambos)&select=titulo,texto,boton,valor&order=orden&limit=1`,
          { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
        const inc = ri.ok ? (await ri.json())[0] : null;
        let yaEsSocio = false;
        if (inc && order.comprador?.email) {
          const rc = await fetch(
            `${SB_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(String(order.comprador.email).trim().toLowerCase())}&select=id&limit=1`,
            { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
          if (rc.ok) yaEsSocio = ((await rc.json()) || []).length > 0;
        }
        if (inc && !yaEsSocio) mailCfg.incentivo = inc;
      } catch (_) { /* el correo sale igual, sin el bloque */ }
    }
    const html = buildReceiptHtml(order, entries, mailCfg);

    // Vista previa: devuelve el HTML sin enviar (para el editor de Config)
    if (isPreview) return new Response(JSON.stringify({ ok: true, html, entries: entries.length }), { headers: corsHeaders });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY no configurada');
    const esCort = Number(order.total || 0) === 0;
    const payload: any = {
      from:    FROM,
      to:      [order.comprador.email],
      // La fecha va en el ASUNTO: es lo que se lee sin abrir nada, y si alguien
      // compró para dos noches distintas los correos dejan de ser idénticos.
      subject: (() => {
        const base = (esCort ? mailCfg.subjectCortesia : mailCfg.subjectCompra) || `🎟️ Tus entradas — ${order.id}`;
        const fc = mailCfg.eventoFecha ? fechaCorta(String(mailCfg.eventoFecha)) : '';
        if (!fc) return base;
        if (base.includes('{fecha}')) return base.replace(/\{fecha\}/g, fc);
        return `${base} · ${fc}`;
      })(),
      html,
    };
    // BCC configurable desde el admin (config_valores: admin_bcc_on / admin_bcc_email), con fallback al env ADMIN_BCC_EMAIL.
    let bccEmail = ADMIN_BCC, bccOn = false;   // OFF por defecto: manda el toggle del admin (config_valores.admin_bcc_on). Así "desactivado" SIEMPRE gana, aunque exista la env ADMIN_BCC_EMAIL.
    try {
      const sbUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
      if (sbUrl && anon) {
        const r = await fetch(`${sbUrl}/rest/v1/config_valores?clave=in.(admin_bcc_on,admin_bcc_email)&select=clave,valor`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
        if (r.ok) {
          const rows = await r.json();
          const m = new Map((rows || []).map((x: any) => [x.clave, x.valor]));
          if (m.has('admin_bcc_on')) bccOn = (m.get('admin_bcc_on') === '1' || m.get('admin_bcc_on') === 'true');
          const cfgEmail = m.get('admin_bcc_email');
          if (cfgEmail) bccEmail = String(cfgEmail).trim();
        }
      }
    } catch (_) { /* usa el fallback del env */ }
    if (bccOn && bccEmail) payload.bcc = [bccEmail];

    // Si Resend pide bajar el ritmo (429: se comparte el límite con las campañas),
    // se reintenta hasta 3 veces antes de rendirse: un QR no se puede perder.
    let res: Response = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    for (let intento = 1; res.status === 429 && intento <= 3; intento++) {
      await new Promise(r => setTimeout(r, 1000 * intento));
      res = await fetch(RESEND_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error Resend');

    return new Response(JSON.stringify({ ok: true, id: data.id, entries: entries.length }), { headers: corsHeaders });
  } catch (err) {
    console.error('[send-receipt]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

// ── Tipos ─────────────────────────────────────────────────────
interface Persona { nombre?: string; rut?: string; email?: string; }
interface CartItem {
  tipo:       string;
  nombre:     string;
  precio:     number;
  cantidad:   number;
  fecha?:     string;
  hora?:      string;
  horaTermino?: string;
  ambiente?:  string;
  detalle?:   string;
  productoId?: string;
  ttId?:      string | number;
  eventoId?:  string | number;
  personas?:  Persona[];
  qr_ids?:    string[];
  _qrOverride?: string;
}
interface Order {
  id:        string;
  items:     CartItem[];
  comprador: { nombre: string; email: string; rut?: string; tel?: string };
  total:     number;
  fecha:     string;
}
interface Entry {
  qrId:     string;
  icon:     string;
  titulo:   string;
  subtit:   string;
  tipo:     string;
  color:    string;
  precio:   number;
  persona?: Persona | null;
  esTicket?: boolean;      // true = entrada de evento (muestra validez + horario + condiciones)
  horaValidez?: string;    // hora máx de ingreso de ESTE tipo de ticket (explícita)
  validezDesc?: string;    // descripción corta del tipo (opcional)
  instrucciones?: string;  // condiciones POR TIPO de entrada (plantilla)
  ticketLabel?: string;    // nombre de la lista/tipo (ej: "LISTA VIP FUEGO")
  zona?: string;           // posición/zona (VIP, palco…) si no es "general"
  noTransferible?: boolean;// true = nominativa, el RUT debe calzar
  restricciones?: string;  // ej: "Exclusivo mujeres"
  genero?: string;         // público del ticket: F=Mujer, M=Hombre, U=Universitario
}
// Solo la HORA de validez (máx de ingreso) de un ticket, en texto explícito.
function fmtHoraValidez(hm?: string | null): string {
  const h = (hm || '').trim();
  if (!h) return '';
  return h.charAt(0) === '-' ? `ingreso hasta ${h.slice(1)} min antes del cierre` : `ingreso hasta las ${h} hrs`;
}

// ── Expande la orden en entradas individuales ─────────────────
// Soporta opcionalmente item._qrOverride: si está definido, usa ESE qrId en
// vez del computado. Útil para el importador masivo cuando envía 1 email
// individual por invitado con SOLO su QR personal (no los del grupo entero).
export function buildEntries(order: Order, ttMap: Record<string, any> = {}): Entry[] {
  const entries: Entry[] = [];
  for (const item of order.items as any[]) {
    if (item.tipo === 'carta' || item.tipo === 'merch' || item.tipo === 'addon') {
      for (let u = 0; u < item.cantidad; u++) {
        // Prioridad: override (email individual) → código guardado en BD → fallback computado
        const uid = item._qrOverride || item.qr_ids?.[u] || `${order.id}-${item.productoId || item.tipo}-${u}`;
        entries.push({
          qrId:   uid,
          icon:   item.tipo === 'carta' ? '🍹' : item.tipo === 'addon' ? '✨' : '🛍️',
          titulo: item.nombre,
          subtit: item.tipo === 'carta' ? 'Pre-compra en barra' : (item.detalle || (item.tipo === 'addon' ? 'Extra · muestra este código' : '')),
          tipo:   item.tipo === 'carta' ? 'CARTA' : item.tipo === 'addon' ? 'EXTRA' : 'TIENDITA',
          color:  item.tipo === 'carta' ? '#D4A832' : item.tipo === 'addon' ? '#D4A832' : '#8B1A1E',
          precio: item.precio,
          esTicket: false,
        });
      }
    } else {
      // Ticket de evento — 1 QR por persona
      for (let p = 0; p < item.cantidad; p++) {
        const persona = item.personas?.[p] ?? null;
        // Prioridad: override (email individual) → código guardado en BD → fallback computado
        const uid = item._qrOverride || item.qr_ids?.[p] || `${order.id}-${item.ttId || item.tipo}-${p}`;
        // Validez POR TICKET: cortesía trae su snapshot en item.condiciones; compra la saca del tipo de ticket.
        const cond: any = item.condiciones || {};
        const tt: any = (item.ttId != null && ttMap[String(item.ttId)]) || {};
        const horaMax = cond.hora_max_llegada || tt.hora_max_ingreso || null;
        // Condiciones POR TIPO: cortesía las trae en condiciones.instrucciones o condiciones.texto
        // (las listas guardan el detalle en "texto"); compra las saca del tipo de ticket.
        const instr = cond.instrucciones || cond.texto || tt.instrucciones || tt.descripcion || item.detalle || null;
        const zonaRaw = (cond.zona || '').toString().trim();
        const zona = (zonaRaw && zonaRaw.toLowerCase() !== 'general') ? zonaRaw : undefined;
        entries.push({
          esTicket: true,
          instrucciones: instr,
          ticketLabel: etiquetaPublica(cond.titulo || item.nombre_ticket || (item.ttId != null ? tt.nombre : null)) || undefined,
          genero: (cond.genero || tt.genero || '').toString().trim() || undefined,
          zona,
          noTransferible: cond.transferible === false,
          restricciones: (cond.restricciones || '').toString().trim() || undefined,
          horaValidez: fmtHoraValidez(horaMax),
          qrId:    uid,
          icon:    '🎟️',
          titulo:  item.nombre,
          subtit:  item.fecha ? `${fechaBonita(item.fecha)}${item.hora ? ' · ' + item.hora + ' hrs' : ''}` : '',
          tipo:    String(item.tipo || 'TICKET'),
          color:   '#E8363D',
          precio:  item.precio,
          persona,
        });
      }
    }
  }
  return entries;
}

// ── HTML del comprobante ──────────────────────────────────────
// Config editable del correo (config_valores mail_*). Con defaults si falta.
// deno-lint-ignore no-explicit-any
async function getMailCfg(): Promise<any> {
  const def = {
    color: '#E8363D', logo: '', footer: '© 2026 Frate · Bellavista, Santiago de Chile', wsp: '56981311548', eventoHoraIni: '23:00', eventoHoraFin: '05:00',
    instrCompra: '• Muestra el QR individual de cada producto en la entrada del local\n• Cada QR es de uso único — no compartas capturas de pantalla\n• Solo válido para mayores de 18 años · No conducir tras consumir alcohol',
    instrCortesia: '• Presenta el QR en la puerta — es NOMINATIVO: debe calzar con tu carnet\n• Uso único — no compartas capturas de pantalla\n• Solo válido para mayores de 18 años · No conducir tras consumir alcohol',
    subjectCompra: '', subjectCortesia: '',
  };
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!sbUrl || !anon) return def;
    const r = await fetch(`${sbUrl}/rest/v1/config_valores?clave=in.(mail_color,mail_logo_url,mail_footer,mail_wsp,mail_instr_compra,mail_instr_cortesia,mail_evento_hora_ini,mail_evento_hora_fin,mail_subject_compra,mail_subject_cortesia,mail_intro,mail_legal,mail_bg,mail_qr_size,mail_show_validez,mail_show_horario,mail_show_chips,mail_show_cond,mail_btn_wsp,mail_mapa_url,mail_ig_url,incentivos_on)&select=clave,valor`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    if (!r.ok) return def;
    const m = new Map(((await r.json()) || []).map((x: any) => [x.clave, x.valor]));
    const onOff = (k: string) => m.get(k) == null ? true : m.get(k) === '1';   // ausente = activado
    return {
      color: m.get('mail_color') || def.color, logo: m.get('mail_logo_url') || '',
      footer: m.get('mail_footer') || def.footer, wsp: m.get('mail_wsp') || def.wsp,
      intro: m.get('mail_intro') || '', legal: m.get('mail_legal') || '',
      incentivosOn: String(m.get('incentivos_on') || '').toLowerCase() === 'true',
      bg: m.get('mail_bg') || '#0A0A0B', qrSize: Math.max(160, Math.min(320, parseInt(String(m.get('mail_qr_size') ?? '260'), 10) || 260)),
      showValidez: onOff('mail_show_validez'), showHorario: onOff('mail_show_horario'),
      showChips: onOff('mail_show_chips'), showCond: onOff('mail_show_cond'),
      btnWsp: onOff('mail_btn_wsp'), mapaUrl: m.get('mail_mapa_url') || '', igUrl: m.get('mail_ig_url') || '',
      instrCompra: m.get('mail_instr_compra') || def.instrCompra,
      instrCortesia: m.get('mail_instr_cortesia') || def.instrCortesia,
      subjectCompra: m.get('mail_subject_compra') || '',
      subjectCortesia: m.get('mail_subject_cortesia') || '',
      eventoHoraIni: m.get('mail_evento_hora_ini') || def.eventoHoraIni,
      eventoHoraFin: m.get('mail_evento_hora_fin') || def.eventoHoraFin,
    };
  } catch (_e) { return def; }
}
// "2026-07-09" → "Jueves 9 de julio" (ancla mediodía UTC para no correr el día; se formatea en horario de Chile)
function fechaBonita(f: string): string {
  try {
    const d = new Date(String(f) + 'T12:00:00Z');
    const s = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch (_) { return String(f || ''); }
}
// "2026-08-07" → "VIE 7 AGO" — para el asunto, que se lee de reojo en la bandeja.
function fechaCorta(f: string): string {
  try {
    const d = new Date(String(f) + 'T12:00:00Z');
    const dia = d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'America/Santiago' }).replace('.', '');
    const n   = d.toLocaleDateString('es-CL', { day: 'numeric', timeZone: 'America/Santiago' });
    const mes = d.toLocaleDateString('es-CL', { month: 'short', timeZone: 'America/Santiago' }).replace('.', '');
    return `${dia} ${n} ${mes}`.toUpperCase();
  } catch (_) { return ''; }
}
// Cuántos días faltan. Una fecha se entiende; «faltan 6 días» no hay que pensarlo.
function faltanDias(f: string): string {
  try {
    const d = new Date(String(f) + 'T12:00:00Z');
    const hoy = new Date(); hoy.setUTCHours(12, 0, 0, 0);
    const n = Math.round((d.getTime() - hoy.getTime()) / 86400000);
    if (n < 0)  return '';
    if (n === 0) return 'ES HOY';
    if (n === 1) return 'ES MAÑANA';
    return `faltan ${n} días`;
  } catch (_) { return ''; }
}

// deno-lint-ignore no-explicit-any
export function buildReceiptHtml(order: Order, entries: Entry[], cfg: any = {}): string {
  const AC = cfg.color || '#E8363D';
  const fee      = Math.round(order.total * 0.04);
  const totalCon = order.total + fee;
  const fechaStr = new Date(order.fecha).toLocaleString('es-CL', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Santiago'
  });
  // Evento (banda de fecha + ventana + validez). Toma el 1er ítem con fecha/evento (los tickets comparten evento).
  const evItem: any = (order.items || []).find((it: any) => it && (it.fecha || it.eventoId)) || null;
  const evFechaVal = (evItem && evItem.fecha) || cfg.eventoFecha || '';
  const evLabel   = evFechaVal ? fechaBonita(evFechaVal) : '';
  // ⚠️ `evLabel` se calculaba desde siempre y NO se pintaba en ninguna parte del
  //    archivo: por eso el correo nunca decía para qué día era la entrada.
  const cuantoFalta = evFechaVal ? faltanDias(evFechaVal) : '';
  const evHoraIni = cfg.eventoHoraIni || (evItem && evItem.hora) || '23:00';
  const evHoraFin = cfg.eventoHoraFin || '05:00';

  const clp = (n: number) => '$' + n.toLocaleString('es-CL');
  const esCortesia = Number(order.total || 0) === 0;   // cortesía = orden $0

  // Incentivo: lo resuelve el handler (que sí es async) y lo pasa en cfg.
  // Acá solo se pinta. Si viene vacío, el correo sale igual que siempre.
  let incentivoHtml = '';
  if (cfg.incentivo) {
    const inc = cfg.incentivo;
    const nombre = String(order.comprador?.nombre || '').split(' ')[0] || '';
    const rellenar = (t: string) => String(t || '')
      .replace(/\{nombre\}/g, nombre)
      .replace(/\{valor\}/g, clp(inc.valor || 0))
      .replace(/\{evento\}/g, String(cfg.eventoNombre || ''))
      .replace(/\{compras\}/g, String(cfg.comprasPrevias || ''));
    const link = 'https://frate.cl/?crear=' + encodeURIComponent(String(order.comprador?.email || ''));
    incentivoHtml = `
      <tr><td style="padding:8px 36px 22px;">
        <div style="border:1px solid #27272a;border-left:3px solid ${AC};border-radius:10px;padding:18px 20px;background:#0d0d0f;">
          <div style="font-size:14px;font-weight:800;color:${AC};margin-bottom:6px;">🎁 ${rellenar(inc.titulo)}</div>
          <div style="font-size:12px;color:#a1a1aa;line-height:1.7;">${rellenar(inc.texto)}</div>
          <a href="${link}" style="display:inline-block;margin-top:14px;padding:12px 22px;background:${AC};color:#fff;font-weight:800;font-size:12px;border-radius:7px;text-decoration:none;">${String(inc.boton || 'CREAR MI CUENTA')}</a>
          <div style="font-size:10px;color:#52525b;margin-top:9px;">Se abre con tu correo ya puesto. Toma 30 segundos.</div>
        </div>
      </td></tr>`;
  }



  const bigQr  = cfg.qrSize || 260;                       // QR GIGANTE para entradas
  const prodQr = Math.min(160, cfg.qrSize || 160);        // QR mediano para productos (carta/tiendita)
  const cap1 = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const entriesHtml = entries.map(e => {
    const qpx     = e.esTicket ? bigQr : prodQr;
    const pNombre = (e.persona?.nombre || (e.esTicket ? order.comprador?.nombre : '') || '').toString().trim();
    const pRut    = (e.persona?.rut    || (e.esTicket ? order.comprador?.rut    : '') || '').toString().trim();
    const qrImg   = `<img src="${qrUrl(e.qrId)}" width="${qpx}" height="${qpx}" alt="QR" style="display:block;border:6px solid #fff;border-radius:12px;margin:0 auto;max-width:78%;height:auto;" />`;
    const verFull = `<a href="https://www.frate.cl/entrada?t=${encodeURIComponent(e.qrId)}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:${e.color};text-decoration:none;">🔍 Ver en pantalla completa</a>`;
    const precioHtml = (e.precio > 0 && !esCortesia) ? `<div style="font-size:11px;color:#71717a;margin-top:12px;">Valor: <b style="color:#D4A832;">${clp(e.precio)}</b></div>` : '';

    // Producto (carta / tiendita / extra): QR mediano + nombre + precio, sin evento/validez
    if (!e.esTicket) {
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141415;border-radius:12px;border-top:3px solid ${e.color};margin-bottom:16px;">
      <tr><td align="center" style="padding:20px 18px;">
        <div style="display:inline-block;background:${e.color};color:#fff;font-size:13px;font-weight:800;letter-spacing:1px;padding:6px 16px;border-radius:999px;text-transform:uppercase;">${e.tipo}</div>
        <div style="margin:16px auto 2px;">${qrImg}</div>
        ${verFull}
        <div style="font-size:17px;font-weight:700;color:#fff;margin-top:12px;">${e.icon} ${e.titulo}</div>
        ${e.subtit ? `<div style="font-size:12px;color:#71717a;margin-top:3px;">${e.subtit}</div>` : ''}
        ${precioHtml}
        <div style="font-size:9px;color:#27272a;margin-top:10px;word-break:break-all;">${e.qrId}</div>
      </td></tr>
    </table>`;
    }

    // Entrada de evento — jerarquía nueva: TIPO → QR gigante → NOMBRE → RUT → evento → validación
    let validVal = 'Válida toda la noche';
    if (e.horaValidez) validVal = cap1(String(e.horaValidez).replace(/^ingreso\s+/i, ''));

    const chipsHtml = (cfg.showChips === false) ? '' : (() => {
      const chips: string[] = []; const gL: any = { F: '👩 Solo mujeres', M: '👨 Solo hombres', U: '🎓 Solo universitarios' };
      if (e.genero && gL[e.genero]) chips.push(gL[e.genero] + ' — se verifica en la puerta');
      if (e.zona) chips.push('🚪 ' + String(e.zona).toUpperCase());
      if (e.noTransferible) chips.push('🔒 No transferible — tu RUT debe calzar');
      if (e.restricciones) chips.push('⭐ ' + e.restricciones);
      return chips.length ? `<div style="margin-top:12px;">${chips.map((c: string) => `<span style="display:inline-block;font-size:10.5px;color:#a1a1aa;background:#1a1a1c;padding:3px 10px;border-radius:10px;margin:2px 3px;">${c}</span>`).join('')}</div>` : '';
    })();

    const condHtml = (() => {
      const rows: string[] = [];
      if (cfg.showHorario !== false) rows.push(`🕚 <b style="color:#c8c8cf;">Horario del evento:</b> ${evHoraIni} a ${evHoraFin} hrs <span style="color:#52525b;">(termina de madrugada del día siguiente)</span>`);
      if (cfg.showCond !== false) {
        const ct = e.instrucciones || (esCortesia ? cfg.instrCortesia : cfg.instrCompra) || '';
        String(ct).split('\n').map((l: string) => l.trim()).filter(Boolean).forEach((l: string) => rows.push('• ' + l));
      }
      return rows.length ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #232325;text-align:left;">
          <div style="font-size:9px;letter-spacing:1.5px;color:#52525b;text-transform:uppercase;margin-bottom:8px;">Información y condiciones</div>
          <div style="font-size:11px;color:#a1a1aa;line-height:1.65;">${rows.join('<br>')}</div>
        </div>` : '';
    })();

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#141415;border-radius:14px;border-top:4px solid ${e.color};margin-bottom:18px;">
      <tr><td align="center" style="padding:24px 18px 20px;">
        <div style="display:inline-block;background:${e.color};color:#fff;font-size:15px;font-weight:800;letter-spacing:1px;padding:9px 22px;border-radius:999px;text-transform:uppercase;">${e.ticketLabel || e.tipo}</div>
        <div style="margin:18px auto 2px;">${qrImg}</div>
        ${verFull}
        ${pNombre ? `<div style="font-size:22px;font-weight:800;color:#fff;line-height:1.15;margin:16px 0 2px;">${pNombre}</div>` : ''}
        ${pRut ? `<div style="font-size:16px;font-weight:700;color:#e4e4e7;letter-spacing:.3px;">RUT ${pRut}</div>` : ''}
        <div style="margin-top:16px;padding-top:15px;border-top:1px solid #232325;">
          <div style="font-size:16px;color:#fff;font-weight:700;">📅 ${e.titulo}</div>
          ${e.subtit ? `<div style="font-size:13px;color:#a1a1aa;margin-top:2px;">${e.subtit}</div>` : ''}
          ${cfg.showValidez === false ? '' : `<div style="display:inline-block;margin-top:13px;background:#10261a;border:1px solid #1f6b40;border-radius:12px;padding:9px 18px;">
            <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#3ea968;font-weight:700;margin-bottom:2px;">🕐 Ingreso válido</div>
            <div style="font-size:15px;font-weight:800;color:#4ade80;">${validVal}</div>
          </div>`}
        </div>
        ${chipsHtml}
        ${condHtml}
        ${precioHtml}
        <div style="font-size:9px;color:#27272a;margin-top:14px;word-break:break-all;">${e.qrId}</div>
      </td></tr>
    </table>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tus entradas — ${order.id}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;background:${cfg.bg || '#0A0A0B'};border-radius:14px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:${AC};padding:24px 36px;">
        <table width="100%"><tr>
          <td>
            ${cfg.logo ? `<img src="${cfg.logo}" alt="FRATE" height="34" style="display:block;max-height:40px;" />` : `<div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:5px;font-family:'Arial Black',sans-serif;">FRATE</div>`}
            <div style="font-size:9px;color:rgba(255,255,255,0.7);letter-spacing:3px;margin-top:2px;text-transform:uppercase;">${esCortesia ? '🎁 Cortesía' : 'Comprobante de compra'}</div>
          </td>
          <td align="right">
            <div style="background:rgba(0,0,0,0.25);border-radius:2px;padding:8px 14px;display:inline-block;">
              <div style="font-size:9px;color:rgba(255,255,255,0.6);letter-spacing:2px;">ORDEN</div>
              <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;">${order.id}</div>
            </div>
          </td>
        </tr></table>
      </td></tr>

      ${cfg.intro ? `<!-- Bienvenida -->
      <tr><td style="padding:18px 36px 4px;">
        <div style="font-size:13px;color:#e4e4e7;line-height:1.55;">${String(cfg.intro).split('\n').map((l: string) => l.trim()).filter(Boolean).join('<br>')}</div>
      </td></tr>` : ''}

      ${evLabel ? `<!-- LA FECHA: va ANTES de las entradas y el QR no se toca -->
      <tr><td style="padding:18px 22px 2px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#141415;border:1px solid ${AC};border-radius:12px;">
          <tr><td align="center" style="padding:18px 16px 16px;">
            <div style="font-size:10px;letter-spacing:3px;color:#a1a1aa;text-transform:uppercase;margin-bottom:6px;">Tu entrada es para</div>
            <div style="font-size:30px;line-height:1.08;font-weight:900;color:${AC};text-transform:uppercase;font-family:'Arial Black','Helvetica Neue',Arial,sans-serif;">${evLabel}</div>
            ${cfg.eventoNombre ? `<div style="font-size:14px;color:#e4e4e7;font-weight:700;margin-top:6px;">${cfg.eventoNombre}</div>` : ''}
            <div style="font-size:12px;color:#a1a1aa;margin-top:5px;">Entras desde las ${evHoraIni} hrs</div>
            ${cuantoFalta ? `<div style="display:inline-block;margin-top:11px;background:#1c1c1f;border:1px solid #2f2f33;border-radius:999px;padding:5px 15px;font-size:11px;font-weight:700;letter-spacing:1px;color:#e6c860;text-transform:uppercase;">${cuantoFalta}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>` : ''}

      <!-- Entradas (protagonista) -->
      <tr><td style="padding:22px 22px 6px;">
        <div style="font-size:10px;letter-spacing:3px;color:${AC};text-transform:uppercase;margin-bottom:16px;text-align:center;">
          ${entries.length} ${entries.length > 1 ? 'entradas' : 'entrada'} — presenta cada QR en la puerta
        </div>
        ${entriesHtml}
      </td></tr>

      <!-- Resumen (chico) -->
      <tr><td style="padding:2px 22px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0e;border-radius:12px;">
          <tr><td style="padding:15px 18px;">
            <table width="100%"><tr>
              <td style="vertical-align:top;">
                <div style="font-size:9px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:5px;">${esCortesia ? 'Invitad@' : 'Comprador'}</div>
                <div style="font-size:13px;color:#e4e4e7;font-weight:600;">${order.comprador.nombre}</div>
                <div style="font-size:12px;color:#71717a;">${order.comprador.email}</div>
                <div style="font-size:11px;color:#52525b;margin-top:4px;">${esCortesia ? 'Enviada' : 'Comprada'}: ${fechaStr}</div>
              </td>
              <td align="right" style="vertical-align:top;padding-left:12px;white-space:nowrap;">
                <div style="font-size:9px;letter-spacing:2px;color:#52525b;text-transform:uppercase;margin-bottom:4px;">${esCortesia ? 'Valor' : 'Total pagado'}</div>
                <div style="font-size:17px;font-weight:900;color:#D4A832;">${esCortesia ? 'Gratuita 🎁' : clp(totalCon)}</div>
                ${esCortesia ? '' : '<div style="font-size:10px;color:#52525b;">Incluye servicio 4%</div>'}
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Contacto -->
      <tr><td style="background:#0d0d0e;padding:16px 24px;text-align:center;">
        <div style="font-size:11px;color:#71717a;line-height:1.7;">
          Cada QR es de uso único — no compartas capturas. ¿Dudas? Escríbenos por
          <a href="https://wa.me/${cfg.wsp || '56981311548'}" style="color:${AC};text-decoration:none;font-weight:700;">WhatsApp</a>
          o a <a href="mailto:hola@frate.cl" style="color:${AC};text-decoration:none;font-weight:700;">hola@frate.cl</a>.
        </div>
      </td></tr>

      ${((cfg.btnWsp && cfg.wsp) || cfg.mapaUrl || cfg.igUrl) ? `<!-- Botones -->
      <tr><td style="padding:16px 36px 6px;text-align:center;">
        ${cfg.btnWsp && cfg.wsp ? `<a href="https://wa.me/${cfg.wsp}" style="display:inline-block;margin:4px;padding:11px 20px;background:#25D366;color:#062e16;font-weight:700;font-size:12px;border-radius:6px;text-decoration:none;">💬 WhatsApp</a>` : ''}
        ${cfg.mapaUrl ? `<a href="${cfg.mapaUrl}" style="display:inline-block;margin:4px;padding:11px 20px;background:#1a1a1c;color:#fff;font-weight:700;font-size:12px;border-radius:6px;text-decoration:none;border:1px solid #27272a;">🗺️ Cómo llegar</a>` : ''}
        ${cfg.igUrl ? `<a href="${cfg.igUrl}" style="display:inline-block;margin:4px;padding:11px 20px;background:#1a1a1c;color:#fff;font-weight:700;font-size:12px;border-radius:6px;text-decoration:none;border:1px solid #27272a;">📸 Instagram</a>` : ''}
      </td></tr>` : ''}

      ${incentivoHtml}

      <!-- Footer -->
      <tr><td style="background:#060607;padding:16px 36px;text-align:center;">
        <p style="font-size:10px;color:#3f3f46;margin:0;line-height:1.8;">
          ${cfg.footer || ('© ' + new Date().getFullYear() + ' Frate · Bellavista, Santiago de Chile')}<br>
          <a href="${SITE_URL}" style="color:${AC};text-decoration:none;">frate.cl</a>
        </p>
        ${cfg.legal ? `<div style="font-size:9px;color:#2a2a2e;margin-top:10px;line-height:1.6;">${String(cfg.legal).split('\n').map((l: string) => l.trim()).filter(Boolean).join('<br>')}</div>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
