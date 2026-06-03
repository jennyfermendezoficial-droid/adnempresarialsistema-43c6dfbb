# Plan de arreglos

Voy a abordar todos los problemas que mencionaste en este orden. Cada punto se hace en una sola pasada para que quede todo funcionando junto.

## 1. Calendario de clases (`/calendario-clases`)

- **Evitar Zooms duplicados por doble clic**: el botón "Crear con Zoom" se deshabilita en cuanto se aprieta una vez, muestra "Creando…" y solo se vuelve a habilitar al terminar o si hay error.
- **Mostrar descripción en la tarjeta del calendario**: además del título y la hora, debajo aparece un fragmento de la descripción (cortado para que no rompa el layout). Al pasar el mouse muestra todo.
- **Zoom con info completa**: el `topic` que se manda a Zoom será `"<Título> – <Nombre del profesor>"` y el campo `agenda` llevará la descripción. Así la notificación de Zoom muestra de qué trata la clase y quién la dicta.
- **Repetir semanal**: sigue creando una entrada por semana en el calendario y un Zoom por cada una (es lo correcto, cada clase tiene su propio link), pero garantizado solo una ronda por clic.

## 2. Agenda 1 a 1 (`/agenda-1a1`)

- **Evitar Zooms duplicados**: botón "Reservar" deshabilitado mientras procesa, igual que arriba.
- **Bloquear reservas para el mismo día**: solo se permite reservar a partir de mañana. Los slots de hoy aparecen en gris con leyenda "Reserva con al menos 1 día de anticipación".
- **Nombre del Zoom de 1a1**: `"<Profesor> – <Actividad/Especialidad>"`. Para esto leo la nueva columna `actividad` del profesor (ver punto 4) y la mando como `topic`. La descripción del alumno va en `agenda`.
- **Quitar el bloque tipo Amazon**: limpio la sección de reservar para que quede solo "Elige tu mentor".
- **Agregar tabla "Tus próximas sesiones"** debajo de los mentores: muestra fecha, hora, mentor, link de Zoom y botón para entrar. Visible para alumnos y también para profesores/admin (en su caso muestra las sesiones que ellos deben dictar).

## 3. Notificaciones para profesores/admin

- **Nuevo apartado en el menú**: "Mis próximas clases" (visible solo para admin y soporte). Lista en orden cronológico:
  - Clases en vivo que tienen que dictar (de `clases_en_vivo` donde `profesor_id = yo`).
  - Sesiones 1 a 1 donde son el mentor.
  - Con link a Zoom y aviso visual cuando faltan menos de 24h.
- Notificación push existente se reutiliza si está disponible; si no, se prioriza el listado visual.

## 4. Permisos (`/permisos`) - edición con lapicito

- **Nueva columna `actividad` en `profiles`** (texto corto tipo "Meta Ads", "IA y generación de imágenes").
- **Lápiz junto al nombre** del usuario para editar:
  - Nombre completo.
  - Actividad / a qué se dedica.
- **Lápiz para reseñas/calificaciones**: abre un modal con todas las `calificaciones_mensuales` del usuario y permite borrar las que sean de prueba.
- **Lápiz para sesiones 1a1**: permite borrar reservas falsas (Jennifer Méndez, Jaime, etc.) directamente desde el admin.

## 5. Tareas - botón calificar invisible

- El botón "Calificar" en `/tareas` y en el detalle de entregas se cambia a usar el gradiente violeta del sistema con texto blanco para que sea visible sobre fondo blanco.
- También se arregla el contador "X por calificar" para que sea legible.

## Cambios técnicos (resumen para referencia)

- Migración DB:
  - `ALTER TABLE profiles ADD COLUMN actividad text;`
  - Política `DELETE` en `sesiones_1a1` para admin (si no existía ya).
- `src/lib/zoom.functions.ts`: aceptar `agenda` opcional y pasarlo al body de Zoom.
- `src/routes/_authenticated/calendario-clases.tsx`: estado `creating`, descripción visible, `topic` enriquecido.
- `src/routes/_authenticated/agenda-1a1.tsx`: estado `reserving`, filtro de slots hoy, `topic` con actividad, sección "Tus próximas sesiones", quitar bloque Amazon.
- `src/routes/_authenticated/mis-clases-asignadas.tsx` (nuevo): listado para profesores/admin + entrada en sidebar.
- `src/routes/_authenticated/permisos.tsx`: modal de edición por usuario (nombre, actividad, calificaciones, sesiones 1a1).
- `src/routes/_authenticated/tareas.tsx`: estilos del botón calificar y contador.

¿Le doy con todo este plan o quieres que ajuste algo antes de empezar?
