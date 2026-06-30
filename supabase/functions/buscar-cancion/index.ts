// ============================================================
// FRATE — Edge Function: buscar-cancion
// Proxy a la API pública de Deezer para buscar canciones reales
// (título, artista, carátula, preview de 30s). Sin claves ni CORS.
// ============================================================

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    let q = '';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      q = (body.q || '').trim();
    } else {
      q = (new URL(req.url).searchParams.get('q') || '').trim();
    }
    if (!q) return new Response(JSON.stringify({ results: [] }), { headers: cors });

    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`);
    const data = await res.json();

    const results = (data?.data || []).map((t: any) => ({
      deezer_id: String(t.id),
      titulo:    t.title,
      artista:   t.artist?.name || '',
      album:     t.album?.title || '',
      cover:     t.album?.cover_medium || t.album?.cover || '',
      preview:   t.preview || '',
    }));

    return new Response(JSON.stringify({ results }), { headers: cors });
  } catch (err) {
    console.error('[buscar-cancion]', err);
    return new Response(JSON.stringify({ results: [], error: String(err) }), { status: 200, headers: cors });
  }
});
