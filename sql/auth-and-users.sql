-- ============================================================
-- Directorio Parroquial · Usuarios y roles (Supabase Auth)
-- Corre esto DESPUÉS de haber corrido sql/schema.sql
-- Pégalo en: Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Roles (catálogo abierto — puedes agregar más filas después
-- sin tocar código, ej: insert into roles (nombre) values ('secretaria');)
-- ------------------------------------------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

insert into roles (nombre) values ('admin'), ('colaborador')
on conflict (nombre) do nothing;

-- ------------------------------------------------------------
-- Perfiles: un registro por cada usuario real de Supabase Auth
-- ------------------------------------------------------------
create table if not exists perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol_id uuid not null references roles(id),
  activo boolean not null default true,
  creado_en timestamptz default now()
);

-- ------------------------------------------------------------
-- Funciones auxiliares (para las políticas de seguridad)
-- ------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles p
    join roles r on r.id = p.rol_id
    where p.user_id = auth.uid() and r.nombre = 'admin' and p.activo = true
  );
$$;

create or replace function is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles p where p.user_id = auth.uid() and p.activo = true
  );
$$;

-- ------------------------------------------------------------
-- Reemplazar el acceso abierto (anon) por acceso autenticado
-- ------------------------------------------------------------
drop policy if exists "acceso anon" on categorias;
drop policy if exists "acceso anon" on personas;
drop policy if exists "acceso anon" on persona_categorias;
drop policy if exists "acceso anon" on persona_habilidades_libres;
drop policy if exists "acceso anon" on grupos;
drop policy if exists "acceso anon" on grupo_miembros;
drop policy if exists "acceso anon" on eventos;
drop policy if exists "acceso anon" on sacramentos;
drop policy if exists "acceso anon" on avisos;

create policy "usuarios activos" on categorias for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on personas for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on persona_categorias for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on persona_habilidades_libres for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on grupos for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on grupo_miembros for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on eventos for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on sacramentos for all using (is_active_user()) with check (is_active_user());
create policy "usuarios activos" on avisos for all using (is_active_user()) with check (is_active_user());

-- Roles: cualquier usuario activo puede leerlos (para el selector); solo un
-- admin puede crear/editar roles nuevos.
alter table roles enable row level security;
create policy "leer roles" on roles for select using (is_active_user());
create policy "admin crea roles" on roles for insert with check (is_admin());
create policy "admin edita roles" on roles for update using (is_admin()) with check (is_admin());

-- Perfiles: cada quien ve el suyo; un admin ve y edita todos.
-- (No hay política de "insert" a propósito: los perfiles se crean únicamente
-- desde la Edge Function "create-user", que usa la llave de servicio y por
-- lo tanto no pasa por estas políticas.)
alter table perfiles enable row level security;
create policy "ver mi perfil o admin ve todos" on perfiles for select using (auth.uid() = user_id or is_admin());
create policy "admin actualiza perfiles" on perfiles for update using (is_admin()) with check (is_admin());
