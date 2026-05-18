// ============================================================
// FRATE — Edge Function: send-receipt
// Envía comprobante de compra con 1 QR real por cada producto.
// Deploy: Supabase Dashboard → Edge Functions → New function
// Env secret requerido: RESEND_API_KEY
// ============================================================

const RESEND_API = 'https://api.resend.com/emails';
const FROM       = 'Frate Tickets <tickets@frate.cl>';
const SITE_URL   = 'https://frate.cl';

// QR como imagen real via api.qrserver.com (gratuito, sin límite)
const qrUrl = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=160x160&format=png&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=0a0a0b&margin=8`;

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 });

  try {
    const { order } = await req.json() as { order: Order };
    if (!order?.comprador?.email) {
      return new Response(JSON.stringify({ error: 'order.comprador.email requerido' }), { status: 400, headers: corsHeaders });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY no configurada');

    // Expandir items en entradas individuales
    const entries = buildEntries(order);

    const html = buildReceiptHtml(order, entries);

    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [order.comprador.email],
        subject: `🎟️ Tus entradas — ${order.id}`,
        html,
      }),
    });

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
  ambiente?:  string;
  detalle?:   string;
  productoId?: string;
  ttId?:      string | number;
  eventoId?:  string | number;
  personas?:  Persona[];
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
}

// ── Expande la orden en entradas individuales ─────────────────
function buildEntries(order: Order): Entry[] {
  const entries: Entry[] = [];
  for (const item of order.items) {
    if (item.tipo === 'carta' || item.tipo === 'merch') {
      for (let u = 0; u < item.cantidad; u++) {
        const uid = `${order.id}-${item.productoId || item.tipo}-${u}`;
        entries.push({
          qrId:   uid,
          icon:   item.tipo === 'carta' ? '🍹' : '🛍️',
          titulo: item.nombre,
          subtit: item.tipo === 'carta' ? 'Pre-compra en barra' : (item.detalle || ''),
          tipo:   item.tipo === 'carta' ? 'CARTA' : 'TIENDITA',
          color:  item.tipo === 'carta' ? '#D4A832' : '#8B1A1E',
          precio: item.precio,
        });
      }
    } else {
      // Ticket de evento — 1 QR por persona
      for (let p = 0; p < item.cantidad; p++) {
        const persona = item.personas?.[p] ?? null;
        const uid = `${order.id}-${item.ttId || item.tipo}-${p}`;
        entries.push({
          qrId:    uid,
          icon:    '🎟️',
          titulo:  item.nombre,
          subtit:  item.fecha ? `${item.fecha}${item.hora ? ' · ' + item.hora + ' hrs' : ''}` : '',
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
function buildReceiptHtml(order: Order, entries: Entry[]): string {
  const fee      = Math.round(order.total * 0.04);
  const totalCon = order.total + fee;
  const fechaStr = new Date(order.fecha).toLocaleString('es-CL', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  });

  const clp = (n: number) => '$' + n.toLocaleString('es-CL');

  const entriesHtml = entries.map(e => `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#141415;border-radius:4px;border-left:3px solid ${e.color};margin-bottom:12px;overflow:hidden;">
      <tr>
        <!-- QR -->
        <td width="120" style="padding:16px;vertical-align:top;text-align:center;">
          <img src="${qrUrl(e.qrId)}" width="100" height="100" alt="QR"
               style="display:block;border:2px solid #fff;border-radius:2px;" />
        </td>
        <!-- Info -->
        <td style="padding:16px 16px 16px 0;vertical-align:top;">
          <div style="font-size:9px;letter-spacing:2px;color:${e.color};text-transform:uppercase;margin-bottom:4px;">${e.tipo}</div>
          <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:4px;">${e.icon} ${e.titulo}</div>
          ${e.subtit ? `<div style="font-size:12px;color:#71717a;margin-bottom:6px;">${e.subtit}</div>` : ''}
          ${e.persona?.nombre ? `
            <div style="font-size:12px;color:#e4e4e7;">👤 ${e.persona.nombre}</div>
            ${e.persona.rut ? `<div style="font-size:11px;color:#71717a;">RUT: ${e.persona.rut}</div>` : ''}
          ` : ''}
          <div style="font-size:14px;font-weight:700;color:#D4A832;margin-top:8px;">${clp(e.precio)}</div>
          <div style="font-size:9px;color:#27272a;margin-top:4px;word-break:break-all;">${e.qrId}</div>
        </td>
      </tr>
    </table>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tus entradas — ${order.id}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#0A0A0B;border-radius:4px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#E8363D;padding:24px 36px;">
        <table width="100%"><tr>
          <td>
            <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:5px;font-family:'Arial Black',sans-serif;">FRATE</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.7);letter-spacing:3px;margin-top:2px;text-transform:uppercase;">Comprobante de compra</div>
          </td>
          <td align="right">
            <div style="background:rgba(0,0,0,0.25);border-radius:2px;padding:8px 14px;display:inline-block;">
              <div style="font-size:9px;color:rgba(255,255,255,0.6);letter-spacing:2px;">ORDEN</div>
              <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;">${order.id}</div>
            </div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Resumen orden -->
      <tr><td style="padding:24px 36px;border-bottom:1px solid #1a1a1c;">
        <table width="100%">
          <tr>
            <td width="50%" style="vertical-align:top;padding-right:12px;">
              <div style="font-size:9px;letter-spacing:2px;color:#71717a;text-transform:uppercase;margin-bottom:4px;">Comprador</div>
              <div style="font-size:14px;color:#fff;font-weight:600;">${order.comprador.nombre}</div>
              <div style="font-size:12px;color:#71717a;">${order.comprador.email}</div>
            </td>
            <td width="50%" style="vertical-align:top;">
              <div style="font-size:9px;letter-spacing:2px;color:#71717a;text-transform:uppercase;margin-bottom:4px;">Fecha de compra</div>
              <div style="font-size:13px;color:#e4e4e7;">${fechaStr}</div>
              <div style="font-size:9px;letter-spacing:2px;color:#71717a;text-transform:uppercase;margin:10px 0 4px;">Total pagado</div>
              <div style="font-size:18px;font-weight:900;color:#D4A832;">${clp(totalCon)}</div>
              <div style="font-size:10px;color:#52525b;">Incluye cargo de servicio 4%</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Entradas -->
      <tr><td style="padding:24px 36px;">
        <div style="font-size:9px;letter-spacing:3px;color:#E8363D;text-transform:uppercase;margin-bottom:16px;">
          ${entries.length} producto${entries.length > 1 ? 's' : ''} — presenta el QR de cada uno en la entrada
        </div>
        ${entriesHtml}
      </td></tr>

      <!-- Instrucciones -->
      <tr><td style="background:#141415;padding:20px 36px;">
        <div style="font-size:11px;color:#71717a;line-height:1.8;">
          <strong style="color:#e4e4e7;">Instrucciones:</strong><br>
          • Muestra el QR individual de cada producto en la entrada del local<br>
          • Cada QR es de uso único — no compartas capturas de pantalla<br>
          • Solo válido para mayores de 18 años · No conducir tras consumir alcohol<br>
          • Ante dudas escríbenos vía <a href="https://wa.me/56912345678" style="color:#E8363D;text-decoration:none;">WhatsApp</a>
            o a <a href="mailto:hola@frate.cl" style="color:#E8363D;text-decoration:none;">hola@frate.cl</a>
        </div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#060607;padding:16px 36px;text-align:center;">
        <p style="font-size:10px;color:#3f3f46;margin:0;line-height:1.8;">
          © ${new Date().getFullYear()} Frate · Bellavista, Santiago de Chile<br>
          <a href="${SITE_URL}" style="color:#E8363D;text-decoration:none;">frate.cl</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
