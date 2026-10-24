// ============================================================
// FRATE — Edge Function: anfitrion-conversar (Fase 4)
// Conversación PERSISTENTE con handoff a humano. El bot responde
// (reusa la función `anfitrion`); si el cliente pide reserva/cumple/
// mesa/hablar con alguien → ESCALA (esperando_humano) y deja de
// responder solo. El humano contesta desde el panel web o el ERP.
//
// Público (verify_jwt=false). Secrets: SUPABASE_URL, SERVICE_ROLE_KEY.
//
// POST { accion:'enviar', conversacion_id?, texto, contacto?, canal? }
//      { accion:'poll',   conversacion_id, desde? }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

// Handoff SOLO cuando el cliente pide EXPLÍCITAMENTE un humano (lo demás lo maneja
// el bot con los disparadores configurables de la tabla `respuestas`).
const ESCALAR_RE = /(hablar con|con una persona|una persona real|con alguien|con un humano|un humano|ejecutiv|un agente|atenci[oó]n humana|pas(a|á)me con|comunicar con|reclamo)/i;

// Push al inbox del ERP cuando un chat WEB escala a humano. No-op mientras no
// estén configuradas ERP_WEBHOOK_URL + la llave (el dueño las instala en su momento).
// deno-lint-ignore no-explicit-any
async function notificarERP(payload: any) {
  try {
    const url = Deno.env.get('ERP_WEBHOOK_URL');
    const key = Deno.env.get('ERP_API_KEY') || Deno.env.get('CRM_WEBHOOK_KEY');
    if (!url || !key) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(t);
  } catch (_e) { /* best-effort */ }
}

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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || 'enviar');
    let convId: string | null = body.conversacion_id || null;

    // ── POLL: nuevos mensajes desde un timestamp ──
    if (accion === 'poll') {
      if (!convId) return new Response(JSON.stringify({ error: 'falta conversacion_id' }), { status: 400, headers: cors });
      const desde = body.desde || '1970-01-01T00:00:00Z';
      const { data: msgs } = await sb.from('mensajes').select('rol, texto, ts').eq('conversacion_id', convId).gt('ts', desde).order('ts');
      const { data: conv } = await sb.from('conversaciones').select('estado').eq('id', convId).maybeSingle();
      return new Response(JSON.stringify({ conversacion_id: convId, estado: conv?.estado || 'bot', mensajes: msgs || [] }), { headers: cors });
    }

    // ── ENVIAR ──
    const texto = String(body.texto || '').slice(0, 400).trim();
    if (!texto) return new Response(JSON.stringify({ error: 'texto vacío' }), { status: 400, headers: cors });
    let botActivo = true;
    try {
      const { data: cfgActivo } = await sb.from('config_valores').select('valor').eq('clave', 'bot_activo').maybeSingle();
      botActivo = !cfgActivo || String(cfgActivo.valor).toLowerCase() !== 'false';
    } catch (_e) { /* activo por compatibilidad si la clave aún no existe */ }

    // Modo PRUEBA (admin): calcula qué contestaría el bot SIN crear conversación ni guardar nada.
    if (body.dry_run) {
      if (!botActivo) return new Response(JSON.stringify({ dry: true, respuesta: null, inactivo: true }), { headers: cors });
      const _n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const _w = ' ' + _n(texto).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
      try {
        const { data: reps } = await sb.from('respuestas').select('texto, disparadores, tras_responder, orden').eq('activo', true).eq('bot_auto', true).order('orden');
        for (const r of (reps || [])) {
          const keys = String(r.disparadores || '').split(',').map((k: string) => _n(k.trim()).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (keys.length && keys.some((k: string) => _w.includes(' ' + k))) {
            return new Response(JSON.stringify({ dry: true, respuesta: r.texto, escala: r.tras_responder === 'escalar' }), { headers: cors });
          }
        }
      } catch (_e) { /* sin respuestas */ }
      if (ESCALAR_RE.test(texto)) return new Response(JSON.stringify({ dry: true, respuesta: 'Te paso con una persona del equipo 👤 …', escala: true }), { headers: cors });
      return new Response(JSON.stringify({ dry: true, respuesta: null, ia: true }), { headers: cors });
    }

    if (!convId) {
      const { data: c, error } = await sb.from('conversaciones').insert({
        canal: ['web','whatsapp','instagram'].includes(body.canal) ? body.canal : 'web',
        contacto: body.contacto || null, estado: 'bot',
      }).select('id').single();
      if (error) throw error;
      convId = c.id;
    }
    const nowISO = new Date().toISOString();
    await sb.from('mensajes').insert({ conversacion_id: convId, rol: 'cliente', texto });
    await sb.from('conversaciones').update({ ultimo_ts: nowISO, ...(body.contacto ? { contacto: body.contacto } : {}) }).eq('id', convId);

    // Estado actual
    const { data: conv } = await sb.from('conversaciones').select('estado, canal').eq('id', convId).maybeSingle();
    const estado = conv?.estado || 'bot';
    const canalConv = conv?.canal || body.canal || 'web';

    // Si ya lo maneja un humano (o está esperando) → el bot NO responde
    if (estado !== 'bot') {
      return new Response(JSON.stringify({ conversacion_id: convId, estado, mensajes: [] }), { headers: cors });
    }
    if (!botActivo) {
      await sb.from('conversaciones').update({ estado: 'esperando_humano', ultimo_ts: nowISO }).eq('id', convId);
      return new Response(JSON.stringify({ conversacion_id: convId, estado: 'esperando_humano', mensajes: [] }), { headers: cors });
    }

    // ── Intents configurables: ¿algún disparador de las respuestas calza? (el bot responde, no escala) ──
    const _norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const tnorm = _norm(texto);
    // Texto en "palabras" para matchear por INICIO de palabra (no substring):
    // así 'mesa' no dispara con 'promesa', pero 'cumple' sí calza con 'cumpleaños'.
    const _words = ' ' + tnorm.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    try {
      const { data: reps } = await sb.from('respuestas').select('texto, disparadores, bot_auto, tras_responder, orden')
        .eq('activo', true).eq('bot_auto', true).order('orden');
      for (const r of (reps || [])) {
        const keys = String(r.disparadores || '').split(',').map((k: string) => _norm(k.trim()).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (keys.length && keys.some((k: string) => _words.includes(' ' + k))) {
          const { data: insR } = await sb.from('mensajes').insert({ conversacion_id: convId, rol: 'bot', texto: r.texto }).select('ts').single();
          if (r.tras_responder === 'escalar') {
            await sb.from('conversaciones').update({ estado: 'esperando_humano', ultimo_ts: nowISO }).eq('id', convId);
            /* §1b DESCONTINUADO 2026-07-09: el inbox vive en la WEB (la anfitriona atiende aquí), no se empuja al ERP. */
            return new Response(JSON.stringify({ conversacion_id: convId, estado: 'esperando_humano', ts: insR?.ts, mensajes: [{ rol: 'bot', texto: r.texto, ts: insR?.ts }] }), { headers: cors });
          }
          return new Response(JSON.stringify({ conversacion_id: convId, estado: 'bot', ts: insR?.ts, mensajes: [{ rol: 'bot', texto: r.texto, ts: insR?.ts }] }), { headers: cors });
        }
      }
    } catch (_e) { /* si `respuestas` aún no tiene las columnas, sigue el flujo normal */ }

    // ¿Escalar a humano? (solo pedido explícito)
    if (ESCALAR_RE.test(texto)) {
      await sb.from('conversaciones').update({ estado: 'esperando_humano', ultimo_ts: nowISO }).eq('id', convId);
      const handoff = 'Te paso con una persona del equipo 👤 para armarlo como corresponde. Dame un ratito y te responden por aquí mismo — o escríbenos al WhatsApp +56 9 8131 1548 🎧';
      const { data: insH } = await sb.from('mensajes').insert({ conversacion_id: convId, rol: 'bot', texto: handoff }).select('ts').single();
      /* §1b DESCONTINUADO 2026-07-09: el inbox vive en la WEB (la anfitriona atiende aquí), no se empuja al ERP. */
      return new Response(JSON.stringify({ conversacion_id: convId, estado: 'esperando_humano', ts: insH?.ts, mensajes: [{ rol: 'bot', texto: handoff, ts: insH?.ts }] }), { headers: cors });
    }

    // El bot responde (reusa el cerebro `anfitrion`)
    const { data: hist } = await sb.from('mensajes').select('rol, texto').eq('conversacion_id', convId).order('ts').limit(16);
    const mensajes = (hist || []).map((m: any) => ({ from: m.rol === 'cliente' ? 'user' : 'assistant', text: m.texto }));
    let respuesta = '';
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/anfitrion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ mensajes }),
      });
      const d = await r.json();
      respuesta = String(d?.respuesta || '').slice(0, 600);
    } catch (_e) { /* fallback abajo */ }
    if (!respuesta) respuesta = 'Buena pista 🎧 pregúntame por eventos, entradas, o dime si quieres una reserva o cumpleaños y te paso con el equipo.';

    const { data: insB } = await sb.from('mensajes').insert({ conversacion_id: convId, rol: 'bot', texto: respuesta }).select('ts').single();
    return new Response(JSON.stringify({ conversacion_id: convId, estado: 'bot', ts: insB?.ts, mensajes: [{ rol: 'bot', texto: respuesta, ts: insB?.ts }] }), { headers: cors });

  } catch (err) {
    console.error('[anfitrion-conversar]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
