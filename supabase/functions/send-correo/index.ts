// ============================================================
// FRATE — Edge Function: send-correo
// Correo genérico (branded) para RESPONDER solicitudes desde el admin
// (cumpleaños / reservas / frecuente). No lleva QR — es un mensaje.
//
// Autorización REAL dentro de la función: valida que el JWT sea de un
// usuario staff (admin/rrpp/portero). NO basta verify_jwt, porque la anon
// key pública también es un JWT válido → sería un relay de correo abierto.
// Env secret: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { to, texto, asunto?, nombre? }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const RESEND_API = 'https://api.resend.com/emails';
const FROM       = 'Frate <hola@frate.cl>';   // dominio verificado en Resend
const WA_NUM     = '56981311548';

Deno.serve(async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers });

  try {
    // ── Autorización: solo staff logueado (bloquea el uso con la anon key pública) ──
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: u } = await admin.auth.getUser(token);
    const uid = u?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers });
    const { data: cli } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    if (!cli || !['admin', 'rrpp', 'portero'].includes(String(cli.rol))) return new Response(JSON.stringify({ error: 'Solo staff puede enviar correos' }), { status: 403, headers });

    const { to, texto, asunto, nombre } = await req.json() as { to?: string; texto?: string; asunto?: string; nombre?: string };
    const email = String(to || '').trim().toLowerCase();
    const cuerpo = String(texto || '').trim();
    if (!email || !/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i.test(email)) return new Response(JSON.stringify({ error: 'Correo destinatario inválido' }), { status: 400, headers });
    if (!cuerpo) return new Response(JSON.stringify({ error: 'Falta el texto del mensaje' }), { status: 400, headers });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 409, headers });

    const html = buildHtml(cuerpo, nombre || '');
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: 'hola@frate.cl',
        subject: (asunto && asunto.trim()) || 'FRATE',
        html,
        text: cuerpo,
      }),
    });
    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: data?.message || 'Error Resend' }), { status: 502, headers });
    return new Response(JSON.stringify({ ok: true, id: data.id }), { headers });
  } catch (err) {
    console.error('[send-correo]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers });
  }
});

function esc(s: string) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildHtml(texto: string, nombre: string) {
  const saludo = nombre ? `Hola ${esc(nombre)},` : 'Hola,';
  const cuerpo = esc(texto).replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#0f0f12;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:0 0 24px;">
    <div style="background:#e11d2a;padding:22px 26px;border-radius:0 0 14px 14px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:2px;color:#fff;">FRATE</div>
    </div>
    <div style="background:#17171c;margin:14px;border-radius:14px;padding:22px 24px;color:#e8e8ea;">
      <p style="margin:0 0 12px;font-size:15px;color:#fff;">${saludo}</p>
      <div style="font-size:15px;line-height:1.6;color:#d5d5d9;">${cuerpo}</div>
      <div style="margin-top:22px;padding-top:16px;border-top:1px solid #2a2a30;font-size:13px;color:#9a9aa2;">
        Cualquier cosa nos escribes por WhatsApp al
        <a href="https://wa.me/${WA_NUM}" style="color:#3dff88;text-decoration:none;font-weight:700;">+56 9 8131 1548</a>
        o respondes este correo. 🖤<br>
        <span style="color:#6f6f77;">Equipo FRATE · frate.cl</span>
      </div>
    </div>
  </div></body></html>`;
}
