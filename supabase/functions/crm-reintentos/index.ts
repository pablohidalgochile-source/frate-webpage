// ============================================================
// FRATE — Edge Function: crm-reintentos
// Drena la cola crm_webhooks_pendientes hacia el ERP con backoff
// exponencial (5m → 15m → 45m → 2h, máx 10 intentos → 'fallido').
// La llama pg_cron cada 5 minutos y el botón del admin web.
// Auto-limitada e idempotente en el destino (upsert por web_id).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { enviarWebhookERP } from '../_shared/crm.ts';

const BACKOFF_MIN = [5, 15, 45, 120, 240, 480, 720, 960, 1200, 1440];

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: pendientes } = await sb.from('crm_webhooks_pendientes')
      .select('*').eq('estado', 'pendiente')
      .lte('proximo_intento', new Date().toISOString())
      .order('created_at').limit(40);

    let enviados = 0, fallidos = 0;
    for (const w of (pendientes || [])) {
      const r = await enviarWebhookERP(w.payload);
      if (r.ok) {
        await sb.from('crm_webhooks_pendientes').update({ estado: 'enviado', ultimo_error: null }).eq('id', w.id);
        enviados++;
      } else {
        const intentos = (w.intentos || 1) + 1;
        if (intentos >= 10) {
          await sb.from('crm_webhooks_pendientes').update({ estado: 'fallido', intentos, ultimo_error: r.error || 'error' }).eq('id', w.id);
          fallidos++;
        } else {
          const espera = BACKOFF_MIN[Math.min(intentos - 1, BACKOFF_MIN.length - 1)];
          await sb.from('crm_webhooks_pendientes').update({
            intentos, ultimo_error: r.error || 'error',
            proximo_intento: new Date(Date.now() + espera * 60 * 1000).toISOString(),
          }).eq('id', w.id);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, procesados: (pendientes || []).length, enviados, fallidos }), { headers: cors });
  } catch (err) {
    console.error('[crm-reintentos]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
