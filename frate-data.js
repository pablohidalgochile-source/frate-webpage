// ============================================================
// FRATE DATA v3 — Ticket types, Tiendita, Carta
// ============================================================

const FRATE_CONFIG = {
  nombre: "Fraternidad Campus Central",
  tagline: "Tu Campus Central del Carrete Universitario",
  subtitulo: "Barrio Bellavista, Santiago · Desde 2013",
  direccion: "Pío Nono #430, Recoleta, Región Metropolitana",
  codigoPostal: "8420541",
  mapsUrl: "https://www.google.com/maps/place/P%C3%ADo+Nono+430",
  horario: "Jue–Sáb desde las 23:00 hrs",
  telefono: "+56 9 1234 5678",
  whatsapp: "56912345678",
  instagram: "https://www.instagram.com/fraternidadcampuscentral/",
  instagramHandle: "@fraternidadcampuscentral",
  youtube: "https://www.youtube.com/@fraternidadcampuscentral",
  facebook: "https://www.facebook.com/fraternidadclub"
};

// Tipos de ticket por evento — administrados desde el ERP
// Estado: Activo | Agotado | Cortesía | Cerrado | Solo venta WEB | Venta solo RRPP | Oculto | Venta Efectivo | Venta Abonados
// Solo se muestran en la web los que tienen soloWeb:true y estado "Activo" o "Solo venta WEB"

const FRATE_EVENTOS = [
  {
    id: 1,
    nombre: "TRAP JUEVES",
    fecha: "Jueves 1 Mayo",
    hora: "23:00",
    djs: ["DJ KRE", "BASTIAN", "FLOW MAXI"],
    tipo: "Viernes",
    ambiente: "Fuego",
    destacado: true,
    imagen_color: "#1a0a0b",
    tiposTicket: [
      { id:"tt-1-1", nombre:"Pre-Venta MUJER", descripcion:"Exclusivo para mujeres. Presenta C.I. al ingreso.", precio:3000, disponible:80, total:100, comprados:20, estado:"Activo", soloWeb:true, maxPorCompra:4, genero:"F" },
      { id:"tt-1-2", nombre:"Pre-Venta HOMBRE UNIVERSITARIO", descripcion:"Exclusivo universitarios. Presenta C.I. + credencial univ.", precio:4000, disponible:50, total:80, comprados:30, estado:"Activo", soloWeb:true, maxPorCompra:4, genero:"M" },
      { id:"tt-1-3", nombre:"General", descripcion:"Entrada general sin restricción.", precio:5000, disponible:100, total:150, comprados:50, estado:"Activo", soloWeb:true, maxPorCompra:6, genero:"" },
      { id:"tt-1-4", nombre:"Lista Staff", descripcion:"Cortesía para staff.", precio:0, disponible:10, total:10, comprados:0, estado:"Cortesía", soloWeb:false, maxPorCompra:2, genero:"" }
    ]
  },
  {
    id: 2,
    nombre: "REGGAETON VIERNES",
    fecha: "Viernes 2 Mayo",
    hora: "00:00",
    djs: ["DJ PABLOX", "NOCHE CREW"],
    tipo: "Viernes",
    ambiente: "Aire",
    destacado: true,
    imagen_color: "#0a0f1a",
    tiposTicket: [
      { id:"tt-2-1", nombre:"Pre-Venta PRO MUJER", descripcion:"Mejor precio anticipado para mujeres.", precio:4000, disponible:104, total:190, comprados:86, estado:"Activo", soloWeb:true, maxPorCompra:6, genero:"F" },
      { id:"tt-2-2", nombre:"Pre-Venta REBAJADA MUJER", descripcion:"Precio especial limitado.", precio:3500, disponible:0, total:30, comprados:30, estado:"Agotado", soloWeb:true, maxPorCompra:4, genero:"F" },
      { id:"tt-2-3", nombre:"Pre-Venta PRO HOMBRE UNIV.", descripcion:"Para universitarios con credencial.", precio:5000, disponible:52, total:120, comprados:68, estado:"Activo", soloWeb:true, maxPorCompra:4, genero:"M" },
      { id:"tt-2-4", nombre:"General", descripcion:"Entrada general.", precio:6000, disponible:200, total:200, comprados:0, estado:"Activo", soloWeb:true, maxPorCompra:10, genero:"" }
    ]
  },
  {
    id: 3,
    nombre: "SÁBADO UNIVERSITARIO",
    fecha: "Sábado 3 Mayo",
    hora: "23:30",
    djs: ["MAKINA", "TANO MC", "DJ VALE"],
    tipo: "Sábado",
    ambiente: "Tierra",
    destacado: true,
    imagen_color: "#0f0a1a",
    tiposTicket: [
      { id:"tt-3-1", nombre:"Pre-Venta GRAL. MUJER", descripcion:"Para mujeres. Presenta C.I.", precio:5000, disponible:0, total:30, comprados:30, estado:"Agotado", soloWeb:true, maxPorCompra:4, genero:"F" },
      { id:"tt-3-2", nombre:"Pre-Venta GRAL. HOMBRE UNIV.", descripcion:"Universitarios con credencial.", precio:6000, disponible:7, total:30, comprados:23, estado:"Activo", soloWeb:true, maxPorCompra:4, genero:"M" },
      { id:"tt-3-3", nombre:"General", descripcion:"Entrada general.", precio:7000, disponible:150, total:200, comprados:50, estado:"Activo", soloWeb:true, maxPorCompra:6, genero:"" }
    ]
  },
  {
    id: 4,
    nombre: "AFROBEATS NIGHT",
    fecha: "Viernes 9 Mayo",
    hora: "23:00",
    djs: ["AFRO KING", "LAGOS SET"],
    tipo: "Especiales",
    ambiente: "Fuego",
    destacado: false,
    imagen_color: "#1a100a",
    tiposTicket: [
      { id:"tt-4-1", nombre:"Pre-Venta Anticipada", descripcion:"Precio especial preventa.", precio:6000, disponible:80, total:100, comprados:20, estado:"Activo", soloWeb:true, maxPorCompra:6, genero:"" },
      { id:"tt-4-2", nombre:"General", descripcion:"Entrada general.", precio:8000, disponible:200, total:250, comprados:50, estado:"Activo", soloWeb:true, maxPorCompra:10, genero:"" }
    ]
  }
];

const FRATE_AMBIENTES = [
  { id:"fuego", nombre:"FUEGO", descripcion:"El corazón del carrete. Reggaeton, urbano e internacional.", musica:"Reggaeton · Urban & World Hits · Trap", capacidad:"350 personas", color_acento:"#E8363D" },
  { id:"aire",  nombre:"AIRE",  descripcion:"El espacio donde suena lo nuestro. Nacional hits y afrobeats.", musica:"Nacional Hits · Afrobeats · Música Chilena", capacidad:"200 personas", color_acento:"#D4A832" },
  { id:"tierra",nombre:"TIERRA",descripcion:"La terraza de la casita. Bajo las estrellas de Bellavista.", musica:"Ambient · Guaracha · Dembow", capacidad:"150 personas", color_acento:"#8B1A1E" }
];

const FRATE_WEBEUM = [
  { id:1, titulo:"EP. 47 — Sábado Eléctrico", fecha:"20 Abr 2025", duracion:"12:34", url:"https://www.youtube.com/@fraternidadcampuscentral" },
  { id:2, titulo:"EP. 46 — Noche de Afrobeats", fecha:"13 Abr 2025", duracion:"09:21", url:"https://www.youtube.com/@fraternidadcampuscentral" },
  { id:3, titulo:"EP. 45 — El Aniversario", fecha:"6 Abr 2025", duracion:"18:07", url:"https://www.youtube.com/@fraternidadcampuscentral" },
  { id:4, titulo:"EP. 44 — Trap Jueves Vol.3", fecha:"30 Mar 2025", duracion:"11:55", url:"https://www.youtube.com/@fraternidadcampuscentral" }
];

const FRATE_STATS = [
  { numero: "13", label: "Años de historia" },
  { numero: "+2.000", label: "Eventos realizados" },
  { numero: "+2M", label: "Visitantes desde 2013" },
  { numero: "3", label: "Ambientes únicos" }
];

const FRATE_GALERIA = [
  { id:1, ambiente:"Fuego", alto:280 }, { id:2, ambiente:"Aire", alto:200 },
  { id:3, ambiente:"Tierra", alto:240 }, { id:4, ambiente:"Fuego", alto:220 },
  { id:5, ambiente:"Aire", alto:260 }, { id:6, ambiente:"Tierra", alto:200 },
  { id:7, ambiente:"Fuego", alto:240 }, { id:8, ambiente:"Aire", alto:280 }
];

// ── LA TIENDITA — Productos de merch ──
const FRATE_TIENDITA = [
  { id:"t1", nombre:"Polera FRATE Classic", descripcion:"100% algodón. Logo bordado. Tallas S-M-L-XL-XXL.", precio:18900, stock:50, categoria:"Ropa", imagen_color:"#1a0a0b", tallas:["S","M","L","XL","XXL"], colores:["Negro","Blanco","Rojo"] },
  { id:"t2", nombre:"Gorra Snapback FRATE", descripcion:"Bordado insignia. Talla única regulable.", precio:14900, stock:30, categoria:"Accesorios", imagen_color:"#0a0a0b", tallas:["Única"], colores:["Negro","Dorado"] },
  { id:"t3", nombre:"Hoodie FRATE Premium", descripcion:"Forro polar interior. Logo grande al pecho.", precio:29900, stock:20, categoria:"Ropa", imagen_color:"#0a0a0b", tallas:["S","M","L","XL"], colores:["Negro"] },
  { id:"t4", nombre:"Tote Bag FRATE", descripcion:"Bolsa de tela resistente. 100% algodón.", precio:8900, stock:40, categoria:"Accesorios", imagen_color:"#0f0a00", tallas:["Única"], colores:["Natural","Negro"] },
  { id:"t5", nombre:"Sticker Pack x5", descripcion:"5 stickers premium vinyl. Diseños exclusivos Frate.", precio:3900, stock:100, categoria:"Coleccionables", imagen_color:"#0a0a12", tallas:["Única"], colores:["Multicolor"] },
  { id:"t6", nombre:"Vaso Térmico FRATE", descripcion:"Acero inoxidable 500ml. Logo grabado.", precio:16900, stock:25, categoria:"Accesorios", imagen_color:"#0a120a", tallas:["Única"], colores:["Negro","Plateado"] }
];

// ── CARTA — Pre-compra de tragos ──
const FRATE_CARTA = [
  {
    categoria: "Cócteles Firma",
    items: [
      { id:"c1", nombre:"Frate Sour", descripcion:"Pisco premium, limón, clara de huevo, hielo.", precio:6500, disponible:true },
      { id:"c2", nombre:"Campus Mule", descripcion:"Vodka, jengibre, limón, menta fresca.", precio:6000, disponible:true },
      { id:"c3", nombre:"Fuego Picante", descripcion:"Tequila, chile, limón, sal, jugo de tomate.", precio:7000, disponible:true }
    ]
  },
  {
    categoria: "Cervezas",
    items: [
      { id:"c4", nombre:"Schop Litro", descripcion:"Cerveza artesanal de barril. 1 litro.", precio:5500, disponible:true },
      { id:"c5", nombre:"Schop Medio", descripcion:"Cerveza artesanal de barril. 500cc.", precio:3500, disponible:true },
      { id:"c6", nombre:"Botella Importada", descripcion:"Selección de cervezas importadas 330cc.", precio:4500, disponible:true }
    ]
  },
  {
    categoria: "Shots & Chupitos",
    items: [
      { id:"c7", nombre:"Shot Clásico", descripcion:"Shot de vodka, tequila o ron.", precio:2500, disponible:true },
      { id:"c8", nombre:"Chupito Frate", descripcion:"Combinación secreta de la casa. ¡Atrévete!", precio:3000, disponible:true }
    ]
  },
  {
    categoria: "Sin Alcohol",
    items: [
      { id:"c9", nombre:"Jugo Natural", descripcion:"Naranja, maracuyá o piña. 300cc.", precio:2000, disponible:true },
      { id:"c10", nombre:"Agua Mineral", descripcion:"Con o sin gas. 500cc.", precio:1500, disponible:true }
    ]
  }
];

// ── MEMBRESÍAS ──
const FRATE_MEMBRESIAS = [
  { id:"m1", nombre:"FRATE PASS", precio:9990, periodo:"mes", beneficios:["Descuento 20% en tickets","Acceso prioritario 1 vez/mes","Puntos x2 en todas las compras","Newsletter exclusiva de eventos"] },
  { id:"m2", nombre:"FRATE VIP", precio:19990, periodo:"mes", beneficios:["Todo lo de FRATE PASS","Mesa VIP garantizada 1 vez/mes","Descuento 30% en tickets","Descuento 15% en tiendita","Puntos x3","Invitado de honor en eventos especiales"] },
  { id:"m3", nombre:"FRATE FAMILIA", precio:49990, periodo:"mes", beneficios:["Todo lo de VIP","Hasta 4 personas","Mesa VIP permanente","Descuento 40% en tickets","Descuento 25% en tiendita","Puntos x5","Acceso backstage en eventos especiales"] }
];
