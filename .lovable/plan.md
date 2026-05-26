Voy a implementar 4 cambios:

## 1. Agenda 1 a 1 — Límites por día
En `src/routes/_authenticated/agenda-1a1.tsx`, antes de reservar:
- Consultar las sesiones del alumno (`alumna_id = uid`) para la fecha seleccionada
- **Bloquear si:**
  - Ya tiene 1 reserva con ese mismo profesor ese día → "Ya reservaste con este profesor hoy"
  - Ya tiene 3 reservas en total ese día (con cualquier profesor) → "Máximo 3 reservas por día"
- Permitir hasta 3 al día, máximo 1 por profesor.

## 2. Pagos e Informes — Incluir admin y soporte como profesores
En `src/routes/_authenticated/pagos.tsx`:
- Cargar todos los perfiles con rol `admin` o `soporte` (vía `user_roles`).
- Para cada uno mostrar fila con:
  - Nombre
  - Reservas 1a1 del mes actual (count en `sesiones_1a1` donde `profesor_id = x`)
  - Mensajes enviados (count en `canal_general_mensajes` + `mensajes_chat_1a1` + `soporte_privado_mensajes` donde `autor_id = x`)
  - Bonos del mes (sum `bonos.monto`)
- Mantener tabla actual de `pagos_mensuales` debajo.

## 3. Bonos — Permitir bonos a admin también
En `src/routes/_authenticated/bonos.tsx`:
- En el selector "Profesor" mostrar a los usuarios con rol `admin` o `soporte` (no a todos los profiles).

## 4. Nueva página: Calificar profesores (solo alumnos/usuarios)
Crear `src/routes/_authenticated/calificar.tsx`:
- Lista de profesores (admin + soporte).
- Por cada uno: 4 sliders 1–5 (claridad, didáctica, desenvolvimiento, práctico) + comentario.
- Botón "Enviar calificación" → inserta en `calificaciones_mensuales` con mes/año actual.
- Si el rol del usuario es admin/soporte, mostrar mensaje "Esta sección es solo para alumnos".
- Agregar entrada en `AppSidebar` visible solo para rol `usuario`.

⚠️ **Nota sobre la política RLS de calificaciones**: la actual exige que el alumno tenga al menos una sesión 1a1 con el profesor. Si quieres que cualquier alumno pueda calificar sin haber tenido sesión, dímelo y ajusto la política. Por ahora mantengo la regla actual.

¿Procedo?