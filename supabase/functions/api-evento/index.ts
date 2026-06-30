// ============================================================
// FRATE — Edge Function: api-evento (API para el ERP)
// Entrega los datos OPERATIVOS de un evento en JSON, listo para
// que el ERP / sistema de la noche los consuma.
//
// Seguridad: requiere el header  x-api-key: <ERP_API_KEY>
//
// Uso:
//   GET  /functions/v1/api-evento?evento_id=5
//   POST /functions/v1/api-evento   body { evento_id: 5 }
//
// Secrets: ERP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy SIN verificación de JWT (verify_jwt=false) — usa su propia
// API key. Ver config.toml.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── Autenticación por API key ────────────────────────────
    const ERP_KEY = Deno.env.get('ERP_API_KEY');
    if (!ERP_KEY) return j({ error: 'ERP_API_KEY no configurada' }, 500, cors);
    const sent = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('api_key') || '';
    if (sent !== ERP_KEY) return j({ error: 'No autorizado' }, 401, cors);

    // ── Evento solicitado ────────────────────────────────────
    let eventoId: number | null = null;
    if (req.method === 'POST') { const b = await req.json().catch(() => ({})); eventoId = Number(b.evento_id) || null; }
    else { eventoId = Number(new URL(req.url).searchParams.get('evento_id')) || null; }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Sin evento_id → devolver la LISTA de eventos (para el selector del ERP)
    if (!eventoId) {
      const { data: eventos } = await sb.from('eventos').select('id, nombre, fecha, hora, activo').order('fecha', { ascending: false });
      return j({ ok: true, eventos: eventos || [] }, 200, cors);
    }

    const [{ data: evento }, { data: tipos }, { data: items }, { data: usados }] = await Promise.all([
      sb.from('eventos').select('id, nombre, fecha, hora, ambiente').eq('id', eventoId).maybeSingle(),
      sb.from('tipos_ticket').select('id, nombre, precio, disponible').eq('evento_id', eventoId),
      sb.from('items_pedido').select('tipo_ticket_id, nombre_ticket, cantidad, precio_unitario, personas, qr_ids, pedidos!inner(estado)').eq('evento_id', eventoId).eq('pedidos.estado', 'pagado'),
      sb.from('qr_usados').select('qr_id, created_at'),
    ]);

    if (!evento) return j({ error: 'Evento no encontrado' }, 404, cors);

    const usadosMap = new Map((usados || []).map((u: any) => [String(u.qr_id).toUpperCase(), u.created_at]));

    // Por tipo de ticket
    const porTipo: Record<number, any> = {};
    (tipos || []).forEach((t: any) => { porTipo[t.id] = { id: t.id, nombre: t.nombre, precio: t.precio, disponible: t.disponible, vendidos: 0, ingresos: 0 }; });

    // Asistentes (1 fila por QR) + check-ins
    const asistentes: any[] = [];
    let ingresosTotal = 0, checkIns = 0;
    for (const ip of (items || []) as any[]) {
      const qrIds = Array.isArray(ip.qr_ids) ? ip.qr_ids : [];
      const personas = Array.isArray(ip.personas) ? ip.personas : [];
      if (ip.tipo_ticket_id && porTipo[ip.tipo_ticket_id]) {
        porTipo[ip.tipo_ticket_id].vendidos += ip.cantidad || 0;
        porTipo[ip.tipo_ticket_id].ingresos += (ip.precio_unitario || 0) * (ip.cantidad || 0);
      }
      ingresosTotal += (ip.precio_unitario || 0) * (ip.cantidad || 0);
      qrIds.forEach((qr: string, i: number) => {
        const escaneado = usadosMap.get(String(qr).toUpperCase()) || null;
        if (escaneado) checkIns++;
        asistentes.push({
          qr_id: qr,
          nombre: personas[i]?.nombre || '',
          rut: personas[i]?.rut || '',
          tipo: ip.nombre_ticket || '',
          ingresado: !!escaneado,
          ingreso_at: escaneado,
        });
      });
    }

    const entradasVendidas = asistentes.length;

    return j({
      ok: true,
      evento: { id: evento.id, nombre: evento.nombre, fecha: evento.fecha, hora: evento.hora, ambiente: evento.ambiente },
      resumen: {
        entradas_vendidas: entradasVendidas,
        ingresos_total: ingresosTotal,
        check_ins: checkIns,
        pendientes_ingreso: entradasVendidas - checkIns,
      },
      tipos: Object.values(porTipo),
      asistentes,
      generado_at: new Date().toISOString(),
    }, 200, cors);
  } catch (err) {
    console.error('[api-evento]', err);
    return j({ error: String(err?.message || err) }, 500, cors);
  }
});

function j(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), { status, headers: cors });
}
