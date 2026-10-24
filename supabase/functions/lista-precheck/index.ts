// ============================================================
// FRATE — Edge Function: lista-precheck
// Pre-análisis IA de una lista de cortesía: infiere el GÉNERO
// probable del nombre de pila (lo único que necesita el LLM).
// RUT/DV, edad y duplicados los calcula el cliente (admin.html),
// determinista y sin costo.
//
// verify_jwt=false; exige JWT de admin o rrpp (candado propio).
// Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST { personas: [{ nombre }] }  (máx 800)
// →    { ok, resultados: [{ i, genero_probable:'F'|'M'|'X', confianza:0..1 }] }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const normRut = (s: string) => String(s || '').toUpperCase().replace(/[.\-\s]/g, '');

// Veto por LOTE: mandamos la nómina {rut,nombre} al ERP (el veto parte por NOMBRE) y
// devuelve { "<rut>": {vetado,motivo,frecuente,historial} }, keyed por RUT.
// No-op mientras no estén ERP_VETO_URL + la llave (el dueño las instala). Nunca bloquea el pre-análisis.
// deno-lint-ignore no-explicit-any
async function chequearVetos(nomina: { rut: string; nombre: string }[]): Promise<Record<string, any>> {
  const url = Deno.env.get('ERP_VETO_URL');
  const key = Deno.env.get('ERP_API_KEY') || Deno.env.get('CRM_WEBHOOK_KEY');
  if (!url || !key || !nomina.length) return {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ personas: nomina }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return {};
    const d = await r.json().catch(() => ({}));
    const raw = (d && (d.vetos || d.resultados || d)) || {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(raw)) out[normRut(k)] = raw[k];
    return out;
  } catch (_e) { return {}; }
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
    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_KEY) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY no configurada' }), { status: 503, headers: cors });
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Candado: solo admin / rrpp (verify_jwt=false ⇒ lo validamos acá) ──
    let rol = '';
    try {
      const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (jwt) {
        const { data: u } = await sb.auth.getUser(jwt);
        if (u?.user?.id) {
          const { data: perfil } = await sb.from('clientes').select('rol').eq('id', u.user.id).maybeSingle();
          rol = perfil?.rol || '';
        }
      }
    } catch (_e) { /* sin sesión */ }
    if (!['admin', 'rrpp'].includes(rol)) {
      return new Response(JSON.stringify({ error: 'Solo admin o RRPP.' }), { status: 403, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    const personas = Array.isArray(body.personas) ? body.personas.slice(0, 800) : [];
    const wantGenero = body.genero !== false;   // el cliente pide género sí/no; el veto va siempre (si está configurado)
    if (!personas.length) return new Response(JSON.stringify({ error: 'Sin personas' }), { status: 400, headers: cors });

    // deno-lint-ignore no-explicit-any
    const resultados: any[] = [];
    const CHUNK = 100;

    if (wantGenero) for (let c = 0; c < personas.length; c += CHUNK) {
      const chunk = personas.slice(c, c + CHUNK);
      const lista = chunk.map((p: any, idx: number) => ({ i: c + idx, n: String(p?.nombre || '').trim().slice(0, 60) }));

      const userPrompt = `Clasifica el género probable del PRIMER NOMBRE (nombre de pila) de cada persona chilena.
Devuelve SOLO JSON con esta forma exacta: {"r":[{"i":<i>,"g":"F"|"M"|"X","c":<0..1>}]}
Donde g = F (femenino), M (masculino) o X (unisex/ambiguo/no determinable), y c = confianza entre 0 y 1.
Considera nombres chilenos comunes y compuestos (ej. "María José"=F, "José María"=M, "Ariel"=X, "Cami"=F).

Personas:
${JSON.stringify(lista)}`;

      let parsed: any[] = [];
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Eres un clasificador de género por nombre de pila chileno. Respondes SOLO con JSON válido, sin texto extra.' },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
          }),
        });
        const data = await r.json();
        if (!r.ok) { console.error('[lista-precheck] OpenAI:', data?.error?.message || r.status); }
        else { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}').r || []; }
      } catch (e) { console.error('[lista-precheck] chunk:', e); }

      const byI = new Map(parsed.map((x: any) => [x.i, x]));
      chunk.forEach((_: any, idx: number) => {
        const x: any = byI.get(c + idx) || {};
        const g = ['F', 'M', 'X'].includes(x.g) ? x.g : 'X';
        const cf = typeof x.c === 'number' ? Math.max(0, Math.min(1, x.c)) : 0;
        resultados.push({ i: c + idx, genero_probable: g, confianza: cf });
      });
    }
    else {
      personas.forEach((_: any, i: number) => resultados.push({ i, genero_probable: 'X', confianza: 0 }));
    }

    // ── Veto por LOTE contra el ERP (si está configurado; si no, no-op) ──
    const nomina = personas.map((p: any) => ({ rut: String(p?.rut || ''), nombre: String(p?.nombre || '') })).filter((x: any) => x.rut || x.nombre);
    const vetos = await chequearVetos(nomina);
    if (Object.keys(vetos).length) {
      personas.forEach((p: any, i: number) => {
        const v = vetos[normRut(String(p?.rut || ''))];
        if (v && resultados[i]) resultados[i].veto = v;
      });
    }

    return new Response(JSON.stringify({ ok: true, resultados }), { headers: cors });

  } catch (err) {
    console.error('[lista-precheck]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
