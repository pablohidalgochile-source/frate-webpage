// ============================================================
// FRATE — Edge Function: form-submit (público)
// Recibe los formularios con link propio (cumple/reserva/frecuente),
// los guarda en `formularios` (service role) y avisa al equipo por
// correo. verify_jwt=false (público). Honeypot anti-bots.
//
// POST { tipo:'cumple'|'reserva'|'frecuente', datos:{...}, hp?:'' }
// →    { ok:true, id }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { despacharWebhook, formularioAPayloadERP } from '../_shared/crm.ts';

const TIPOS = ['cumple', 'reserva', 'frecuente'];
const LABEL: Record<string, string> = { cumple: '🎂 Cumpleaños', reserva: '🍾 Reserva', frecuente: '⭐ Cliente frecuente' };

async function mail(to: string, asunto: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Frate <tickets@frate.cl>', to: [to], subject: asunto, html }),
    });
  } catch (_e) { /* mejor esfuerzo */ }
}

// Normaliza el teléfono a un WhatsApp PLAUSIBLE (igual que lo guarda el webhook de WhatsApp),
// o devuelve '' si no lo es:
//  · Chile celular → 569 + 8 dígitos (acepta 8 dígitos, 9 que parten en 9, u 11 que parten en 569).
//  · Extranjero    → 10 a 15 dígitos que no parten en 0 ni en 56 y no son todos el mismo dígito.
// OJO: antes cualquier cosa pasaba ('000', un fijo, un número a medias) y todos los formularios
// que traían el MISMO número inválido caían en UNA sola conversación, aunque fueran de personas
// distintas. Meta además los rechaza (131009). Con '' no se crea ni se reutiliza conversación;
// la ficha del formulario se guarda igual.
function telInbox(raw: string): string {
  const n = String(raw || '').replace(/[^\d]/g, '');
  if (n.length === 8) return '569' + n;
  if (n.length === 9 && n.startsWith('9')) return '56' + n;
  if (n.length === 11 && n.startsWith('569')) return n;
  if (n.length >= 10 && n.length <= 15 && !/^(0|56)/.test(n) && !/^(\d)\1+$/.test(n)) return n;
  return '';
}

// Deja la solicitud visible en el inbox de WhatsApp (bandeja unificada). Best-effort: nunca rompe el form.
async function vincularInbox(sb: any, opts: { telefono: string; nombre?: string; canal?: string; resumen: string }) {
  const tel = telInbox(opts.telefono);
  if (!tel) return;
  const nombre = (opts.nombre || '').trim() || null;
  const canal = opts.canal || 'general';
  const resumen = (opts.resumen || 'Nueva solicitud desde la web').slice(0, 300);
  const now = new Date().toISOString();
  try {
    const { data: conv } = await sb.from('wsp_conversaciones').select('id, etapa').eq('telefono', tel).maybeSingle();
    let convId: string | null = conv?.id || null;
    if (convId) {
      const upd: Record<string, unknown> = { ultimo_mensaje: resumen, ultimo_mensaje_at: now, updated_at: now, canal };
      if (nombre) upd.nombre = nombre;
      if (!conv?.etapa || conv.etapa === 'bot_intake') upd.etapa = 'esperando_anfitrion';
      await sb.from('wsp_conversaciones').update(upd).eq('id', convId);
    } else {
      const base: Record<string, unknown> = { telefono: tel, nombre, canal, etapa: 'esperando_anfitrion', ultimo_mensaje: resumen, ultimo_mensaje_at: now };
      let r = await sb.from('wsp_conversaciones').insert({ ...base, origen: 'formulario' }).select('id').single();
      if (r.error) r = await sb.from('wsp_conversaciones').insert(base).select('id').single();
      convId = r.data?.id || null;
    }
    if (convId) {
      // Va como 'cliente', no como 'nota': esto es lo que ESCRIBIÓ la persona
      // en el formulario. Marcado como nota, el inbox lo pintaba del lado del
      // equipo y la conversación se leía como si nadie hubiera preguntado nada.
      await sb.from('wsp_mensajes').insert({ conversacion_id: convId, telefono: tel, rol: 'cliente', texto: resumen, tipo: 'nota', ts: now });
    }
  } catch (e) { console.error('[vincularInbox]', e); }
}

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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    // Honeypot: si un bot llenó el campo trampa, fingimos OK y no guardamos.
    if (body.hp) return new Response(JSON.stringify({ ok: true }), { headers: cors });

    const tipo = TIPOS.includes(body.tipo) ? body.tipo : null;
    if (!tipo) return new Response(JSON.stringify({ error: 'tipo_invalido' }), { status: 400, headers: cors });

    const datos = (body.datos && typeof body.datos === 'object' && !Array.isArray(body.datos)) ? body.datos : {};
    const g = (k: string) => String(datos[k] ?? '').trim();
    const nombre = (g('nombre') || g('marca')).slice(0, 120).toUpperCase();
    const email = (g('email') || g('correo')).slice(0, 160).toLowerCase();
    const telefono = (g('whatsapp') || g('telefono') || g('tel')).slice(0, 40);
    const instagram = g('instagram').replace(/^@/, '').slice(0, 80);
    if (!email && !telefono) return new Response(JSON.stringify({ error: 'falta_contacto' }), { status: 400, headers: cors });

    const nowISO = new Date().toISOString();

    // ── Anti-duplicado ────────────────────────────────────────────────────
    // Bloquea una segunda solicitud ABIERTA de la MISMA persona PARA LA MISMA
    // NOCHE. Dos correcciones sobre la versión vieja, las dos con daño medido:
    //
    // (1) EL NOMBRE YA NO CUENTA. Antes bastaba con llamarse igual que alguien
    //     con una ficha abierta para quedar bloqueado, aunque el correo y el
    //     teléfono fueran otros. En la base hay 4 nombres repetidos con contacto
    //     distinto = 12 fichas trabadas por homónimo. El nombre no es identidad;
    //     el correo y el teléfono sí.
    //
    // (2) AHORA SE COMPARA LA FECHA PEDIDA. Antes, una ficha abierta trababa a
    //     la persona 120 días para CUALQUIER fecha: quien celebró en agosto no
    //     podía pedir diciembre. Y como 835 fichas están en `contactado` —se
    //     habló una vez y nunca se cerró— el bloqueo alcanzaba al 58% de la base.
    //     Si pide otra noche, es otra solicitud y pasa.
    //
    // El candado real contra el doble clic es el índice único dk_email/dk_tel,
    // que es por día y está más abajo. Esto es sólo la capa amable.
    try {
      const desde = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString();
      const tel8 = telefono.replace(/\D/g, '').slice(-8);
      const fPide = String(datos.fecha_celebrar || datos.fecha || datos.fecha_evento || '').trim();
      const { data: abiertos } = await sb.from('formularios')
        .select('id,email,telefono')
        .eq('tipo', tipo)
        .not('estado', 'in', '("realizado","no_realizado","cerrado","perdido")')
        .gte('created_at', desde)
        .limit(3000);
      const mismos = (abiertos || []).filter((r: any) =>
        (email && String(r.email || '').toLowerCase().trim() === email) ||
        (tel8.length >= 7 && String(r.telefono || '').replace(/\D/g, '').slice(-8) === tel8)
      );
      let dup: any = null;
      if (mismos.length) {
        // `datos` se trae SÓLO de los pocos candidatos: traerlo de las 3000 filas
        // del chequeo haría pesada cada carga del formulario.
        const { data: conDatos } = await sb.from('formularios')
          .select('id,datos').in('id', mismos.map((m: any) => m.id));
        dup = (conDatos || []).find((r: any) => {
          const d = r.datos || {};
          const fr = String(d.fecha_celebrar || d.fecha || d.fecha_evento || '').trim();
          // Sin fecha de un lado no hay con qué comparar: se mantiene el
          // comportamiento viejo (bloquea) para no abrir un hueco de duplicados.
          if (!fPide || !fr) return true;
          return fr === fPide;
        }) || null;
      }
      if (dup) {
        // Ya tiene una solicitud en curso para esa noche. Se responde con el
        // motivo para que el formulario lo DIGA: antes devolvía ok:true a secas
        // y la persona veía la pantalla de éxito sin que se hubiera guardado nada.
        return new Response(JSON.stringify({
          ok: true, ya: true, id: dup.id,
          motivo: 'ya_abierta',
          msg: 'Ya tenemos tu solicitud' + (fPide ? ' para el ' + fPide : '') + ' y la estamos viendo. Si necesitas cambiar algo, escríbenos por WhatsApp.',
        }), { headers: cors });
      }
    } catch (_e) { /* si el chequeo falla, seguimos e insertamos igual */ }

    // Llaves de dedup — el índice único de la DB corta la carrera de raíz
    // (aunque lleguen 18 clics juntos, entra una sola).
    //
    // ⚠️ La llave es LA NOCHE QUE SE PIDE, no el día en que se escribe. Antes era
    //    el día de envío, y eso bloqueaba a quien pedía dos fechas distintas el
    //    mismo día: pedías el 5 de diciembre y el 14 de febrero te rebotaba hasta
    //    mañana. El candado tiene que ser «una solicitud por persona y por noche»,
    //    que es lo que de verdad se quiere evitar.
    //
    //    El prefijo `n:` mantiene este espacio de llaves SEPARADO del viejo: sin
    //    él, pedir la noche del 5-dic chocaría con una ficha histórica creada el
    //    5-dic, y sería un bloqueo falso.
    //
    //    Sin fecha pedida (p. ej. `frecuente`) se cae al día de envío, que es el
    //    comportamiento de siempre.
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const fNoche = String(datos.fecha_celebrar || datos.fecha || datos.fecha_evento || '').trim();
    const claveDk = fNoche ? ('n:' + fNoche) : dia;
    const tel8b = telefono.replace(/\D/g, '').slice(-8);
    const dkEmail = email ? `${tipo}|${claveDk}|${email}` : null;      // email ya viene en minúsculas
    const dkTel = tel8b.length >= 7 ? `${tipo}|${claveDk}|${tel8b}` : null;

    const baseRow: any = { tipo, nombre, email, telefono, instagram, datos, estado: 'nuevo', historial: [{ ts: nowISO, ev: 'creado' }] };
    let { data: ins, error } = await sb.from('formularios').insert({ ...baseRow, dk_email: dkEmail, dk_tel: dkTel }).select('id').single();
    if (error && (error as any).code === '42703') {
      // las columnas dk_* aún no existen (falta correr frate-form-dedup.sql) → inserta sin ellas para no romper el alta
      ({ data: ins, error } = await sb.from('formularios').insert(baseRow).select('id').single());
    }
    if (error) {
      // 23505 = ya existe una solicitud de esta persona hoy (candado único) → responder OK sin duplicar
      if ((error as any).code === '23505') return new Response(JSON.stringify({ ok: true, ya: true, motivo: 'ya_abierta', msg: 'Ya recibimos tu solicitud' + (fNoche ? ' para el ' + fNoche : ' hoy') + ' — te contactamos pronto.' }), { headers: cors });
      throw error;
    }
    if (!ins) throw new Error('no se pudo guardar la solicitud');

    // ── Bandeja unificada: que la solicitud aparezca en el inbox de WhatsApp ──
    try {
      const msg = g('mensaje') || g('comentarios') || g('comentario');
      const resumen = `📝 ${LABEL[tipo]} (web) — ${nombre || email || telefono}${msg ? ' · ' + msg : ''}`;
      await vincularInbox(sb, { telefono, nombre, canal: tipo, resumen });
    } catch (_e) { /* mejor esfuerzo */ }

    // Avisar al equipo (mejor esfuerzo; reusa el correo BCC configurado)
    try {
      const { data: cfg } = await sb.from('config_valores').select('valor').eq('clave', 'admin_bcc_email').maybeSingle();
      const to = cfg?.valor;
      if (to) {
        const filas = Object.entries(datos)
          .filter(([, v]) => String(v ?? '').trim())
          .map(([k, v]) => `<tr><td style="padding:3px 10px;color:#888;">${k}</td><td style="padding:3px 10px;"><b>${String(v ?? '').replace(/</g, '&lt;')}</b></td></tr>`).join('');
        await mail(to, `Nuevo formulario ${LABEL[tipo]} — ${nombre || email || telefono}`,
          `<div style="font-family:sans-serif;max-width:520px;"><h3>${LABEL[tipo]} · #${ins.id}</h3><table style="border-collapse:collapse;">${filas}</table><p style="color:#888;font-size:13px;">Míralo en el panel → Comunidad → Formularios.</p></div>`);
      }
    } catch (_e) { /* aviso es mejor esfuerzo */ }

    // ── Auto-respuesta al cliente: nadie queda sin contestación ──
    try {
      if (email) {
        const pn = (nombre || '').split(' ')[0] || '';
        // Texto del correo editable desde el admin (config_valores msg_mail_<tipo> y msg_mail_<tipo>_subject)
        let introCfg = '', subjCfg = '';
        try {
          const { data: mc } = await sb.from('config_valores').select('clave,valor').in('clave', [`msg_mail_${tipo}`, `msg_mail_${tipo}_subject`]);
          const mm: Record<string, string> = {};
          (mc || []).forEach((r: any) => { mm[r.clave] = r.valor; });
          introCfg = mm[`msg_mail_${tipo}`] || '';
          subjCfg = mm[`msg_mail_${tipo}_subject`] || '';
        } catch (_e) { /* usa defaults */ }
        const sub = (t: string) => String(t || '').replace(/\{(\w+)\}/g, (_m, k) => (k === 'nombre' ? (pn || '') : ''));
        const intro = introCfg ? sub(introCfg) : (tipo === 'cumple'
          ? '¡Recibimos tu solicitud de cumpleaños! 🎂 Muy pronto te escribimos para coordinar tu mesa, cover y todo lo demás para que la celebración sea inolvidable.'
          : tipo === 'reserva'
          ? '¡Recibimos tu reserva! 🍾 En breve te contactamos con disponibilidad y valores para tu grupo.'
          : '¡Bienvenid@ al Club FRATE! ⭐ Ya estás en nuestra base de beneficios y sorpresas.');
        const subj = subjCfg || (tipo === 'cumple' ? 'Tu cumpleaños en FRATE 🎂' : tipo === 'reserva' ? 'Tu reserva en FRATE 🍾' : 'Club FRATE ⭐');
        await mail(email, subj,
          `<div style="font-family:sans-serif;max-width:520px;background:#0a0a0b;color:#f4f4f5;padding:28px 24px;border-radius:12px;">
            <div style="font-weight:900;font-size:26px;letter-spacing:2px;">FRAT<span style="color:#E8363D;">E</span></div>
            <p style="font-size:15px;line-height:1.6;">${pn ? ('¡Hola ' + pn + '! ') : ''}${intro}</p>
            <p style="font-size:13px;color:#a1a1aa;line-height:1.6;">Si tienes apuro, escríbenos por WhatsApp al <b>+56 9 8131 1548</b> 🎧</p>
            <p style="font-size:11px;color:#52525b;margin-top:18px;">Fraternidad · Campus Central del carrete universitario · frate.cl</p>
          </div>`);
      }
    } catch (_e) { /* mejor esfuerzo */ }

    // ── avisar al ERP ────────────────────────────────────────
    // Antes esto NO existía: un cumpleaños entraba por acá y el ERP nunca se
    // enteraba. La pantalla del evento decía «Sin cumpleaños del CRM» mientras
    // la noche estaba llena.
    try {
      const pERP = formularioAPayloadERP({ ...baseRow, id: ins.id, gestion: {}, updated_at: new Date().toISOString() });
      if (pERP) await despacharWebhook(sb, pERP);
    } catch (e) { console.error('[form-submit] erp:', e); }

    return new Response(JSON.stringify({ ok: true, id: ins.id }), { headers: cors });
  } catch (err) {
    console.error('[form-submit]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
