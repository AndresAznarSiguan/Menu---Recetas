# Menú — Recetas y planificación semanal

App de una sola página (HTML/CSS/JS puro, sin frameworks ni compilación) para llevar tu recetario y planificar el menú en un calendario anual desglosable en mes / semana / día. Instalable como app en Android (PWA) y usable también en PC desde el navegador.

Inspirada en la arquitectura del proyecto **Archivo** (artistas y obras): almacenamiento local con IndexedDB, sincronización opcional vía Supabase, copia de seguridad en JSON.

## Archivos

- `index.html` — estructura y estilos
- `app.js` — toda la lógica
- `sw.js` — service worker (caché offline)
- `manifest.webmanifest` + `icon-192.png` / `icon-512.png` — metadatos de instalación

## Probar en local

```
python3 -m http.server 8000
```

y abre `http://localhost:8000/index.html` en Chrome. Los datos se guardan en el navegador (IndexedDB), no hace falta backend para empezar a usarla.

## Instalarla en tu móvil Android

El service worker (y por tanto la instalación como app / uso offline) necesita que la app se sirva por **HTTPS** — `localhost` vale para pruebas en PC, pero no una IP local por HTTP. La forma más simple y gratuita de tener HTTPS:

1. Sube esta carpeta a un repositorio de GitHub y activa **GitHub Pages** (Settings → Pages → Deploy from branch), o arrastra la carpeta a **Netlify Drop** (netlify.com/drop) — ambos te dan una URL `https://...` en segundos.
2. Abre esa URL en Chrome desde el móvil.
3. Menú (⋮) → **Instalar aplicación** / **Añadir a pantalla de inicio**.

A partir de ahí se abre a pantalla completa como una app normal, con su icono, y sigue funcionando sin conexión.

## Sincronización entre dispositivos (opcional)

Igual que en Archivo, la sincronización usa tu propio proyecto gratuito de [Supabase](https://supabase.com). Nadie más que tú tiene acceso a esos datos.

1. Crea un proyecto en Supabase (gratis).
2. Ve a **SQL Editor** y ejecuta esto una vez para crear la tabla y el almacén de fotos:

```sql
create table if not exists public.menu_recetas_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.menu_recetas_data enable row level security;

create policy "select_own" on public.menu_recetas_data
  for select using (auth.uid() = user_id);
create policy "insert_own" on public.menu_recetas_data
  for insert with check (auth.uid() = user_id);
create policy "update_own" on public.menu_recetas_data
  for update using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
  values ('recipe-photos','recipe-photos', false)
  on conflict (id) do nothing;

create policy "photos_select_own" on storage.objects
  for select using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_insert_own" on storage.objects
  for insert with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_update_own" on storage.objects
  for update using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_delete_own" on storage.objects
  for delete using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

3. En **Authentication → Users**, crea manualmente tu usuario (correo + contraseña) — la app solo tiene pantalla de entrar, no de registro, igual que Archivo.
4. En **Project Settings → API**, copia la **Project URL** y la **Publishable key**.
5. En la app, pulsa **Sincronizar**, pega esos dos datos, conecta, y entra con tu correo y contraseña. A partir de ahí el móvil y el PC quedan enlazados automáticamente.

## Modelo de datos

- **Receta**: título, categoría, raciones, tiempo, lista de ingredientes (nombre/cantidad/unidad), pasos de elaboración (uno por línea), notas, foto.
- **Entrada de menú**: fecha (`AAAA-MM-DD`) + referencia a una receta. Un día puede tener varias.

## Cómo se añade una receta al calendario

En las vistas de mes, semana o día hay un botón flotante **🍽 Recetas** que abre el índice de recetas. Desde ahí puedes:

- **Arrastrar** una receta hasta un día (ratón o dedo).
- O **tocarla** una vez (se marca en verde) y luego **tocar el día** donde quieras colocarla — pensado para que funcione bien también con el dedo en el móvil.
