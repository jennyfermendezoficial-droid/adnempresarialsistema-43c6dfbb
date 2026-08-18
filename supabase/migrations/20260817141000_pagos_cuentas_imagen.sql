-- Imágenes/logos para las cuentas bancarias usadas por administración en Pagos e informes.
-- No modifica la lógica de otras ventanas.

alter table public.pagos_cuentas_bancarias
  add column if not exists imagen_url text;

insert into storage.buckets (id, name, public)
values ('pagos-bancos', 'pagos-bancos', true)
on conflict (id) do update set public = true;

-- Lectura pública de logos bancarios.
drop policy if exists "pagos bancos lectura publica" on storage.objects;
create policy "pagos bancos lectura publica"
on storage.objects for select
using (bucket_id = 'pagos-bancos');

-- Solo administradores pueden administrar los logos de cuentas de origen.
drop policy if exists "pagos bancos admin insertar" on storage.objects;
create policy "pagos bancos admin insertar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pagos-bancos'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "pagos bancos admin actualizar" on storage.objects;
create policy "pagos bancos admin actualizar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pagos-bancos'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
)
with check (
  bucket_id = 'pagos-bancos'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "pagos bancos admin borrar" on storage.objects;
create policy "pagos bancos admin borrar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pagos-bancos'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);
