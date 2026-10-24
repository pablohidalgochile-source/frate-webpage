// ============================================================
// FRATE — email-check (PÚBLICA): valida un correo antes de comprar/registrarse.
//   • formato        → regex
//   • dominio real   → MX (o A de respaldo) vía DNS. Caza @gmail.con, dominios inventados.
//   • sugerencia     → typo de dominio (gmial→gmail, hotmial→hotmail, .con→.com)
// Devuelve { ok, formato, mx, sugerencia }. verify_jwt=false. Sin secrets.
// ============================================================
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });

// MISMA lógica que frate-email.js (deben coincidir: el hint lo muestra el server
// y al tocarlo aplica el cliente). Solo errores de tipeo CONOCIDOS de proveedores
// masivos — jamás "corregir" un dominio universitario o corporativo real.
const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmali.com': 'gmail.com', 'gmail.cl': 'gmail.com', 'gmil.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotnail.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmaill.com': 'hotmail.com', 'hormail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com', 'oulook.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'iclould.com': 'icloud.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com',
  'duocuc.com': 'duocuc.cl', 'usach.com': 'usach.cl',
};
const SLD_OK = ['gmail', 'hotmail', 'outlook', 'yahoo', 'icloud', 'live'];
const TLD_MAL: Record<string, string> = { con: 'com', cmo: 'com', vom: 'com', xom: 'com', om: 'com', comm: 'com', coom: 'com', cm: 'com', ocm: 'com' };

function sugerirDominio(dom: string): string | null {
  dom = dom.toLowerCase();
  if (TYPOS[dom]) return TYPOS[dom];
  const i = dom.lastIndexOf('.');
  if (i < 1) return null;
  const sld = dom.slice(0, i), tld = dom.slice(i + 1);
  if (SLD_OK.includes(sld) && TLD_MAL[tld]) return sld + '.' + TLD_MAL[tld];
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { email } = await req.json().catch(() => ({}));
    const raw = String(email || '').trim();
    const formato = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
    if (!formato) return j({ ok: false, formato: false, mx: false, sugerencia: null, msg: 'El correo no tiene un formato válido.' });

    const dom = raw.split('@')[1].toLowerCase();
    const sugerencia = sugerirDominio(dom);

    let mx = false;
    try {
      const recs = await Deno.resolveDns(dom, 'MX');
      mx = Array.isArray(recs) && recs.length > 0;
    } catch (_) { mx = false; }
    if (!mx) { try { const a = await Deno.resolveDns(dom, 'A'); mx = Array.isArray(a) && a.length > 0; } catch (_) { /* sin A tampoco */ } }

    return j({ ok: formato && mx, formato, mx, sugerencia, msg: !mx ? 'Ese dominio de correo no existe o no recibe correos.' : (sugerencia ? '¿Quisiste decir ' + raw.split('@')[0] + '@' + sugerencia + '?' : '') });
  } catch (e) { return j({ ok: false, error: String((e as any)?.message || e) }, 200); }
});
