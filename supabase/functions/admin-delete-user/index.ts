// ============================================================
// FRATE — Edge Function: admin-delete-user
// Elimina permanentemente un usuario (auth + clientes + cascada)
// Requiere: caller debe ser admin (verificado via JWT)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    // 1) Verificar que el caller es admin
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) throw new Error('No autorizado');

    // Cliente con el JWT del caller para validar quién es
    const sbUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    });
    const { data: { user: caller } } = await sbUser.auth.getUser(jwt);
    if (!caller) throw new Error('Sesión inválida');

    // Verificar que el caller tiene rol admin
    const { data: callerProfile } = await sbUser
      .from('clientes').select('rol').eq('id', caller.id).single();
    if (callerProfile?.rol !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo administradores pueden eliminar usuarios' }), { status: 403, headers: corsHeaders });
    }

    // 2) Obtener userId a eliminar del body
    const { userId } = await req.json();
    if (!userId) throw new Error('userId requerido');

    // Prevenir que admin se elimine a sí mismo
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'No puedes eliminar tu propia cuenta' }), { status: 400, headers: corsHeaders });
    }

    // 3) Cliente con service_role para eliminar
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 3a) Eliminar registros relacionados manualmente (los que tienen ON DELETE no se eliminan en cascada por defecto en clientes)
    // pedidos.cliente_id se queda como NULL (no ON DELETE CASCADE)
    // Setear cliente_id en null para preservar registros históricos
    await sbAdmin.from('pedidos').update({ cliente_id: null }).eq('cliente_id', userId);
    await sbAdmin.from('reservas').update({ cliente_id: null }).eq('cliente_id', userId);

    // 3b) Eliminar perfil en clientes
    const { error: e1 } = await sbAdmin.from('clientes').delete().eq('id', userId);
    if (e1) console.warn('[admin-delete-user] clientes delete:', e1.message);

    // 3c) Eliminar de auth.users (esto es lo crítico)
    const { error: e2 } = await sbAdmin.auth.admin.deleteUser(userId);
    if (e2) throw new Error('Error al eliminar auth: ' + e2.message);

    return new Response(JSON.stringify({ ok: true, deleted: userId }), { headers: corsHeaders });
  } catch (err) {
    console.error('[admin-delete-user]', err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 500, headers: corsHeaders });
  }
});
