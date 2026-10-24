// ============================================================
// FRATE — Edge Function: whatsapp (WhatsApp Cloud API · Opción B)
// Webhook oficial de Meta para el número business de FRATE.
//   GET  → verificación de Meta (responde hub.challenge)
//   POST → mensajes entrantes: los guarda en wsp_conversaciones
//          + wsp_mensajes. Responde 200 SIEMPRE y rápido.
//
// verify_jwt=false (Meta no manda apikey de Supabase).
// Secrets: WHATSAPP_VERIFY_TOKEN (obligatorio para la verificación),
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          WHATSAPP_APP_SECRET (opcional, para validar la firma).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── GET · verificación del webhook (lo hace Meta al configurar) ──
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  // ── POST · mensajes entrantes ──
  try {
    const raw = await req.text();

    // (Opcional) validar firma X-Hub-Signature-256 si hay App Secret
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (appSecret) {
      const ok = await firmaOk(req.headers.get('x-hub-signature-256') || '', raw, appSecret);
      if (!ok) { console.warn('[whatsapp] firma inválida — se ignora'); return ok200(); }
    }

    const body = JSON.parse(raw || '{}');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // ── ESTADOS DE ENTREGA (Meta avisa enviado → entregado → leído) ──
    // Antes se ignoraban: por eso el inbox nunca mostraba el ✓✓ y no había forma
    // de saber si al cliente le llegó de verdad el mensaje.
    const sts = value?.statuses;
    if (Array.isArray(sts) && sts.length) {
      const sb2 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const orden: Record<string, number> = { enviado: 1, entregado: 2, leido: 3, fallido: 9 };
      const mapa: Record<string, string> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };
      for (const st of sts) {
        const waId = String(st.id || ''); const nuevo = mapa[String(st.status || '')];
        if (!waId || !nuevo) continue;
        try {
          // No retroceder: si ya está 'leido', un 'entregado' atrasado no lo pisa.
          const { data: prev } = await sb2.from('wsp_mensajes').select('estado').eq('wa_message_id', waId).maybeSingle();
          if (prev && (orden[prev.estado] || 0) > (orden[nuevo] || 0) && nuevo !== 'fallido') continue;
          await sb2.from('wsp_mensajes').update({
            estado: nuevo,
            estado_error: nuevo === 'fallido' ? String(st.errors?.[0]?.title || st.errors?.[0]?.message || 'error').slice(0, 200) : null,
          }).eq('wa_message_id', waId);
        } catch (_) { /* columna aún no creada → se ignora */ }
      }
      return ok200();
    }

    const msgs = value?.messages;
    if (Array.isArray(msgs) && msgs.length) {
      const contacto = value?.contacts?.[0];
      const nombre = contacto?.profile?.name || '';
      for (const m of msgs) {
        const from = String(m.from || '').replace(/[^\d]/g, '');
        if (!from) continue;
        const texto = m.text?.body || m.button?.text || m.interactive?.list_reply?.title || m.interactive?.button_reply?.title || `[${m.type || 'mensaje'}]`;
        const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();

        // Upsert de la conversación (por teléfono) — trae la etapa para saber si el bot debe responder
        let convId: string | null = null;
        let etapa = 'bot_intake';
        try {
          const { data: conv } = await sb.from('wsp_conversaciones').select('id, etapa').eq('telefono', from).maybeSingle();
          if (conv?.id) {
            convId = conv.id; etapa = conv.etapa || 'bot_intake';
            await sb.from('wsp_conversaciones').update({ nombre: nombre || undefined, ultimo_mensaje: texto, ultimo_mensaje_at: ts, updated_at: new Date().toISOString() }).eq('id', convId);
          } else {
            const { data: nueva } = await sb.from('wsp_conversaciones').insert({ telefono: from, nombre, canal: 'general', etapa: 'bot_intake', ultimo_mensaje: texto, ultimo_mensaje_at: ts }).select('id').single();
            convId = nueva?.id || null;
          }
        } catch (e) { console.error('[whatsapp] conversacion:', e); }

        try {
          await sb.from('wsp_mensajes').insert({ conversacion_id: convId, telefono: from, rol: 'cliente', texto, wa_message_id: m.id || null, tipo: m.type || 'text', ts });
        } catch (e) { console.error('[whatsapp] mensaje:', e); }

        // ── BOT ANFITRIÓN: solo si nadie del equipo tomó la conversación ──
        if (etapa === 'bot_intake' && m.type !== 'reaction') {
          try { await manejarBot(sb, from, texto, convId, nombre); } catch (e) { console.error('[whatsapp] bot:', e); }
        }
      }
    }
    return ok200();
  } catch (err) {
    console.error('[whatsapp]', err);
    return ok200(); // siempre 200 para que Meta no reintente en loop
  }
});

function ok200() { return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

async function firmaOk(header: string, body: string, secret: string): Promise<boolean> {
  try {
    const sig = header.replace('sha256=', '');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === sig;
  } catch { return false; }
}

// ── Envía un mensaje de WhatsApp como FRATE (Graph API) y lo guarda ──
async function enviarWA(sb: any, to: string, texto: string, convId: string | null, rol = 'bot') {
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');
  const TOKEN = Deno.env.get('WHATSAPP_TOKEN');
  if (!PHONE_ID || !TOKEN || !texto) return;
  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
    });
    const d = await r.json();
    const waId = d?.messages?.[0]?.id || null;
    const now = new Date().toISOString();
    await sb.from('wsp_mensajes').insert({ conversacion_id: convId, telefono: to, rol, texto, wa_message_id: waId, tipo: 'text', ts: now });
    if (convId) await sb.from('wsp_conversaciones').update({ ultimo_mensaje: texto, ultimo_mensaje_at: now, updated_at: now }).eq('id', convId);
  } catch (e) { console.error('[whatsapp] enviarWA:', e); }
}

// ── El bot Anfitrión atiende el WhatsApp: responde, o escala + crea la ficha ──
async function manejarBot(sb: any, from: string, texto: string, convId: string | null, nombre: string) {
  // Switch maestro: al apagar BOT FRIEND, WhatsApp queda disponible para atención humana.
  try {
    const { data: cfgActivo } = await sb.from('config_valores').select('valor').eq('clave', 'bot_activo').maybeSingle();
    if (cfgActivo && String(cfgActivo.valor).toLowerCase() === 'false') {
      if (convId) await sb.from('wsp_conversaciones').update({ etapa: 'esperando_anfitrion' }).eq('id', convId);
      return;
    }
  } catch (_) { /* si falta la clave, sigue activo por compatibilidad */ }
  const low = (texto || '').toLowerCase();
  const esCumple = /cumple|cumplea|celebrar|celebro|torta/.test(low);
  const esReserva = /reserva|reservar|\bmesa\b|\bvip\b|botella|botellas|despedida/.test(low);

  // Reserva / cumpleaños → escala a humano + crea la ficha en el Centro de Cumpleaños
  if (esCumple || esReserva) {
    const tipo = esCumple ? 'cumple' : 'reserva';
    try {
      await sb.from('formularios').insert({
        tipo, nombre: (nombre || '').toUpperCase() || null, telefono: from,
        datos: { origen: 'whatsapp', telefono: from, whatsapp: from, mensaje: texto },
        estado: 'nuevo', historial: [{ ts: new Date().toISOString(), ev: 'creado por WhatsApp' }],
      });
    } catch (e) { console.error('[whatsapp] formulario:', e); }
    try { if (convId) await sb.from('wsp_conversaciones').update({ etapa: 'esperando_anfitrion', canal: tipo }).eq('id', convId); } catch (_) {}
    // Acuse configurable (Config → 🎧 Anfitrión). Variable {nombre}. Fallback al default.
    let ackC = '', ackR = '';
    try {
      const { data: cfgv } = await sb.from('config_valores').select('clave, valor').in('clave', ['bot_ack_cumple', 'bot_ack_reserva']);
      const cm = new Map((cfgv || []).map((x: any) => [x.clave, x.valor]));
      ackC = String(cm.get('bot_ack_cumple') || '').trim();
      ackR = String(cm.get('bot_ack_reserva') || '').trim();
    } catch (_) { /* usa defaults */ }
    const nom = (nombre || '').split(' ')[0] || '';
    const saludoCumple = nom ? `¡Salud por eso, ${nom}!` : '¡Salud por eso!';
    const saludoReserva = nom ? `¡Buenísimo, ${nom}!` : '¡Buenísimo!';
    const ack = (esCumple
      ? (ackC ? ackC.replace(/\{nombre\}/g, nom) : `${saludoCumple} 🎂🍷 Ya sentí la vibra de tu cumpleaños. El equipo te escribe al tiro para armar la mesa, el cover y toda la ceremonia. Que sea épico ✨`)
      : (ackR ? ackR.replace(/\{nombre\}/g, nom) : `${saludoReserva} 🍾 Guardé tu señal para la reserva. El equipo te contacta al toque con sector, valores y disponibilidad. La noche ya te espera 🌙`));
    await enviarWA(sb, from, ack, convId, 'bot');
    return;
  }

  // FAQ curada (tabla `respuestas`): responde con TUS palabras exactas antes de ir a la IA (igual que el chat web)
  try {
    const faq = await _matchFaq(sb, texto);
    if (faq) {
      if (faq.escala && convId) { try { await sb.from('wsp_conversaciones').update({ etapa: 'esperando_anfitrion' }).eq('id', convId); } catch (_) {} }
      await enviarWA(sb, from, faq.texto, convId, 'bot');
      return;
    }
  } catch (e) { console.error('[whatsapp] faq:', e); }

  // Resto → responde el bot con IA (mismo cerebro que la web, ahora con la FAQ inyectada)
  try {
    const { data: prev } = await sb.from('wsp_mensajes').select('rol, texto').eq('conversacion_id', convId).order('ts', { ascending: true }).limit(12);
    const mensajes = (prev || []).map((x: any) => ({ from: x.rol === 'cliente' ? 'user' : 'bot', text: x.texto || '' })).filter((x: any) => x.text);
    if (!mensajes.length) mensajes.push({ from: 'user', text: texto });
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/anfitrion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
      body: JSON.stringify({ mensajes }),
    });
    const d = await r.json();
    const respuesta = d?.respuesta;
    if (respuesta) await enviarWA(sb, from, respuesta, convId, 'bot');
  } catch (e) { console.error('[whatsapp] anfitrion:', e); }
}

// ── FAQ curada (tabla `respuestas`): match por INICIO de palabra sobre `disparadores` (bot_auto) ──
// Mismo algoritmo que el chat web (anfitrion-conversar) → el bot de WhatsApp deja de saltarse la FAQ.
function _norm(s: string) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
async function _matchFaq(sb: any, texto: string): Promise<{ texto: string; escala: boolean } | null> {
  const words = ' ' + _norm(texto).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const { data: reps } = await sb.from('respuestas').select('texto, disparadores, tras_responder, orden').eq('activo', true).eq('bot_auto', true).order('orden');
  for (const r of (reps || [])) {
    const keys = String(r.disparadores || '').split(',').map((k: string) => _norm(k.trim()).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (keys.length && keys.some((k: string) => words.includes(' ' + k))) {
      return { texto: r.texto, escala: r.tras_responder === 'escalar' };
    }
  }
  return null;
}
