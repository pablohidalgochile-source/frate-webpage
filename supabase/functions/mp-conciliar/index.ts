// ============================================================
// FRATE — Edge Function: mp-conciliar (auto-sync 24/7)
// Pensada para un CRON. Lista los últimos pagos REALES de
// MercadoPago y, por cada APROBADO, le pide al webhook oficial
// (mp-webhook) que reconcilie ese pago: marca la orden pagada y
// reenvía el ticket con su QR. Idempotente (si ya está pagado, no
// hace nada). NO expone datos: solo devuelve un conteo.
//
// verify_jwt=false. Protección opcional por secreto:
//   si CRON_SECRET está seteado, hay que llamar con ?k=<secreto>.
// Secrets: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          CRON_SECRET (opcional)
// ============================================================

Deno.serve(async (req: Request) => {
  const cors = { 'Content-Type': 'application/json' };
  try {
    const url = new URL(req.url);
    const secret = Deno.env.get('CRON_SECRET');
    if (secret && url.searchParams.get('k') !== secret) {
      return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401, headers: cors });
    }

    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurada');
    const SUPA = Deno.env.get('SUPABASE_URL')!;

    const want = Math.min(Number(url.searchParams.get('n')) || 60, 200);

    // 1) Traer los últimos pagos de MP (paginado)
    let pagos: any[] = [];
    let offset = 0;
    while (pagos.length < want) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=50&offset=${offset}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Error consultando MercadoPago');
      const batch = data.results || [];
      pagos = pagos.concat(batch);
      const total = data.paging?.total ?? pagos.length;
      offset += batch.length;
      if (batch.length === 0 || pagos.length >= total || offset > 400) break;
    }
    pagos = pagos.slice(0, want);

    // 2) Por cada aprobado con orden asociada, pedir al webhook que reconcilie (idempotente)
    let revisados = 0, reconciliados = 0, fallidos = 0;
    for (const p of pagos) {
      if (p.status !== 'approved' || !p.external_reference) continue;
      revisados++;
      try {
        const w = await fetch(`${SUPA}/functions/v1/mp-webhook?type=payment&data.id=${encodeURIComponent(p.id)}`, { method: 'POST' });
        if (w.ok) reconciliados++; else fallidos++;
      } catch (_e) { fallidos++; }
    }

    return new Response(JSON.stringify({ ok: true, pagos_mp: pagos.length, aprobados_revisados: revisados, disparados: reconciliados, fallidos }), { headers: cors });
  } catch (err) {
    console.error('[mp-conciliar]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
