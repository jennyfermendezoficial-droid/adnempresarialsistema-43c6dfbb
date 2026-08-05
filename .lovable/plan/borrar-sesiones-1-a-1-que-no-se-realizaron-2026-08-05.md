# Borrar sesiones 1 a 1 que no se realizaron

Hoy solo un administrador puede eliminar una reserva 1 a 1 (verificado en las reglas de acceso de la tabla de sesiones). El profesor asignado no tiene esa opción ni en pantalla ni en permisos.

## Qué se va a hacer

1. **Permiso en la base de datos**: el profesor asignado a la sesión podrá eliminarla, además del administrador.
   - Restricción: solo se pueden borrar sesiones que **no** estén finalizadas. Si ya se registró la duración, esa sesión cuenta como hora trabajada y no debe desaparecer (para eso el admin sigue teniendo control total).
2. **Botón en "Mis clases asignadas"**: junto a cada sesión 1 a 1 pendiente aparece un ícono de papelera.
   - Al pulsarlo se pide confirmación ("¿Eliminar esta sesión? La alumna dejará de verla").
   - Al confirmar, la sesión desaparece de la lista al instante y se avisa con un mensaje de éxito o error.
3. **Vista de la alumna**: como la sesión se elimina de verdad, deja de aparecer también en la agenda de la alumna.

## Detalles técnicos

- Nueva política DELETE en `public.sesiones_1a1`: `profesor_id = auth.uid() AND estado <> 'finalizada'`, manteniendo la política existente de admin.
- UI en `src/routes/_authenticated/mis-clases-asignadas.tsx`: botón con `Trash2`, `AlertDialog` de confirmación, `supabase.from('sesiones_1a1').delete().eq('id', ...)` y actualización local del estado.
- El botón solo se muestra cuando `estado !== 'finalizada'`.
