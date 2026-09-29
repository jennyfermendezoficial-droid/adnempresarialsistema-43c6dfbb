-- Freelance: estructura aislada para Pagos e Informes.
create table if not exists public.freelancers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  area text not null default '',
  tarifa_hora numeric(12,2) not null default 0 check (tarifa_hora >= 0),
  banco text, tipo_cuenta text, numero_cuenta text, titular_cuenta text,
  activo boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.freelance_actividades (
  id uuid primary key default gen_random_uuid(),
  freelance_id uuid not null references public.freelancers(id) on delete cascade,
  fecha date not null, actividad text not null, descripcion text, horas numeric(8,2) not null default 0 check (horas >= 0),
  observaciones text, informe_pdf_path text,
  informe_tipo text not null default 'diario' check (informe_tipo in ('diario','semanal')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.freelance_ajustes (
  id uuid primary key default gen_random_uuid(),
  freelance_id uuid not null references public.freelancers(id) on delete cascade,
  fecha date, tipo text not null check (tipo in ('bonificacion','deduccion','multa','correccion')),
  monto numeric(12,2) not null check (monto >= 0), motivo text not null default '', created_at timestamptz not null default now()
);
create index if not exists freelance_actividades_idx on public.freelance_actividades(freelance_id, fecha desc);
create index if not exists freelance_ajustes_idx on public.freelance_ajustes(freelance_id, fecha desc);
alter table public.freelancers enable row level security;
alter table public.freelance_actividades enable row level security;
alter table public.freelance_ajustes enable row level security;
drop policy if exists "freelancers_admin" on public.freelancers;
create policy "freelancers_admin" on public.freelancers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "freelance_actividades_admin" on public.freelance_actividades;
create policy "freelance_actividades_admin" on public.freelance_actividades for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "freelance_ajustes_admin" on public.freelance_ajustes;
create policy "freelance_ajustes_admin" on public.freelance_ajustes for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into storage.buckets(id,name,public) values('freelance-informes','freelance-informes',false) on conflict(id) do update set public=false;
drop policy if exists "freelance_storage_select" on storage.objects;
create policy "freelance_storage_select" on storage.objects for select to authenticated using(bucket_id='freelance-informes' and public.has_role(auth.uid(),'admin'));
drop policy if exists "freelance_storage_insert" on storage.objects;
create policy "freelance_storage_insert" on storage.objects for insert to authenticated with check(bucket_id='freelance-informes' and public.has_role(auth.uid(),'admin'));
drop policy if exists "freelance_storage_update" on storage.objects;
create policy "freelance_storage_update" on storage.objects for update to authenticated using(bucket_id='freelance-informes' and public.has_role(auth.uid(),'admin')) with check(bucket_id='freelance-informes' and public.has_role(auth.uid(),'admin'));
drop policy if exists "freelance_storage_delete" on storage.objects;
create policy "freelance_storage_delete" on storage.objects for delete to authenticated using(bucket_id='freelance-informes' and public.has_role(auth.uid(),'admin'));
