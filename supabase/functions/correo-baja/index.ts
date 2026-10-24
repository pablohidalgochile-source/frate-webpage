// ============================================================
// FRATE — Edge Function: correo-baja
// Deja de enviarle correos masivos a una persona. Sin sesión (el enlace llega
// por correo), pero el enlace va firmado (tokenBaja): no se puede dar de baja
// a otro. Acepta:
//   · POST one-click de Gmail/Yahoo (List-Unsubscribe-Post) con ?e=&t= en la URL
//   · POST JSON {e, t} desde frate.cl/baja.html
// Deploy: --no-verify-jwt (Gmail no manda autorización).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tokenBaja, BAJA_PAGINA } from '../_shared/baja.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Abrir el enlace en el navegador lleva a la página que pide confirmar (un GET no da de baja).
  if (req.method === 'GET') {
    const u = new URL(req.url);
    return Response.redirect(`${BAJA_PAGINA}?e=${encodeURIComponent(u.searchParams.get('e') || '')}&t=${encodeURIComponent(u.searchParams.get('t') || '')}`, 302);
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Usa el enlace del correo.' }), { status: 405, headers: cors });
  try {
    const url = new URL(req.url);
    let e = url.searchParams.get('e') || '', t = url.searchParams.get('t') || '', origen = 'one-click';
    if (!e || !t) {
      const body = await req.json().catch(() => ({})) as { e?: string; t?: string };
      e = String(body.e || ''); t = String(body.t || ''); origen = 'pagina';
    }
    const email = e.trim().toLowerCase();
    if (!email || !t || t !== await tokenBaja(email)) {
      return new Response(JSON.stringify({ error: 'Enlace no válido.' }), { status: 400, headers: cors });
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await sb.from('correo_bajas').upsert({ email, origen }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, email }), { headers: cors });
  } catch (err) {
    console.error('[correo-baja]', err);
    return new Response(JSON.stringify({ error: 'No se pudo procesar. Escríbenos a hola@frate.cl.' }), { status: 500, headers: cors });
  }
});
