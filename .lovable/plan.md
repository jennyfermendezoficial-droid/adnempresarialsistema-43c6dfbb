# Botón de mensajes en la barra superior

Agregar un ícono de chat en la barra superior, justo a la izquierda de la flecha de descargar app. Al hacer clic se abre un panel pequeño (tipo desplegable) con el canal **#General**, para leer y escribir sin salir de la página.

## Cómo se verá

- Ícono de burbuja de mensaje con el mismo estilo/colores de la barra (hover suave), a la izquierda del botón de instalar.
- Al pulsarlo: panel flotante alineado a la derecha, ancho aprox. 380 px y alto 460 px.
- Encabezado del panel: "General" + enlace "Abrir canal" que lleva a la página completa `/general`.
- Cuerpo: los mensajes del canal general con scroll, igual que en la página, pero compacto.
- Pie: caja para escribir y enviar (texto, adjuntos y audio, tal como ya funciona).
- Indicador (punto) en el ícono cuando hay mensajes nuevos que llegaron mientras el panel estaba cerrado.
- Solo en la barra superior de escritorio; en móvil no cambia nada.

## Detalles técnicos

- Nuevo componente `src/components/GeneralChatPopover.tsx`:
  - Usa `DropdownMenu`/`Popover` de shadcn ya presente en el proyecto para el panel.
  - Reutiliza `ChatThread` con `table="canal_general_mensajes"` y `height="100%"`; carga `authorMap` desde `profiles` (id, nombre_completo, email, avatar_url) igual que `general.tsx`.
  - Punto de no leídos: suscripción realtime a INSERT en `canal_general_mensajes`; se marca visto al abrir el panel y se guarda el último `created_at` visto en `localStorage`.
- `src/components/TopNav.tsx`: renderizar `<GeneralChatPopover />` antes de `<InstallAppButton variant="icon" />` en la fila 1.
- Sin cambios de base de datos ni de permisos.
