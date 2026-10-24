// ============================================================
// FRATE — Aviso urgente al staff (WhatsApp + correo).
// Best-effort: NUNCA lanza ni bloquea el flujo que lo llama
// (un webhook de pago no puede caerse porque falle un aviso).
// Secrets: RESEND_API_KEY, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN.
// ============================================================

const FROM = 'Frate Tickets <tickets@frate.cl>';

export async function avisarStaff(sb: any, opts: { titulo: string; detalle: string; html?: string }) {
  const { titulo, detalle } = opts;

  // ── WhatsApp (config_valores.devoluciones_wsp = número del staff) ──
  try {
    const { data } = await sb.from('config_valores').select('valor').eq('clave', 'devoluciones_wsp').maybeSingle();
    let num = String(data?.valor || '').replace(/\D/g, '');
    if (num.length === 9 && num[0] === '9') num = '56' + num;
    if (num.length === 8) num = '569' + num;
    const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID'), TOKEN = Deno.env.get('WHATSAPP_TOKEN');
    if (num && PHONE_ID && TOKEN) {
      await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body: `${titulo}\n${detalle}` } }),
      });
    }
  } catch (e) { console.error('[avisar] wsp:', e); }

  // ── Correo al equipo (config_valores.admin_bcc_email) ──
  try {
    const { data } = await sb.from('config_valores').select('valor').eq('clave', 'admin_bcc_email').maybeSingle();
    const to = String(data?.valor || '').trim();
    const KEY = Deno.env.get('RESEND_API_KEY');
    if (to && KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: [to], subject: titulo,
          html: opts.html || `<h2>${titulo}</h2><p style="font-size:16px">${detalle.replace(/\n/g, '<br>')}</p>`,
        }),
      });
    }
  } catch (e) { console.error('[avisar] mail:', e); }
}
