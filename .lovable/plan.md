# Etiquetas en el canal general, informes por profesor y precios por fecha

## 1. Etiquetar personas en el canal general

- Al escribir en **#General**, se escribe `@` y aparece una lista para elegir a quién avisar.
- El mensaje lo siguen viendo todos; **la notificación (y el sonido) llega solo a los etiquetados**.
- Estudiantes: solo pueden etiquetar profesores.
- Profesores: solo pueden etiquetar estudiantes.
- Opción **@everyone** al inicio de la lista, con la nota debajo: "Avisa a todos los del canal".
- Si un mensaje no etiqueta a nadie, no genera notificación a nadie (se acaba el "tin tin" para todos).
- El nombre etiquetado se resalta dentro del mensaje.

## 2. Informes del profesor en "Mis clases asignadas"

- Nueva vista de **calendario/lista por mes** con todas sus clases en vivo y sesiones 1 a 1 (fecha, hora, con quién, duración registrada).
- Botón **"Reportar reemplazo"** en cada clase: el profesor indica a qué profesor reemplazó ese día y una nota corta.
  - Es solo informativo: las horas siguen contando para el profesor originalmente asignado.
  - Al profesor reemplazado le llega una notificación de ese reporte.
  - Si la clase **ya tiene la duración registrada**, el botón queda deshabilitado con el aviso correspondiente.
- Botón **"Descargar mi informe (PDF)"** del mes seleccionado.

## 3. Pagos e informes (admin)

- **Precio por fecha y hora**: en el detalle de cada profesor, cada clase o sesión de la lista (con su fecha y hora) tiene su propio campo de precio editable por el admin. Se elimina el cálculo automático por calificación; el total del mes es la suma de esos precios.
- **Ajuste manual de horas**: campo para sumar o restar horas/minutos al total del profesor en ese mes (solo el número).
- **Informe por profesor**: botón junto a cada profesor que descarga directamente un **PDF** con:
  - Encabezado de marca, nombre del profesor, mes y año.
  - Resumen: horas y minutos totales, número de clases, sesiones 1 a 1, ajustes y total a pagar.
  - Tabla detallada: fecha, día, hora inicio–fin, tipo (clase en vivo / 1 a 1), tema o estudiante, duración y precio.
  - Sección de reemplazos reportados y sección de sesiones canceladas / no registradas (con su razón, $0).
  - Pie con la fecha de generación.
- Se conservan **Exportar Excel** y **Generar PDF** del mes, actualizados a los nuevos precios por fecha.

## Detalles técnicos

Base de datos (una migración):
- `canal_general_mensajes`: columna `menciones uuid[]`. Se reemplaza el disparador `notif_canal_general` para notificar solo a los mencionados (o a todos cuando el mensaje usa everyone).
- Nueva tabla `reemplazos_clase` (tipo, referencia_id, profesor_reporta, profesor_reemplazado, fecha, nota) con GRANT + RLS: inserta el profesor asignado, leen admin/soporte y ambos implicados; trigger de notificación al reemplazado y validación de que la referencia no tenga `duracion_min`.
- Nueva tabla `pagos_items_precio` (profesor_id, tipo, referencia_id, mes, anio, monto) para el precio por fecha/hora; escritura solo admin.
- Nueva tabla `pagos_ajustes` (profesor_id, mes, anio, minutos); solo admin.

Frontend:
- `src/components/ChatThread.tsx`: prop `mentionables` (filtrada por rol) + autocompletado con `@`, guardado de `menciones`, resaltado y ping local solo si el usuario está mencionado.
- `src/components/GeneralChatPopover.tsx`: pasa la lista de mencionables según el rol.
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: selector de mes, vista de calendario/lista, modal de reemplazo y descarga del informe.
- `src/lib/pagos-export.ts`: nueva función `generarInformeProfesorPDF` y ajuste del Excel/PDF del mes.
- `src/routes/_authenticated/pagos.tsx`: precios editables por ítem, ajuste de horas y botón de informe por profesor.

## Fuera de alcance
- El "otro apartado" que mencionaste al final queda para después.