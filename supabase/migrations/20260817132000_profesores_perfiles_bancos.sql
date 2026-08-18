-- Datos obligatorios y cuentas bancarias para profesores (rol interno: soporte)

create table if not exists public.profesor_datos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nombres text not null default '',
  apellidos text not null default '',
  cedula text not null default '',
  fecha_nacimiento date,
  whatsapp text not null default '',
  direccion text not null default '',
  google_place_id text,
  latitud double precision,
  longitud double precision,
  cedula_archivo_path text,
  perfil_completo boolean not null default false,
  completado_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.profesor_bancos_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  imagen_url text,
  creado_por uuid references auth.users(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists profesor_bancos_catalogo_nombre_lower_idx
  on public.profesor_bancos_catalogo (lower(nombre));

create table if not exists public.profesor_cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  banco_id uuid not null references public.profesor_bancos_catalogo(id),
  tipo_cuenta text not null check (tipo_cuenta in ('ahorros','corriente','cooperativa','otro')),
  numero_cuenta text not null,
  titular text not null,
  principal boolean not null default true,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists profesor_cuenta_principal_unica_idx
  on public.profesor_cuentas_bancarias(usuario_id)
  where principal = true and activo = true;

alter table public.profesor_datos enable row level security;
alter table public.profesor_bancos_catalogo enable row level security;
alter table public.profesor_cuentas_bancarias enable row level security;

-- Cada profesor gestiona sus propios datos. El líder/admin puede consultarlos para informes.
drop policy if exists "profesor_datos_select" on public.profesor_datos;
create policy "profesor_datos_select" on public.profesor_datos
for select to authenticated
using (
  usuario_id = auth.uid()
  or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

drop policy if exists "profesor_datos_insert" on public.profesor_datos;
create policy "profesor_datos_insert" on public.profesor_datos
for insert to authenticated
with check (
  usuario_id = auth.uid()
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'soporte')
);

drop policy if exists "profesor_datos_update" on public.profesor_datos;
create policy "profesor_datos_update" on public.profesor_datos
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

-- Catálogo visible para usuarios autenticados; profesores y admins pueden agregar bancos.
drop policy if exists "profesor_bancos_select" on public.profesor_bancos_catalogo;
create policy "profesor_bancos_select" on public.profesor_bancos_catalogo
for select to authenticated using (activo = true);

drop policy if exists "profesor_bancos_insert" on public.profesor_bancos_catalogo;
create policy "profesor_bancos_insert" on public.profesor_bancos_catalogo
for insert to authenticated
with check (
  creado_por = auth.uid()
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','soporte'))
);

drop policy if exists "profesor_bancos_update" on public.profesor_bancos_catalogo;
create policy "profesor_bancos_update" on public.profesor_bancos_catalogo
for update to authenticated
using (
  creado_por = auth.uid()
  or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

-- Cuenta bancaria del profesor: propia para edición y visible al líder/admin para informes.
drop policy if exists "profesor_cuentas_select" on public.profesor_cuentas_bancarias;
create policy "profesor_cuentas_select" on public.profesor_cuentas_bancarias
for select to authenticated
using (
  usuario_id = auth.uid()
  or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

drop policy if exists "profesor_cuentas_insert" on public.profesor_cuentas_bancarias;
create policy "profesor_cuentas_insert" on public.profesor_cuentas_bancarias
for insert to authenticated
with check (
  usuario_id = auth.uid()
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'soporte')
);

drop policy if exists "profesor_cuentas_update" on public.profesor_cuentas_bancarias;
create policy "profesor_cuentas_update" on public.profesor_cuentas_bancarias
for update to authenticated
using (usuario_id = auth.uid())
with check (usuario_id = auth.uid());

-- Buckets temporales en Supabase Storage. Cloudinary se integrará en una fase posterior.
insert into storage.buckets (id, name, public)
values ('profesor-documentos', 'profesor-documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('profesor-bancos', 'profesor-bancos', true)
on conflict (id) do nothing;

-- Documentos privados: solo el dueño puede subir/ver; admin puede consultar para informes.
drop policy if exists "profesor_documentos_insert" on storage.objects;
create policy "profesor_documentos_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profesor-documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profesor_documentos_select" on storage.objects;
create policy "profesor_documentos_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'profesor-documentos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
  )
);

drop policy if exists "profesor_documentos_delete" on storage.objects;
create policy "profesor_documentos_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profesor-documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Logos de bancos: profesores/admin pueden subir; son públicos para mostrarlos en informes.
drop policy if exists "profesor_bancos_storage_insert" on storage.objects;
create policy "profesor_bancos_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profesor-bancos'
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','soporte'))
);

drop policy if exists "profesor_bancos_storage_update" on storage.objects;
create policy "profesor_bancos_storage_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'profesor-bancos'
  and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role in ('admin','soporte'))
);
