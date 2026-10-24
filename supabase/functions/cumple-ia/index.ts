// ============================================================
// FRATE — Edge Function: cumple-ia
// Asistente IA para el Centro de Cumpleaños/Reservas del admin.
// Recibe los datos del formulario + gestión y devuelve un mensaje
// de WhatsApp listo + una cotización sugerida. Usa OpenAI GPT-4o-mini.
//
// Requiere sesión (verify_jwt=true) → solo el admin logueado lo usa.
// Secrets: OPENAI_API_KEY (ya configurada para el Anfitrión).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

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
    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY no configurada');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json() as { tipo?: string; nombre?: string; datos?: any; gestion?: any; instruccion?: string };
    const tipo = body.tipo || 'cumple';
    const nombre = String(body.nombre || '').slice(0, 80);
    const datos = body.datos || {};
    const gestion = body.gestion || {};

    // Contexto opcional de paquetes/precios (lo configura el dueño en config_valores.cumple_paquetes)
    let paquetes = '';
    try {
      const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'cumple_paquetes').maybeSingle();
      paquetes = (cfg && cfg.valor) ? String(cfg.valor).slice(0, 1500) : '';
    } catch (_) { /* sin config */ }

    const esCumple = tipo === 'cumple';
    const system = `Eres el asistente del equipo de FRATE (discoteca universitaria en Santiago de Chile) para gestionar ${esCumple ? 'cumpleaños' : 'reservas'}.
Tu trabajo: ayudar al equipo a responderle al cliente por WhatsApp de forma cálida, cercana y profesional, en **español de Chile** (tú, sin argentinismos, sin "che/vos").
Reglas del mensaje:
- Saluda por el primer nombre.
- ${esCumple ? 'Es un cumpleaños: felicítalo/coordina la celebración.' : 'Es una reserva de mesa/sector.'}
- Menciona la fecha si la hay.
- Pide los datos que falten para cotizar: número de personas, sector (VIP/Terraza/General) y si quieren botellas/cover.
- Cierra invitando a coordinar. Corto (máx ~5 líneas), con 1-2 emojis, sin sonar robot.
${paquetes ? `Paquetes y precios disponibles (úsalos para la cotización):\n${paquetes}` : 'No tienes precios exactos: en la cotización propón una estructura y aclara que confirmas valores al saber el número de personas.'}
Responde SIEMPRE en JSON válido con exactamente estas dos claves:
{"mensaje": "<texto listo para pegar en WhatsApp>", "cotizacion": "<breve cotización o próximos pasos sugeridos>"}`;

    const userMsg = `Datos del ${esCumple ? 'cumpleañer@' : 'cliente'}:
Nombre: ${nombre}
${Object.entries(datos).filter(([, v]) => String(v ?? '').trim() !== '').map(([k, v]) => `${k}: ${v === true ? 'sí' : v}`).join('\n')}
${gestion.paquete ? `Paquete ya conversado: ${gestion.paquete}` : ''}
${gestion.invitados ? `Invitados estimados: ${gestion.invitados}` : ''}
${gestion.monto ? `Monto conversado: $${gestion.monto}` : ''}
${body.instruccion ? `Instrucción extra del equipo: ${body.instruccion}` : ''}`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
        max_tokens: 400,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await r.json();
    if (!r.ok) { console.error('[cumple-ia] OpenAI:', data?.error?.message || r.status); return new Response(JSON.stringify({ error: 'IA no disponible' }), { status: 502, headers: cors }); }
    let out: any = {};
    try { out = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch (_) { out = { mensaje: data.choices?.[0]?.message?.content || '', cotizacion: '' }; }
    return new Response(JSON.stringify({ mensaje: out.mensaje || '', cotizacion: out.cotizacion || '' }), { headers: cors });

  } catch (err) {
    console.error('[cumple-ia]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
