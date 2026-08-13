# Quitar de raíz el error "This page didn't load"

## Qué está pasando

El error viene del panel de Chats de la barra superior. Cada vez que la lista de chats se recarga, el componente vuelve a abrir el canal de tiempo real usando **el mismo nombre de canal**. Como el canal anterior todavía no terminó de cerrarse, el sistema devuelve el canal ya suscrito e intenta añadirle escuchas otra vez, lo que lanza el error:

`cannot add postgres_changes callbacks for realtime:chats-popover-... after subscribe()`

Como ese panel vive en el encabezado, el error tumba **todas** las pantallas, no solo el chat.

## Qué haré

1. En el panel de Chats, dejar que la suscripción en tiempo real se cree **una sola vez** por sesión (no cada vez que cambia la función de recarga).
2. Usar un nombre de canal único por montaje para que nunca choque con uno que se está cerrando.
3. Envolver el contenido del panel en un límite de error: si algo dentro del chat falla en el futuro, se muestra un aviso pequeño dentro del panel en vez de romper la página entera.
4. Revisar el resto del proyecto por el mismo patrón (canal de tiempo real recreado en cada cambio de dependencia) y aplicar el mismo arreglo donde aparezca, para que no vuelva por otro lado.
5. Verificar en el navegador: abrir la app, entrar a Inicio y abrir el panel de Chats, y confirmar que la consola queda limpia.

## Detalles técnicos

- `src/components/ChatsPopover.tsx`: guardar `cargar` en un `useRef` y dejar el `useEffect` del canal con dependencia solo de `uid`; nombre de canal con sufijo aleatorio por montaje; `removeChannel` en la limpieza.
- Envoltura con error boundary local alrededor del contenido del popover.
- Sin cambios en la base de datos ni en la lógica de mensajes.
