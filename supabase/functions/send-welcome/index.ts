// ============================================================
// FRATE — Edge Function: send-welcome
// Envía email de bienvenida cuando un nuevo usuario se registra.
// Deploy: Supabase Dashboard → Edge Functions → New function
// Env secret requerido: RESEND_API_KEY
// ============================================================

const RESEND_API = 'https://api.resend.com/emails';
const FROM       = 'Frate <hola@frate.cl>';  // dominio verificado en Resend
const SITE_URL   = 'https://frate.cl';

Deno.serve(async (req: Request) => {
  // Solo POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // CORS — llamado desde frate.cl
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const { nombre, apellidos, username, email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email requerido' }), { status: 400, headers });

    const displayName = username ? `@${username}` : `${nombre || ''} ${apellidos || ''}`.trim() || 'nuevo socio';
    const primerNombre = nombre || displayName;

    const html = buildWelcomeHtml({ displayName, primerNombre, username, email });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY no configurada');

    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [email],
        subject: `¡Bienvenido a Frate, ${primerNombre}! 🔥`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error Resend');

    return new Response(JSON.stringify({ ok: true, id: data.id }), { headers });
  } catch (err) {
    console.error('[send-welcome]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
  }
});

// ── HTML del email de bienvenida ──────────────────────────────
function buildWelcomeHtml({ displayName, primerNombre, username, email }: {
  displayName: string; primerNombre: string; username: string; email: string;
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bienvenido a Frate</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#0A0A0B;border-radius:4px;overflow:hidden;">

      <!-- Header rojo -->
      <tr><td style="background:#E8363D;padding:28px 36px;text-align:center;">
        <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:6px;font-family:'Arial Black',sans-serif;">
          FRATE
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:4px;margin-top:4px;text-transform:uppercase;">
          Fraternidad Campus Central
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:36px;">
        <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 8px;">
          ¡Hola, ${primerNombre}! 🔥
        </p>
        <p style="font-size:14px;color:#a1a1aa;margin:0 0 24px;line-height:1.6;">
          Ya eres parte de la familia Frate. Tu cuenta está activa y puedes comprar entradas,
          hacer reservas y acceder a todos los beneficios de la comunidad.
        </p>

        <!-- Info cuenta -->
        <table width="100%" style="background:#141415;border-radius:4px;margin-bottom:24px;">
          <tr><td style="padding:20px;">
            <div style="font-size:10px;letter-spacing:3px;color:#E8363D;text-transform:uppercase;margin-bottom:12px;">
              Tu cuenta
            </div>
            ${username ? `
            <div style="margin-bottom:8px;">
              <span style="font-size:11px;color:#71717a;letter-spacing:1px;text-transform:uppercase;">Usuario</span><br>
              <span style="font-size:16px;font-weight:700;color:#D4A832;">@${username}</span>
            </div>` : ''}
            <div>
              <span style="font-size:11px;color:#71717a;letter-spacing:1px;text-transform:uppercase;">Email</span><br>
              <span style="font-size:14px;color:#e4e4e7;">${email}</span>
            </div>
          </td></tr>
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${SITE_URL}" style="display:inline-block;background:#E8363D;color:#fff;text-decoration:none;padding:14px 40px;font-weight:900;letter-spacing:3px;font-size:13px;text-transform:uppercase;border-radius:2px;">
            VER PRÓXIMOS EVENTOS →
          </a>
        </div>

        <p style="font-size:12px;color:#52525b;text-align:center;line-height:1.6;margin:0;">
          Solo válido para mayores de 18 años · Bebe con responsabilidad<br>
          <a href="${SITE_URL}" style="color:#E8363D;text-decoration:none;">frate.cl</a>
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#060607;padding:20px 36px;text-align:center;">
        <p style="font-size:11px;color:#3f3f46;margin:0;">
          © ${new Date().getFullYear()} Frate · Bellavista, Santiago de Chile<br>
          Recibiste este email porque creaste una cuenta en frate.cl
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
