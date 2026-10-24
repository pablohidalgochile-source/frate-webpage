// FRATE — Enlace firmado para que quien YA compró su entrada pueda sumar vasos.
//
// Mismo mecanismo que `baja.ts`, y por la misma razón: el token se deriva del
// correo con la llave de servicio, así que no se guarda nada en ninguna tabla y
// nadie puede fabricar el enlace de otra persona.
//
// ⚠️ El prefijo es DISTINTO del de baja a propósito. Con el mismo prefijo, el
//    token que va en el pie de cada campaña («no quiero más correos») serviría
//    también para comprar a nombre de esa persona, y al revés.
export async function tokenVaso(email: string): Promise<string> {
  const e = String(email || '').trim().toLowerCase();
  const clave = 'vaso:' + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(e));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Comparación en tiempo constante: comparar con === deja filtrar el token
// carácter por carácter midiendo cuánto tarda en responder.
export function tokenOk(a: string, b: string): boolean {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length || x.length === 0) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

export const VASO_PAGINA = 'https://www.frate.cl/vaso.html';
