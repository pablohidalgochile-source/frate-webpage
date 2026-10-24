// ============================================================
// FRATE — Edge Function: ofrecer-reactivacion
// Tras un evento, el admin ofrece por correo a quienes NO usaron
// sus entradas convertirlas en crédito FRATE (ventana configurable).
// Solo admin. No cambia nada en la base: solo envía los correos;
// el cliente entra a su cuenta y toca "Reactivar".
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: cors });
    const { data: perfil } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    if (perfil?.rol !== 'admin') return new Response(JSON.stringify({ error: 'Solo admin' }), { status: 403, headers: cors });

    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) throw new Error('RESEND_API_KEY no configurada — no se pueden enviar correos');

    const { eventoId } = await req.json() as { eventoId: number };
    if (!eventoId) throw new Error('Falta eventoId');

    const [{ data: evento }, { data: items }, { data: cfgH }] = await Promise.all([
      admin.from('eventos').select('nombre, fecha').eq('id', eventoId).single(),
      admin.from('items_pedido').select('qr_ids, cantidad, pedidos!inner(id, estado, email_cliente, nombre_cliente, dev_estado)').eq('evento_id', eventoId).eq('pedidos.estado', 'pagado'),
      admin.from('config_valores').select('valor').eq('clave', 'reactivacion_horas').maybeSingle(),
    ]);
    if (!evento) throw new Error('Evento no encontrado');
    const ventana = parseInt(cfgH?.valor || '48') || 48;

    // QRs usados del evento
    const todosQR: string[] = (items || []).flatMap((ip: any) => Array.isArray(ip.qr_ids) ? ip.qr_ids : []);
    const usadosSet = new Set<string>();
    for (let i = 0; i < todosQR.length; i += 100) {
      const { data: us } = await admin.from('qr_usados').select('qr_id').in('qr_id', todosQR.slice(i, i + 100));
      (us || []).forEach((u: any) => usadosSet.add(u.qr_id));
    }

    // Pedidos con al menos 1 entrada SIN usar y sin solicitud previa (1 correo por pedido)
    const destinos = new Map<string, { nombre: string; orden: string }>();
    for (const ip of (items || []) as any[]) {
      const qrs: string[] = Array.isArray(ip.qr_ids) ? ip.qr_ids : [];
      const sinUsar = qrs.filter(q => !usadosSet.has(q)).length;
      const p = ip.pedidos;
      if (sinUsar > 0 && p?.email_cliente && !p?.dev_estado) {
        destinos.set(p.email_cliente, { nombre: p.nombre_cliente || '', orden: 'FCC-' + String(p.id).padStart(6, '0') });
      }
    }

    let enviados = 0;
    for (const [email, d] of destinos) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Frate Tickets <tickets@frate.cl>',
            to: [email],
            subject: `♻️ Tu entrada de ${evento.nombre} sigue valiendo — actívala`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
              <h2>FRATE</h2>
              <p>Hola ${d.nombre},</p>
              <p>Vimos que no alcanzaste a usar tu entrada de <b>${evento.nombre}</b> (orden ${d.orden}). ¡No la pierdas!</p>
              <p>Tienes <b>${ventana} horas</b> para convertirla en <b>crédito FRATE</b> y usarla en el evento que quieras:</p>
              <p>1. Entra a <a href="https://frate.cl">frate.cl</a> → Mi cuenta → Mis tickets<br/>
                 2. Toca <b>“♻️ Reactivar ticket no usado”</b><br/>
                 3. Te confirmamos por correo y el crédito queda en tu cuenta.</p>
              <p style="color:#888;font-size:12px;">Fraternidad Campus Central · Pío Nono 430, Bellavista</p>
            </div>`,
          }),
        });
        enviados++;
      } catch (e) { console.error('[ofrecer-reactivacion] mail a', email, e); }
    }

    return new Response(JSON.stringify({ ok: true, enviados, candidatos: destinos.size }), { headers: cors });

  } catch (err) {
    console.error('[ofrecer-reactivacion]', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500, headers: cors });
  }
});
