// ============================================================
// FRATE — Guardia compartido para edge functions privilegiadas.
//
// OJO: `verify_jwt = true` NO autentica en este proyecto: la llave pública
// (sb_publishable_…) está en el HTML del sitio, así que cualquiera la copia
// y pasa ese filtro. Por eso hay que validar ADENTRO quién llama.
//
// permitirStaffOServicio() acepta exactamente dos orígenes:
//   1. El propio backend (otra edge function) con SUPABASE_SERVICE_ROLE_KEY.
//   2. Un humano del staff logueado (clientes.rol admin/portero/rrpp).
// Cualquier otra cosa → 401/403.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type Veredicto = { ok: true; via: 'servicio' | 'staff'; uid?: string; rol?: string }
                      | { ok: false; status: number; error: string };

export async function permitirStaffOServicio(
  req: Request,
  roles: string[] = ['admin', 'portero', 'rrpp'],
): Promise<Veredicto> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'No autorizado' };

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  // 1) llamada interna del backend
  if (service && token === service) return { ok: true, via: 'servicio' };

  // 2) staff logueado de verdad
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, service);
    const { data: u } = await admin.auth.getUser(token);
    const uid = u?.user?.id;
    if (!uid) return { ok: false, status: 401, error: 'No autorizado' };
    const { data: c } = await admin.from('clientes').select('rol').eq('id', uid).maybeSingle();
    const rol = String(c?.rol || '');
    if (roles.includes(rol)) return { ok: true, via: 'staff', uid, rol };
    return { ok: false, status: 403, error: 'Solo personal autorizado' };
  } catch (_) {
    return { ok: false, status: 401, error: 'No autorizado' };
  }
}

// Token corto e irreproducible para los links de "retoma tu compra" del correo.
// Se deriva del pedido + la llave de servicio, así que no hay que guardar nada
// en la base y no se puede fabricar desde afuera.
export async function tokenPedido(id: number | string, createdAt: string): Promise<string> {
  const semilla = `${id}:${createdAt}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semilla));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Devuelve el CORREO del usuario logueado (o null). Sirve para permitir que
// alguien se mande algo a sí mismo sin abrir el endpoint a todo el mundo.
export async function emailDelToken(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (service && token === service) return null;
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, service);
    const { data: u } = await admin.auth.getUser(token);
    return u?.user?.email ?? null;
  } catch (_) { return null; }
}

// Devuelve el uid del usuario logueado, o null si no hay sesión válida.
// Se usa para NO confiar en el clienteId que manda el navegador.
export async function uidDelToken(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (service && token === service) return null;   // el backend no "es" un usuario
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, service);
    const { data: u } = await admin.auth.getUser(token);
    return u?.user?.id ?? null;
  } catch (_) { return null; }
}
