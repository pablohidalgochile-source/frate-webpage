// ============================================================
// FRATE — resend-webhook: escucha los eventos de Resend y deja registro
// de los correos que REBOTARON (o fueron marcados como spam).
//
// Sirve para cazar al cliente que puso mal su correo y nunca recibió el QR:
// queda marcado en el panel para perseguirlo por WhatsApp.
//
// Configurar en Resend → Webhooks → https://<proyecto>.supabase.co/functions/v1/resend-webhook
// Eventos: email.bounced, email.complained, email.delivered_delayed
// verify_jwt=false (lo llama Resend, no un usuario).
// Secret opcional: RESEND_WEBHOOK_SECRET (si está, se exige la firma).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
const ok = () => new Response(JSON.stringify({ ok: true }), { headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const raw = await req.text();

    // Firma (Svix, el proveedor que usa Resend). Si hay secreto, es obligatoria.
    const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (secret) {
      const id = req.headers.get('svix-id') || '';
      const ts = req.headers.get('svix-timestamp') || '';
      const sigs = (req.headers.get('svix-signature') || '').split(' ').map(s => s.split(',').pop());
      try {
        const key = await crypto.subtle.importKey('raw',
          Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0)),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
        const esperado = btoa(String.fromCharCode(...new Uint8Array(mac)));
        // 401 y NO 200: si respondiéramos ok, un secreto mal puesto sería
        // invisible — Resend creería que todo llegó bien y nosotros no
        // registraríamos nada. Es exactamente el silencio que nos tuvo
        // meses creyendo que ningún correo rebotaba. Con 401, Resend lo
        // muestra como entrega fallida en su panel y se ve.
        if (!sigs.includes(esperado)) {
          console.error('[resend-webhook] firma inválida');
          return new Response(JSON.stringify({ error: 'firma inválida' }), { status: 401, headers: cors });
        }
      } catch (e) {
        console.error('[resend-webhook] firma:', e);
        return new Response(JSON.stringify({ error: 'firma ilegible' }), { status: 401, headers: cors });
      }
    }

    const evt = JSON.parse(raw || '{}');
    const tipo = String(evt?.type || '');
    const d = evt?.data || {};
    const destinos: string[] = Array.isArray(d.to) ? d.to : (d.to ? [String(d.to)] : []);
    if (!destinos.length) return ok();

    // Solo interesan los que NO llegaron
    const malos: Record<string, string> = {
      'email.bounced': 'rebotó',
      'email.complained': 'marcado como spam',
      'email.delivery_delayed': 'demorado',
    };
    if (!malos[tipo]) return ok();

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const motivo = String(d?.bounce?.message || d?.reason || malos[tipo]).slice(0, 300);
    const asunto = String(d?.subject || '').slice(0, 200);

    for (const em of destinos) {
      const email = String(em).trim().toLowerCase();
      if (!email) continue;
      try {
        const { data: prev } = await sb.from('email_rebotes').select('veces').eq('email', email).maybeSingle();
        await sb.from('email_rebotes').upsert({
          email, tipo, motivo, asunto,
          veces: (prev?.veces || 0) + 1,
          ultimo_at: new Date().toISOString(),
        }, { onConflict: 'email' });
      } catch (e) { console.error('[resend-webhook] upsert:', e); }
    }
    return ok();
  } catch (e) {
    console.error('[resend-webhook]', e);
    return ok();   // nunca devolver error: Resend reintentaría en loop
  }
});
