# Sesiones vencidas, eliminación con razón y duración solo del profesor

## Qué cambia para el usuario

**1. Sesiones y clases viejas sin duración**
- Si pasan 7 días desde la fecha de la sesión 1 a 1 (o clase en vivo) y nadie registró la duración, el sistema la marca automáticamente como **"No registrada"**.
- Deja de aparecer en "Mis clases asignadas" y no suma horas ni dinero.
- Queda guardada en el historial para que administración la revise en Pagos e informes.
- La revisión corre sola una vez al día.

**2. Eliminar indicando la razón**
- El botón "Eliminar" en "Mis clases asignadas" (y en Calendario de clases para la clase propia) ahora pide una **razón obligatoria** (por ejemplo: "no se realizó la clase", "la alumna no asistió").
- La sesión desaparece de la agenda de la alumna y del profesor, pero se guarda un registro con fecha, profesor, alumna y razón.
- Esas sesiones **no cuentan horas**.

**3. Pagos e informes (solo administradores)**
- Nueva sección "Sesiones canceladas / no registradas" dentro del informe del mes seleccionado del profesor.
- Muestra fecha, tipo (1 a 1 o clase en vivo), con quién, estado (cancelada o no registrada) y la razón escrita.
- Se incluye en el PDF y en el Excel del mes, siempre con $0 en horas.
- Los profesores no ven esta sección en Mis reportes.

**4. Registrar duración solo el profesor que dio la clase**
- En Calendario de clases hoy el botón de registrar duración aparece también para administradores; se quita esa excepción: solo el profesor asignado a esa clase lo ve y puede usarlo.
- Igual en sesiones 1 a 1, reforzado también en la base de datos.
- Al crear una clase se sigue eligiendo el profesor que la dictará; ese profesor es el único que puede registrar su duración.

## Detalles técnicos

**Base de datos**
- Nueva tabla `sesiones_canceladas`: `tipo` ('1a1' | 'clase'), `referencia_id`, `profesor_id`, `contraparte_id`, `fecha`, `hora_inicio`, `estado` ('cancelada' | 'no_registrada'), `razon`, `creado_por`, `created_at`. GRANTs para `authenticated` y `service_role`; RLS: inserta el profesor dueño o admin; leen admins y el propio profesor.
- Funciones `cancelar_sesion_1a1(_id uuid, _razon text)` y `cancelar_clase(_id uuid, _razon text)` (security definer): validan que quien llama sea el profesor asignado o admin y que no esté finalizada, guardan la fila en `sesiones_canceladas` y borran el registro original.
- Función `marcar_no_registradas()` (security definer): para sesiones/clases con fecha < hoy − 7 días y `duracion_min IS NULL`, inserta en `sesiones_canceladas` con estado `no_registrada` y las quita de la agenda. Se programa con `pg_cron` diariamente.
- Endurecer `registrar_duracion_clase` y `registrar_duracion_sesion`: quitar el bypass de admin para que solo el `profesor_id` pueda registrar.

**Frontend**
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: el diálogo de eliminar pide razón (textarea obligatoria, mín. 5 caracteres) y llama a la RPC nueva.
- `src/routes/_authenticated/calendario-clases.tsx`: botón de duración solo si `c.profesor_id === session.user.id` (se elimina `|| role === "admin"`), y botón "Eliminar con razón" para la clase propia no finalizada.
- `src/routes/_authenticated/pagos.tsx` + `src/lib/pagos-export.ts`: cargar `sesiones_canceladas` del profesor y mes seleccionado, mostrarlas en una sección aparte y añadirlas al PDF/Excel con monto $0.

## Fuera de alcance
- No se cambian las reglas de reserva ni el cálculo de tarifas existente.