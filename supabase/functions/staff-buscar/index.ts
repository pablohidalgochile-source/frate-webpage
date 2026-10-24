// ============================================================
// FRATE — staff-buscar: busca en el STAFF del ERP (tabla `personal`)
// para el autocompletar de cortesías/reservas de la WEB.
// Las credenciales del ERP viven como SECRETOS del lado servidor
// (ERP_URL, ERP_ANON_KEY) → NO se exponen en el navegador.
// Solo devuelve campos SEGUROS (nombre, rut, email, teléfono, área).
// Nunca sueldos, cuentas ni datos médicos.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { permitirStaffOServicio } from "../_shared/guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 🔒 Datos personales de trabajadores (RUT, teléfono, correo) — Ley 19.628.
  //    Antes esto entregaba la nómina completa del personal a cualquiera.
  const permiso = await permitirStaffOServicio(req);
  if (!permiso.ok) return new Response(JSON.stringify({ error: permiso.error }), { status: permiso.status, headers: cors });

  try {
    const url = new URL(req.url);
    let q = url.searchParams.get("q") || "";
    if (req.method === "POST") { try { const b = await req.json(); if (b && b.q) q = b.q; } catch (_) { /* body opcional */ } }
    q = String(q || "").trim();
    // Sin término de búsqueda no se entrega la nómina entera
    if (q.length < 2) return new Response(JSON.stringify({ ok: true, staff: [] }), { headers: cors });

    const ERP = Deno.env.get("ERP_URL");
    const KEY = Deno.env.get("ERP_ANON_KEY");
    if (!ERP || !KEY) return new Response(JSON.stringify({ error: "ERP no configurado (faltan secretos ERP_URL/ERP_ANON_KEY)" }), { status: 500, headers: cors });

    // SOLO columnas seguras
    const cols = "id,nombre,nombres,apellido1,apellido2,rut,email,telefono,telefono_whatsapp,area,posicion,instagram,estado";
    let endpoint = `${ERP}/rest/v1/personal?select=${cols}&order=nombre&limit=60`;
    if (q.length >= 2) {
      const like = `*${q.replace(/[*,()]/g, " ")}*`;
      const orf = ["nombre", "rut", "email", "telefono", "instagram", "apellido1", "nombres"].map((c) => `${c}.ilike.${like}`).join(",");
      endpoint = `${ERP}/rest/v1/personal?select=${cols}&or=(${orf})&order=nombre&limit=60`;
    }

    const r = await fetch(endpoint, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) { const t = await r.text(); return new Response(JSON.stringify({ error: "ERP " + r.status, detail: t.slice(0, 200) }), { status: 502, headers: cors }); }
    const rows = await r.json();

    // deno-lint-ignore no-explicit-any
    const staff = (rows || []).map((p: any) => {
      const nom = (p.nombre || [p.nombres, p.apellido1, p.apellido2].filter(Boolean).join(" ") || "").trim();
      return {
        _staff: true, id: "erp-" + p.id, nombre: nom,
        rut: p.rut || "", email: p.email || "",
        telefono: p.telefono || p.telefono_whatsapp || "",
        instagram: p.instagram || "", area: p.area || p.posicion || "", estado: p.estado || "",
      };
    }).filter((x: { nombre: string }) => x.nombre);

    return new Response(JSON.stringify({ ok: true, staff }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
