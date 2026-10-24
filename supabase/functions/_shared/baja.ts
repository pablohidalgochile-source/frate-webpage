// FRATE — Enlace firmado para dejar de recibir correos masivos.
// El token se deriva del correo + la llave de servicio: no se guarda nada y
// nadie puede dar de baja a otra persona fabricando el enlace.
export async function tokenBaja(email: string): Promise<string> {
  const e = String(email || '').trim().toLowerCase();
  const clave = 'baja:' + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(e));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export const BAJA_FN = 'https://ydwlpraoaaijlfssevoh.supabase.co/functions/v1/correo-baja';
export const BAJA_PAGINA = 'https://www.frate.cl/baja.html';
