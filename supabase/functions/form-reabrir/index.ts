// ============================================================
// FRATE — Edge Function: form-reabrir (público, por token)
//
// Deja que la PERSONA complete su propia ficha. Nació para las fichas que
// crea el bot de WhatsApp: entran con cuatro datos y sin fecha, y hasta hoy
// sólo un admin podía arreglarlas a mano, una por una.
//
// GET  ?t=TOKEN          → { ok, tipo, datos }
// POST { t, datos }      → { ok, guardado:true }
//
// ⚠️ ESTE ENDPOINT MUESTRA DATOS PERSONALES A QUIEN TENGA LA URL.
//    Las defensas, y por qué cada una:
//      · El token lo emite un admin a propósito (form_emitir_token). Sin eso la
//        ficha no tiene token y no hay nada que abrir.
//      · 64 caracteres aleatorios: no se adivina ni se enumera.
//      · Caduca. Un token vencido responde igual que uno falso.
//      · Devuelve SÓLO `tipo` y `datos`. Nunca gestión, notas, historial, el id
//        interno ni el estado comercial: nada de eso es asunto del cliente.
//      · Al guardar NO se toca `estado` ni `gestion`: el cliente completa sus
//        datos, no mueve su solicitud de etapa.
//
// verify_jwt = false (público, como form-submit).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { despacharWebhook, formularioAPayloadERP } from '../_shared/crm.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Un token falso y uno vencido responden EXACTAMENTE igual: si el mensaje
// distinguiera, serviría para saber qué tokens existieron.
const NO = () => new Response(JSON.stringify({ error: 'link_invalido' }), { status: 404, headers: cors });

// Lo que el cliente puede escribir. Lista blanca a propósito: sin esto, un POST
// podría meter cualquier clave en `datos` y ensuciar la ficha para siempre.
const CAMPOS = new Set([
  'nombre', 'email', 'correo', 'whatsapp', 'telefono', 'instagram',
  'fecha_celebrar', 'fecha_evento', 'fecha_nac', 'invitados', 'personas',
  'mensaje', 'comentario', 'comentarios', 'zona_preferida', 'presupuesto',
  'gestor', 'gestor_instagram', 'quien_agenda', 'ocasion', 'institucion',
]);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const buscar = async (t: string) => {
    if (!t || t.length < 32 || !/^[a-f0-9]+$/i.test(t)) return null;
    const { data } = await sb.from('formularios')
      .select('id,tipo,datos,reabrir_exp')
      .eq('reabrir_token', t).maybeSingle();
    if (!data) return null;
    if (data.reabrir_exp && new Date(data.reabrir_exp).getTime() < Date.now()) return null;
    return data;
  };

  try {
    if (req.method === 'GET') {
      const t = new URL(req.url).searchParams.get('t') || '';
      const f = await buscar(t);
      if (!f) return NO();
      return new Response(JSON.stringify({ ok: true, tipo: f.tipo, datos: f.datos || {} }), { headers: cors });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const f = await buscar(String(body.t || ''));
      if (!f) return NO();

      const entra = body.datos && typeof body.datos === 'object' ? body.datos : {};
      const datos: Record<string, unknown> = { ...(f.datos || {}) };
      for (const k of Object.keys(entra)) {
        if (!CAMPOS.has(k)) continue;
        const v = entra[k];
        if (typeof v === 'string') { if (v.length > 600) continue; datos[k] = v.trim(); }
        else if (typeof v === 'number' || typeof v === 'boolean') datos[k] = v;
      }

      // Las columnas sueltas se derivan de `datos`, igual que en form-submit,
      // para que la ficha no quede diciendo dos cosas distintas.
      const nombre = String(datos.nombre || '').toUpperCase().trim() || null;
      const email = String(datos.email || datos.correo || '').toLowerCase().trim() || null;
      const telefono = String(datos.whatsapp || datos.telefono || '').trim() || null;
      const instagram = String(datos.instagram || '').replace(/^@/, '').trim() || null;
      if (email && !/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i.test(email)) {
        return new Response(JSON.stringify({ error: 'correo_invalido' }), { status: 400, headers: cors });
      }

      // Historial FRESCO: se relee para no pisar lo que anotó el equipo mientras
      // el cliente tenía el formulario abierto.
      const { data: fr } = await sb.from('formularios').select('historial').eq('id', f.id).maybeSingle();
      const hist = Array.isArray(fr?.historial) ? fr!.historial.slice() : [];
      hist.push({ ts: new Date().toISOString(), ev: 'completado por el cliente' });

      const { error } = await sb.from('formularios')
        .update({ datos, nombre, email, telefono, instagram, historial: hist, updated_at: new Date().toISOString() })
        .eq('id', f.id);
      if (error) throw error;

      // El ERP tiene que enterarse: si no, la ficha queda completa de este lado
      // y allá sigue sin fecha, que es justo el problema que vinimos a resolver.
      // Mejor esfuerzo: si falla, igual se guardó acá y la cola lo reintenta.
      try {
        const { data: completa } = await sb.from('formularios')
          .select('*').eq('id', f.id).maybeSingle();
        const pERP = completa ? formularioAPayloadERP(completa) : null;
        if (pERP) await despacharWebhook(sb, pERP);
      } catch (e) { console.error('[form-reabrir] webhook ERP:', e); }

      return new Response(JSON.stringify({ ok: true, guardado: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: 'metodo' }), { status: 405, headers: cors });
  } catch (e) {
    console.error('[form-reabrir]', e);
    return new Response(JSON.stringify({ error: 'error' }), { status: 500, headers: cors });
  }
});
