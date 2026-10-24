// ============================================================
// FRATE — Edge Function: anfitrion
// El cerebro del chatbot "El Anfitrión" 🎧 (vendedor + captador
// + explicador). Usa OpenAI GPT-4o-mini con un system prompt
// cargado con las reglas REALES del portal + datos EN VIVO
// (eventos publicados, precios, stock, features activas).
//
// Público (verify_jwt=false): cualquier visitante puede chatear.
// Candados anti-abuso: máx 10 mensajes por request, 400 chars
// c/u, respuesta corta (máx ~160 tokens).
//
// Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

    const { mensajes } = await req.json() as { mensajes?: { from: string; text: string }[] };
    const hist = (mensajes || []).slice(-10).map(m => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: String(m.text || '').slice(0, 400),
    })).filter(m => m.content);
    if (!hist.length || hist[hist.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'Falta la pregunta' }), { status: 400, headers: cors });
    }

    // ── Datos EN VIVO del portal ─────────────────────────────
    const nowCL = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const [{ data: evs }, { data: secciones }, { data: valores }, { data: paquetes }, faqRes, ejemplosRes] = await Promise.all([
      sb.from('eventos').select('nombre, fecha, hora, hora_termino, estado, activo, archivado, tipos_ticket(nombre, precio, disponible, estado)')
        .eq('archivado', false).eq('activo', true).order('fecha').limit(6),
      sb.from('config_sitio').select('clave, visible'),
      sb.from('config_valores').select('clave, valor'),
      sb.from('paquetes').select('categoria, nombre, incluye, precio').eq('activo', true).order('categoria').order('orden'),
      sb.from('respuestas').select('titulo, texto, categoria, orden').eq('activo', true).order('orden'),   // FAQ curada = base de conocimiento del bot
      sb.from('bot_ejemplos').select('pregunta, respuesta, orden').eq('activo', true).order('orden').limit(20),
    ]);
    const faqs = faqRes?.data || [];
    const ejemplos = ejemplosRes?.data || [];
    const val = new Map((valores || []).map((v: any) => [v.clave, v.valor]));
    const catNom: Record<string, string> = { cumple: 'Cumpleaños', despedida: 'Despedida de solter@s', vip: 'Pack VIP', cover: 'Cover', botella: 'Botella', combo: 'Combo', otro: 'Extra' };
    const paquetesTxt = (paquetes || []).map((p: any) =>
      `· [${catNom[p.categoria] || p.categoria}] ${p.nombre}${p.incluye ? ' — ' + p.incluye : ''}${p.precio ? ' ($' + Number(p.precio).toLocaleString('es-CL') + ')' : ''}`).join('\n');
    const sec = new Map((secciones || []).map((s: any) => [s.clave, s.visible]));

    const eventosTxt = (evs || [])
      .filter((e: any) => ['publicado', 'en_vivo'].includes(e.estado || 'publicado'))
      .map((e: any) => {
        const tts = (e.tipos_ticket || []).filter((t: any) => t.estado === 'Activo' && (t.disponible || 0) > 0);
        const desde = tts.length ? Math.min(...tts.map((t: any) => t.precio)) : null;
        const quedan = tts.reduce((s: number, t: any) => s + (t.disponible || 0), 0);
        return `· "${e.nombre}" el ${e.fecha} a las ${e.hora || '23:00'}${desde ? `, entradas desde $${desde.toLocaleString('es-CL')}` : ''}${quedan ? ` (quedan ${quedan})` : ' (AGOTADO)'}`;
      }).join('\n') || '· Por ahora no hay eventos publicados — pronto se anuncian nuevos.';

    const features: string[] = [];
    features.push('Ranking Musical del Pueblo: votas tu canción y la 1ª vez ganas $1.000 de crédito');
    features.push(`Referidos: compartes tu link desde Mi cuenta y cuando tu amig@ compra, GANAN $${parseInt(val.get('referido_monto') || '1000').toLocaleString('es-CL')} cada uno`);
    features.push(`Arma tu grupo: juntas ${val.get('grupo_meta') || 5} personas y todos compran con ${val.get('grupo_descuento') || 15}% de descuento`);
    features.push(`Cumpleaños: en tu mes te regalamos $${parseInt(val.get('cumple_credito') || '5000').toLocaleString('es-CL')} de crédito al entrar al sitio`);
    features.push('Puntos: cada compra suma puntos (1 punto por cada $100) canjeables por premios reales en Mi cuenta');
    if (sec.get('ruleta')) features.push('Juegos post-compra: comprando sobre el mínimo giras la ruleta/raspe/trivia y ganas crédito, puntos o tragos');
    if (sec.get('cuenta_membresia')) features.push('Membresías: pases de un pago con beneficios (entrada liberada o descuento por un período)');

    // ── Config editable del bot (Config → 🎧 Anfitrión). Si vacío, usa el default de FRATE. ──
    const botNombre = (val.get('bot_nombre') || '').trim() || 'BOT FRIEND';
    const infoLocal = (val.get('bot_info_local') || '').trim() ||
      'Club nocturno en Pío Nono 430, Barrio Bellavista, Santiago de Chile. Horario: jueves 23:00–04:00; viernes y sábado 23:00–05:00. WhatsApp del equipo: +56 9 8131 1548. Sitio: frate.cl';
    const personalidad = (val.get('bot_personalidad') || '').trim() ||
      `Eres el espíritu bueno de la fiesta: un Dionisio chileno, el alma de la uva destilada — del pisco y el vino. Místico y pachamámico, hablas como un chamán urbano que le canta a la noche, pero estás enamorado de la música y no puedes evitar guiñarle (un artista, un verso, una vibra). Rondas los 40 y tienes harta sabiduría, pero entiendes perfecto a los jóvenes y su código. Eres filosófico, bromista y cálido; a veces sueltas una frase que parece salida de un sueño. Hablas chileno natural ("bacán", "al tiro", "la buena") sin forzarlo, y eres breve como un verso. Por muy místico que te pongas, SIEMPRE aterrizas y ayudas de verdad: horarios, precios, entradas, reservas — y llevas con cariño a comprar o a dejar el dato.`;
    const reglasExtra = (val.get('bot_reglas_extra') || '').trim();
    const piezasPersonalidad = [
      ['ESENCIA', val.get('bot_esencia')],
      ['TONO', val.get('bot_tono')],
      ['MULETILLAS (úsalas con moderación)', val.get('bot_muletillas')],
      ['TEMAS FAVORITOS', val.get('bot_temas')],
      ['LÍNEAS ROJAS', val.get('bot_lineas_rojas')],
    ].filter(([, contenido]) => String(contenido || '').trim())
      .map(([titulo, contenido]) => `${titulo}: ${String(contenido).trim()}`).join('\n');
    // Guardrails de marca SIEMPRE presentes (no dependen de la config editable).
    const guardrails = 'FRATE es solo +18. Invitas a disfrutar CON MODERACIÓN; nunca incitas a tomar de más, a mezclar sin control ni a manejar habiendo bebido (si alguien va a conducir, recuérdaselo con cariño). No das consejos médicos ni legales; ante malestar o emergencia, deriva al equipo y al WhatsApp. El misticismo es alegre y sano, jamás una excusa para el exceso.';
    // FAQ curada (tabla `respuestas`): la base de conocimiento oficial — el bot responde con ESTO, no inventa.
    const faqTxt = (faqs as any[]).map((f: any) =>
      `· ${f.titulo}: ${String(f.texto || '').replace(/\s+/g, ' ').trim().slice(0, 320)}`).join('\n');
    const ejemplosTxt = (ejemplos as any[]).map((e: any, i: number) =>
      `${i + 1}. Cliente: ${String(e.pregunta || '').replace(/\s+/g, ' ').trim().slice(0, 240)}\n${botNombre}: ${String(e.respuesta || '').replace(/\s+/g, ' ').trim().slice(0, 420)}`).join('\n');

    const system = `Eres ${botNombre} 🍇, el espíritu y anfitrión oficial de FRATE (Fraternidad Campus Central). Un personaje con alma: mitad chamán, mitad DJ — el ánima buena del carrete.

SOBRE EL LOCAL (datos oficiales — úsalos con exactitud, no los cambies):
${infoLocal}

TU PERSONALIDAD: ${personalidad}
${piezasPersonalidad ? `\nPIEZAS DE TU PERSONAJE:\n${piezasPersonalidad}\n` : ''}

CONSUMO RESPONSABLE (regla inquebrantable, por sobre todo lo demás): ${guardrails}

TU MISIÓN: 1) VENDER entradas (menciona eventos reales con precio y urgencia si queda poco stock), 2) CAPTAR registros (crear cuenta da beneficios reales), 3) EXPLICAR el portal con precisión.

EVENTOS A LA VENTA AHORA MISMO (datos reales, úsalos):
${eventosTxt}
${faqTxt ? `
RESPUESTAS OFICIALES DE FRATE (tu base de conocimiento — cuando la pregunta calce con una de estas, responde con ESTA info; puedes decirlo con tu tono, pero JAMÁS cambies datos, precios ni horarios):
${faqTxt}
` : ''}
${ejemplosTxt ? `ASÍ HABLAS (imita el estilo de estos ejemplos, sin copiar su contenido literal; enseñan VOZ, no datos):
${ejemplosTxt}
` : ''}
REGLAS REALES DEL PORTAL (responde SOLO con esto, jamás inventes):
- Comprar: eliges el evento en frate.cl, seleccionas entradas, TODAS son nominativas (nombre y RUT de cada asistente, obligatorio por seguridad). Pagas con MercadoPago (tarjetas, débito, transferencia). El QR llega al correo al instante; cada asistente puede recibir el suyo.
- En la puerta: muestras tu QR y tu carnet (el nombre debe calzar).
- Devoluciones: desde Mi cuenta → Mis compras → "Solicitar devolución". Opciones: crédito FRATE (rápido, para otro evento) o devolución del dinero (la revisa el equipo; si se aprueba, demora hasta 5 días hábiles). Nada es automático: el equipo aprueba.
- ¿No fuiste al evento? Tienes ${val.get('reactivacion_horas') || 48} horas después para pedir reactivación como crédito FRATE del mismo valor.
- Crédito FRATE: se usa al comprar (tú eliges aplicarlo con el botón "Usar" en el checkout).
- Formas de GANAR: ${features.join(' · ')}.
- Reservas de mesa y cumpleaños: mándalos al FORMULARIO DIRECTO → cumpleaños en frate.cl/formcumple · reservas de mesa en frate.cl/formreserva. Ahí dejan sus datos (y el detalle de invitados con nombre y RUT), el equipo los contacta al toque y coordina todo. Si alguien menciona "cumpleaños", "mesa", "VIP", "botellas" o "celebrar", ANÍMALO con entusiasmo y pásale el link directo que corresponda.${paquetesTxt ? `
- OPCIONES DE CUMPLEAÑOS Y PACKS (reales — cótalas si preguntan por cumple, mesa, VIP o botellas; el detalle final lo cierra el equipo):
${paquetesTxt}` : ''}
- Cómo llegar: Pío Nono 430, Recoleta (Bellavista). En el sitio está el botón "📍 Llegar" con el mapa.
- Contraseña olvidada: en el login hay "¿Olvidaste tu contraseña?".${reglasExtra ? `

INSTRUCCIONES EXTRA DEL EQUIPO (respétalas siempre, mandan sobre lo de arriba si hay conflicto):
${reglasExtra}` : ''}

LÍMITES:
- Respuestas CORTAS: máximo 2-3 frases (es un chat de burbujas chico). UNA idea por respuesta.
- Si no sabes algo o piden algo fuera del portal (reservas especiales, eventos privados, reclamos complejos): deriva al WhatsApp +56 9 8131 1548.
- Jamás inventes precios, fechas ni promociones que no estén arriba.
- No des opiniones de temas ajenos a FRATE (política, etc.) — vuelve con gracia al carrete.`;

    // ── OpenAI ───────────────────────────────────────────────
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...hist],
        max_tokens: 180,
        temperature: 0.85,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[anfitrion] OpenAI:', data?.error?.message || r.status);
      return new Response(JSON.stringify({ error: 'IA no disponible' }), { status: 502, headers: cors });
    }
    const respuesta = data.choices?.[0]?.message?.content?.trim();
    if (!respuesta) return new Response(JSON.stringify({ error: 'Sin respuesta' }), { status: 502, headers: cors });

    return new Response(JSON.stringify({ respuesta }), { headers: cors });

  } catch (err) {
    console.error('[anfitrion]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
