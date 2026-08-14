# Arreglar la vista previa en blanco

## Qué está pasando

El error que aparece en la consola dice que falta un componente llamado `SupportChatsPopover`. Ese archivo ya no existe en el proyecto y **ningún archivo lo importa**: la referencia quedó guardada en la caché del navegador de una versión anterior de la app.

Comprobé la app corriendo en el servidor: carga correctamente la pantalla de inicio de sesión de ADN Empresarial, sin ningún error en consola. Es decir, el código está sano; lo roto es la copia vieja que tiene abierta tu navegador.

## Qué haré

1. Forzar una regeneración limpia de la vista previa (reinicio del servidor y limpieza de la caché de dependencias de Vite) para que el navegador reciba módulos nuevos.
2. Volver a abrir la app y verificar que entra a la pantalla de login y a `/inicio` sin errores.

## De tu lado

Si tras eso todavía ves la pantalla en blanco, haz una recarga forzada (Ctrl+Shift+R / Cmd+Shift+R) en la vista previa: eso descarta el módulo viejo guardado.

## Fuera de alcance

No se cambia ningún componente, ruta ni lógica de la aplicación: no hay código roto que corregir.
