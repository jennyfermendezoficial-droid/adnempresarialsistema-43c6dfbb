# Arreglar "Aún no hay mentores configurados" en Agenda 1 a 1

## Qué está pasando (verificado)

El último ajuste de seguridad dejó la tabla de perfiles con esta regla: **cada usuario solo puede leer su propio perfil** (y admin/soporte ven todo). La Agenda 1 a 1 pide la lista de mentores y luego lee sus perfiles en esa tabla; como el estudiante ya no puede leerlos, la lista queda vacía y aparece "Aún no hay mentores configurados", por lo que nadie puede agendar.

El mismo bloqueo afecta a otras pantallas donde se muestran nombres/fotos de otras personas (chat general, chats 1 a 1, calendario de clases, mis clases asignadas, tareas, notificaciones, inicio): ahí saldrán nombres genéricos o vacíos.

## Solución

1. Crear una función segura de solo lectura que devuelva **datos públicos** de personas (nombre, foto, actividad) para una lista de usuarios — sin correo, sin tarifas, sin estado. Disponible para usuarios autenticados.
2. Agenda 1 a 1: construir la lista de mentores con la función que ya existe para listar profesores (trae nombre, foto y actividad), sin tocar la tabla de perfiles. Así vuelven a aparecer los mentores y se puede reservar.
3. Reemplazar las lecturas de perfiles "de otras personas" por la nueva función segura en: chat general, chats, inicio, calendario de clases, mis clases asignadas, tareas y notificaciones, para que se vean los nombres correctos.
4. Las pantallas de admin (pagos e informes, permisos, miembros, bonos) siguen igual: admin/soporte sí pueden leer todo.

## Verificación

- Entrar como estudiante: la Agenda 1 a 1 lista mentores, permite reservar y muestra el nombre del mentor.
- Entrar como profesor: se ve el nombre del estudiante en la celda reservada y en "Mis clases asignadas".
- Correos y tarifas siguen ocultos para quien no es admin/soporte.

## Detalles técnicos

- Migración: `create function public.perfiles_publicos(_ids uuid[]) returns table(id uuid, nombre_completo text, avatar_url text, actividad text) language sql stable security definer set search_path = public`, con `grant execute ... to authenticated`. No cambia ninguna política existente.
- `src/routes/_authenticated/agenda-1a1.tsx`: usar el resultado de `listar_profesores()` como lista de mentores (quitar el `select` a `profiles`) y `perfiles_publicos` para nombres de contrapartes.
- Sustituir `supabase.from("profiles").select(...).in("id", ids)` por `supabase.rpc("perfiles_publicos", { _ids: ids })` en los archivos de display de nombres listados arriba.
