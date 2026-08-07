# Sidebar de contenido con miniaturas y módulos desplegables

Rediseño del panel derecho de "Clases en vivo" y "Cursos" para que se vea como la imagen de referencia.

## Qué cambia

- **Módulos desplegables**: cada módulo es una fila con número, nombre, porcentaje de avance y barra de progreso. Al dar clic se despliega o se cierra su lista de clases (flecha arriba/abajo). El módulo de la clase que se está viendo aparece abierto por defecto.
- **Miniaturas por clase**: cada clase muestra una imagen de vista previa tomada del propio video (fotograma de portada de Bunny). Si el video aún no tiene imagen (o es un link de YouTube/MP4), se usa el mismo estilo con un ícono de reproducción.
- **Etiquetas sobre la miniatura**: la clase que se está viendo dice "Tocando ahora" con un botón de play; las demás muestran la duración (por ejemplo 01:36) cuando está disponible.
- **Buscador de contenido**: campo "Buscar contenido" arriba del listado; filtra clases por nombre y deja abiertos solo los módulos con resultados.
- **Marca de completada**: check a la derecha de cada clase, como hoy.
- **Administración intacta**: los botones de staff (crear módulo, subir video, añadir por URL, borrar) siguen en el mismo lugar, dentro de la cabecera del módulo.

## Detalles técnicos

- `src/components/CursoDetalle.tsx` (único archivo a modificar):
  - Estado `abiertos: Set<string>` para módulos expandidos + `busqueda: string`.
  - Miniatura Bunny: `https://{cdnHostname}/{bunny_video_id}/thumbnail.jpg` usando el `cdnHostname` que ya devuelve `getBunnyPublicConfig`; `onError` cambia a placeholder con ícono.
  - Duración: se usa `lecciones.duracion_min` si existe, formateada mm:ss/hh:mm.
  - Progreso del módulo: completadas/total ya calculado hoy, se muestra como % y barra.
- Sin cambios en base de datos ni en la lógica de subida, permisos o reproducción.

## Fuera de alcance
- No se cambia el reproductor ni la columna izquierda (título, recursos, marcar completada).
