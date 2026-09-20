-- ============================================================
-- Directorio Parroquial · Esquema de base de datos (Supabase)
-- Pega todo este archivo en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Extensión necesaria para generar IDs únicos (uuid)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Categorías de oficios/habilidades (lista base, editable)
-- ------------------------------------------------------------
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz default now()
);

insert into categorias (nombre) values
  ('Carpintería'), ('Plomería'), ('Electricidad'), ('Costura'),
  ('Cocina'), ('Salud'), ('Educación'), ('Construcción'),
  ('Mecánica'), ('Transporte'), ('Música'), ('Otro')
on conflict (nombre) do nothing;

-- ------------------------------------------------------------
-- 2. Personas (miembros de la comunidad)
-- ------------------------------------------------------------
create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  direccion text,
  grupo_ministerio text,
  disponibilidad text,
  notas text,
  creado_en timestamptz default now()
);

-- Relación muchos-a-muchos: una persona puede tener varios oficios
create table if not exists persona_categorias (
  persona_id uuid references personas(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete cascade,
  primary key (persona_id, categoria_id)
);

-- Habilidades escritas a mano que no están en la lista de categorías
create table if not exists persona_habilidades_libres (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references personas(id) on delete cascade,
  habilidad text not null
);

-- ------------------------------------------------------------
-- 3. Grupos y ministerios
-- ------------------------------------------------------------
create table if not exists grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  creado_en timestamptz default now()
);

create table if not exists grupo_miembros (
  grupo_id uuid references grupos(id) on delete cascade,
  persona_id uuid references personas(id) on delete cascade,
  primary key (grupo_id, persona_id)
);

-- ------------------------------------------------------------
-- 4. Calendario de eventos
-- ------------------------------------------------------------
create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  fecha date not null,
  hora time,
  lugar text,
  creado_en timestamptz default now()
);

-- ------------------------------------------------------------
-- 5. Sacramentos
-- ------------------------------------------------------------
create table if not exists sacramentos (
  id uuid primary key default gen_random_uuid(),
  nombre_persona text not null,
  tipo text not null check (tipo in ('Bautizo','Primera comunión','Confirmación','Matrimonio')),
  fecha date not null,
  padrinos text,
  notas text,
  creado_en timestamptz default now()
);

-- ------------------------------------------------------------
-- 6. Avisos y comunicados
-- ------------------------------------------------------------
create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  contenido text not null,
  estado text not null default 'Publicado' check (estado in ('Publicado','Programado')),
  fecha_publicacion date default current_date,
  creado_en timestamptz default now()
);

-- ============================================================
-- Seguridad (RLS)
-- ============================================================
-- IMPORTANTE: esta app se conecta desde el navegador con la
-- "anon key" de Supabase, que es pública. Las políticas de abajo
-- permiten leer y escribir a cualquiera que tenga el enlace de la
-- app. Es aceptable para un directorio interno de uso confiado
-- (solo el padre y quien él autorice conocen el enlace), pero NO
-- es lo mismo que tener una contraseña real. La app incluye un
-- PIN de acceso como primer filtro (ver README), pero para una
-- protección más seria a futuro se recomienda migrar a Supabase
-- Auth (inicio de sesión real).

alter table categorias enable row level security;
alter table personas enable row level security;
alter table persona_categorias enable row level security;
alter table persona_habilidades_libres enable row level security;
alter table grupos enable row level security;
alter table grupo_miembros enable row level security;
alter table eventos enable row level security;
alter table sacramentos enable row level security;
alter table avisos enable row level security;

create policy "acceso anon" on categorias for all using (true) with check (true);
create policy "acceso anon" on personas for all using (true) with check (true);
create policy "acceso anon" on persona_categorias for all using (true) with check (true);
create policy "acceso anon" on persona_habilidades_libres for all using (true) with check (true);
create policy "acceso anon" on grupos for all using (true) with check (true);
create policy "acceso anon" on grupo_miembros for all using (true) with check (true);
create policy "acceso anon" on eventos for all using (true) with check (true);
create policy "acceso anon" on sacramentos for all using (true) with check (true);
create policy "acceso anon" on avisos for all using (true) with check (true);
