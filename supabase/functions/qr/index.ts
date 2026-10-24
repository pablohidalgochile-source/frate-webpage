// ============================================================
// FRATE — Edge Function: qr
// Genera la imagen del QR en NUESTRO dominio (ya no en un tercero
// como api.qrserver.com). El token viaja solo a nuestra infra.
// Público (verify_jwt=false): renderiza el QR del texto que se le pasa;
// no expone ni enumera nada (hay que conocer el token para pedirlo).
//   GET /functions/v1/qr?d=<texto>&s=<tamaño opcional>
// ============================================================

import { qrcode } from 'https://deno.land/x/qrcode@v2.0.0/mod.ts';

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const d = url.searchParams.get('d');
    if (!d) return new Response('missing d', { status: 400, headers: cors });
    const size = Math.min(600, Math.max(120, Number(url.searchParams.get('s')) || 300));

    const dataUrl = await qrcode(d, { size });            // "data:image/gif;base64,...."
    const comma = dataUrl.indexOf(',');
    const mime = (dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/gif');
    const b64 = dataUrl.slice(comma + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    return new Response(bytes, {
      headers: {
        ...cors,
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    console.error('[qr]', e);
    return new Response('qr error', { status: 500, headers: cors });
  }
});
