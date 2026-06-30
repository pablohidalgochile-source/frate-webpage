# Frate ERP — Fraternidad Campus Central

Sistema de gestión operativa para la mejor discoteca urbana de Chile.

## Stack
- React 18 + React Router
- Supabase (PostgreSQL + Auth)
- Vercel (deploy)

## Módulos
- Dashboard central con KPIs reales
- Personal (CRUD completo con Supabase)
- Turnos semanales
- Conteos diarios (8 cajas, reconciliación)
- Pagos semanales (3 grupos, SII, TOB)
- Eventos especiales
- Producción audiovisual WEBEUM

## Setup Supabase

1. Ir a https://supabase.com → tu proyecto FRATE ERP
2. SQL Editor → New Query → pegar contenido de `supabase_schema.sql` → Run
3. Esto crea las 7 tablas y carga los 34 trabajadores iniciales

## Deploy en Vercel

### Opción A — Desde GitHub (recomendada)
1. Subir este proyecto a GitHub
2. Ir a vercel.com → New Project → importar repo
3. En "Environment Variables" agregar:
   - `REACT_APP_SUPABASE_URL` = https://zsilmmixlugwawzpmayx.supabase.co
   - `REACT_APP_SUPABASE_ANON_KEY` = (la clave del .env)
4. Deploy → en 2 min tenés la URL

### Opción B — Vercel CLI
```bash
npm install -g vercel
npm install
vercel --prod
```

## Desarrollo local
```bash
npm install
npm start
```
Abre http://localhost:3000
