# Cambiar el botón "General" por "Chats" (soporte)

El botón de mensajes de la barra superior deja de ser el canal general con etiquetas y pasa a ser un panel de **Chats** privados, como en la imagen.

## Cómo funcionará

- **Alumnos**: al abrir el panel ven un buscador "Buscar usuarios" con la lista de cuentas de soporte/profesores. Pueden iniciar chat con cualquiera de ellos y escribir su duda directamente.
- **Soporte / profesores**: solo ven los chats que un alumno ya les abrió. No pueden iniciar conversación ni buscar alumnos desde este panel (la lista aparece vacía hasta que alguien les escriba).
- **Lista de conversaciones**: foto, nombre, hora relativa ("18d", "mar. 19") y una vista previa del último mensaje, tal como en la imagen.
- **Buscador**: para alumnos filtra soporte y chats existentes; para soporte filtra sus chats existentes por nombre.
- **Filtro "Todos"** arriba a la derecha: Todos / No leídos.
- Al elegir una conversación se abre el hilo dentro del mismo panel, con botón de volver a la lista; se puede escribir, enviar imágenes/archivos igual que hoy.
- **Punto de no leídos** en el ícono cuando llega un mensaje nuevo (en tiempo real), igual que ahora.
- La página completa `/chats` se mantiene tal cual y comparte la misma lógica.

## Qué se elimina

- El chat `# General` del panel superior, con su sistema de menciones `@alguien` / `@everyone`. Ya no será necesario etiquetar: cada duda va en el chat privado con soporte.
- No se borra la tabla del canal general ni su historial; solo deja de mostrarse en la barra superior.

## Detalles técnicos

- Nuevo `src/components/ChatsPopover.tsx` (reemplaza a `GeneralChatPopover` en `src/routes/_authenticated.tsx`; el archivo antiguo se elimina).
- Datos: `chats_1a1` + `mensajes_chat_1a1` (último mensaje por chat para la vista previa), nombres/fotos con `fetchPerfiles`, staff con `listar_profesores()`. Sin cambios de base de datos ni de RLS.
- Reutiliza `ChatThread` para el hilo y el envío de notificaciones push existentes.
- Realtime: una sola suscripción a `mensajes_chat_1a1` para refrescar lista y marcar no leídos, con limpieza al desmontar.
