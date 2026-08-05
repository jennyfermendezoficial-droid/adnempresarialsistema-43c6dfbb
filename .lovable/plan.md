# Campana de notificaciones en la barra superior

Agregar un botón de campana al lado del botón de mensajes (a la izquierda de la flecha de descarga) que abre un panel con las notificaciones reales de toda la plataforma, con contador de no leídas.

## Qué mostrará

Notificaciones generadas automáticamente por lo que ya pasa en la app:

- Mensaje nuevo en el canal #General
- Mensaje nuevo en un chat 1 a 1 (y chat de profesores, para staff)
- Nueva reserva de sesión 1 a 1 (avisa al profesor asignado y a admins)
- Recordatorio/creación de clase en vivo asignada (avisa al profesor y a los alumnos con acceso)
- Nueva tarea publicada (a los alumnos) y nueva entrega de tarea (al profesor de la tarea)
- Calificación o feedback recibido en una tarea (al alumno)
- Sesión 1 a 1 finalizada → califica a tu profesor

## Cómo se verá

- Ícono de campana con el mismo estilo de la barra; globo rojo con el número de no leídas (hasta 99+).
- Panel flotante alineado a la derecha (ancho ~380 px, alto ~460 px) con encabezado "Notificaciones" y acción "Marcar todo como leído".
- Cada fila: avatar/ícono según el tipo, título en negrita, texto breve, tiempo relativo ("hace 7 d") y punto azul si no está leída.
- Al hacer clic, marca esa notificación como leída y navega al menú correspondiente (/general, /chats, /agenda-1a1, /mis-clases-asignadas, /calendario-clases, /tareas, /cursos).
- Estado vacío: "No tienes notificaciones".
- Llegan en tiempo real: el contador sube sin recargar.

## Detalles técnicos

Base de datos (migración nueva, sin tocar lo existente):

- Tabla `public.notificaciones`: `id`, `usuario_id`, `tipo`, `titulo`, `cuerpo`, `url`, `actor_id`, `referencia_id`, `leida` (bool), `created_at`.
- GRANT `SELECT, UPDATE, DELETE` a `authenticated` (y `ALL` a `service_role`); RLS activa con políticas: cada usuario solo ve/actualiza/borra sus propias filas. La inserción la hacen únicamente triggers `SECURITY DEFINER` (sin política de INSERT para usuarios).
- Función `notificar(_usuarios uuid[], _tipo, _titulo, _cuerpo, _url, _actor, _referencia)` `SECURITY DEFINER`.
- Triggers AFTER INSERT/UPDATE que llaman a esa función, sin modificar la lógica actual de cada tabla:
  - `canal_general_mensajes` (a todos menos el autor), `mensajes_chat_1a1` (al otro miembro del chat), `chat_profesores_mensajes` (a admin/soporte menos el autor)
  - `sesiones_1a1` INSERT (profesor + admins) y UPDATE a finalizada (alumna)
  - `clases_en_vivo` INSERT (profesor asignado + usuarios con permiso del curso, o todos si no tiene curso)
  - `tareas` INSERT (alumnas con permiso del curso) y `tareas_entregas` INSERT (profesor creador) / UPDATE de calificación o feedback (alumna)
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones` para el tiempo real.
- Índice por `(usuario_id, leida, created_at desc)`.

Frontend:

- Nuevo `src/components/NotificationsPopover.tsx`: usa `Popover` de shadcn (mismo patrón que `GeneralChatPopover`), carga las últimas 30 notificaciones del usuario, se suscribe a INSERT en `notificaciones` filtrando por `usuario_id`, marca leídas al hacer clic y con "Marcar todo como leído".
- `src/components/TopNav.tsx`: montar `<NotificationsPopover />` justo después de `<GeneralChatPopover />` y antes del botón de instalar. No se toca nada más de la barra.
- `src/hooks/useGlobalNotifications.ts` sigue igual (notificaciones push del navegador); el panel es la vista dentro de la app.
