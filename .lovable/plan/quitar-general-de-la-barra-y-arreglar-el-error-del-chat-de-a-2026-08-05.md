# Quitar "General" de la barra y arreglar el error del chat de arriba

Ahora que el canal General vive en el panel flotante de la barra superior, se saca la pestaña "General" del menú y se corrige el error que aparece al abrir ese panel.

## Qué cambia

- Se elimina la pestaña **General** de la fila de menús (arriba en computador y en el menú lateral móvil). El chat general queda solo en el ícono de mensajes de la barra superior.
- El enlace "Abrir canal" del panel se quita, ya que el canal completo deja de estar en el menú. El panel flotante pasa a ser la única forma de usar #General.
- Se corrige el error ("This page didn't load") al abrir el chat desde la barra.

## Sobre el error

Todavía no está confirmada la causa exacta: la página de error que ves es la pantalla genérica de fallo, sin detalle. Primer paso será reproducirlo abriendo el panel en el navegador y leyendo el error real de consola; la sospecha principal es que el chat incrustado falla al calcular su alto/scroll o al pedir datos dentro del panel, pero se confirma antes de tocar código.

Además, para que un fallo del chat nunca tumbe toda la página, el contenido del panel se envuelve en un límite de error: si algo falla, se muestra un mensaje pequeño dentro del panel en vez de la pantalla de error completa.

## Detalles técnicos

- `src/lib/nav-items.ts`: eliminar `canalesItems` (entrada `/general`).
- `src/components/TopNav.tsx`: quitar `canalesItems` del arreglo `flat`.
- `src/components/AppSidebar.tsx`: quitar la entrada de General si aparece ahí.
- `src/components/GeneralChatPopover.tsx`: quitar el `Link` a `/general`, envolver `ChatThread` en un error boundary local y aplicar el arreglo que resulte del diagnóstico.
- La ruta `src/routes/_authenticated/general.tsx` se mantiene (sin enlace) para no romper nada; se puede borrar si lo prefieres.
- Sin cambios de base de datos.
