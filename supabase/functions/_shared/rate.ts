// ============================================================
// FRATE — Freno de intentos (rate limit) por IP.
// Ninguna edge function tenía límite: se podían recorrer órdenes ajenas,
// inscribir gente en masa o cosechar datos sin ningún costo.
//
// Falla ABIERTO a propósito: si el limitador falla o el SQL no está corrido,
// deja pasar. Nunca puede tumbar una venta por un problema suyo.
// ============================================================

export async function rateOk(
  sb: any, req: Request, prefijo: string, max = 10, seg = 300,
): Promise<boolean> {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
            || req.headers.get('cf-connecting-ip') || 'sin-ip';
    const { data, error } = await sb.rpc('rate_ok', { p_clave: `${prefijo}:${ip}`, p_max: max, p_seg: seg });
    if (error) return true;          // la función aún no existe → no frenar
    return data !== false;
  } catch (_) { return true; }
}

// Respuesta estándar cuando se pasó del límite.
export function demasiados(cors: Record<string, string>, msg?: string) {
  return new Response(
    JSON.stringify({ error: msg || 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }),
    { status: 429, headers: cors },
  );
}
