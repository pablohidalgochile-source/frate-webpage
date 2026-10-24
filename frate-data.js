// ============================================================
// FRATE DATA — Config del sitio + datos de respaldo
// Los eventos, tiendita, carta, webeum y ambientes se cargan
// EN VIVO desde Supabase (sbGetEventos, sbGetTiendita, etc.).
// Estos arrays quedan VACÍOS a propósito: así no aparece data
// de ejemplo "flasheando" antes de que llegue lo real, y si
// Supabase no responde, la sección simplemente sale vacía.
// ============================================================

const FRATE_CONFIG = {
  nombre: "Fraternidad Campus Central",
  tagline: "Tu Campus Central del Carrete Universitario",
  subtitulo: "Barrio Bellavista, Santiago · Desde 2013",
  direccion: "Pío Nono #430, Recoleta, Región Metropolitana",
  codigoPostal: "8420541",
  mapsUrl: "https://www.google.com/maps/place/P%C3%ADo+Nono+430",
  horario: "Jue–Sáb desde las 23:00 hrs",
  telefono: "+56 9 8131 1548",
  whatsapp: "56981311548",
  instagram: "https://www.instagram.com/fraternidadcampuscentral/",
  instagramHandle: "@fraternidadcampuscentral",
  youtube: "https://www.youtube.com/@fraternidadcampuscentral",
  facebook: "https://www.facebook.com/fraternidadclub"
};

// Eventos — se cargan desde Supabase (loadEventosDesdeSupabase).
var FRATE_EVENTOS = [];

// Ambientes — se cargan desde Supabase (sbGetAmbientes).
const FRATE_AMBIENTES = [];

// WEBEUM (videos) — se cargan desde Supabase (sbGetWebeum).
const FRATE_WEBEUM = [];

// Números de "Nosotros" — texto de marca (editable si quieres).
const FRATE_STATS = [
  { numero: "13", label: "Años de historia" },
  { numero: "+2.000", label: "Eventos realizados" },
  { numero: "+2M", label: "Visitantes desde 2013" },
  { numero: "3", label: "Ambientes únicos" }
];

// Galería — se llena desde Media/Storage.
const FRATE_GALERIA = [];

// La Tiendita — se carga desde Supabase (sbGetTiendita).
const FRATE_TIENDITA = [];

// Carta — se carga desde Supabase (sbGetCarta).
const FRATE_CARTA = [];

// Membresías — se administran desde el panel (ocultas por defecto).
const FRATE_MEMBRESIAS = [];
