// ============================================================
// FRATE — Edge Function: wsp-enviar
// Envía un mensaje de WhatsApp como FRATE (desde el número business)
// por la Graph API de Meta, y lo guarda en el inbox (wsp_mensajes).
// Lo llama el admin desde el inbox web. Solo staff (admin/portero/rrpp).
//
// Secrets: WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');
    const TOKEN = Deno.env.get('WHATSAPP_TOKEN');
    if (!PHONE_ID) throw new Error('WHATSAPP_PHONE_ID no configurado');
    if (!TOKEN) return new Response(JSON.stringify({ error: 'Falta el token de WhatsApp (WHATSAPP_TOKEN). Configúralo como secreto en Supabase.' }), { status: 409, headers: cors });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Solo staff logueado
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(jwt);
    const uid = u?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: cors });
    const { data: perfil } = await admin.from('clientes').select('rol, username, email').eq('id', uid).maybeSingle();
    if (!perfil || !['admin', 'portero', 'rrpp'].includes(perfil.rol)) {
      return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403, headers: cors });
    }

    const bodyJson = await req.json().catch(() => ({})) as { to?: string; texto?: string; conversacion_id?: string; check?: boolean };

    // ── Modo prueba: valida el token + phone_id contra la API de Meta (sin enviar nada) ──
    if (bodyJson.check) {
      const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}?fields=verified_name,display_phone_number,quality_rating`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const d = await r.json();
      if (!r.ok) return new Response(JSON.stringify({ error: d?.error?.message || 'Token o permisos inválidos', code: d?.error?.code || 0 }), { status: 502, headers: cors });
      return new Response(JSON.stringify({ ok: true, check: true, verified_name: d.verified_name, display_phone_number: d.display_phone_number, quality: d.quality_rating }), { headers: cors });
    }

    const { to, texto, conversacion_id } = bodyJson;
    const num = String(to || '').replace(/[^\d]/g, '');
    const body = String(texto || '').trim();
    if (!num || !body) return new Response(JSON.stringify({ error: 'Falta destinatario o texto' }), { status: 400, headers: cors });

    // Enviar por la Graph API
    const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: num, type: 'text', text: { body } }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[wsp-enviar] Graph:', data?.error);
      // Errores típicos: fuera de la ventana de 24h → hay que usar plantilla.
      const detalle = data?.error?.error_data?.details || data?.error?.message || 'No se pudo enviar';
      return new Response(JSON.stringify({ error: detalle, code: data?.error?.code || 0 }), { status: 502, headers: cors });
    }

    const waId = data?.messages?.[0]?.id || null;

    // Guardar en el inbox (mejor esfuerzo)
    try {
      let convId = conversacion_id || null;
      if (!convId) {
        const { data: conv } = await admin.from('wsp_conversaciones').select('id').eq('telefono', num).maybeSingle();
        convId = conv?.id || null;
        if (!convId) {
          const { data: nueva } = await admin.from('wsp_conversaciones').insert({ telefono: num, canal: 'general', etapa: 'anfitrion' }).select('id').single();
          convId = nueva?.id || null;
        }
      }
      await admin.from('wsp_mensajes').insert({ conversacion_id: convId, telefono: num, rol: 'humano', texto: body, wa_message_id: waId, tipo: 'text', ts: new Date().toISOString() });
      if (convId) await admin.from('wsp_conversaciones').update({ ultimo_mensaje: body, ultimo_mensaje_at: new Date().toISOString(), asignado_a: perfil.username || perfil.email || 'admin', etapa: 'anfitrion', updated_at: new Date().toISOString() }).eq('id', convId);
    } catch (e) { console.error('[wsp-enviar] guardar:', e); }

    return new Response(JSON.stringify({ ok: true, wa_message_id: waId }), { headers: cors });
  } catch (err) {
    console.error('[wsp-enviar]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
