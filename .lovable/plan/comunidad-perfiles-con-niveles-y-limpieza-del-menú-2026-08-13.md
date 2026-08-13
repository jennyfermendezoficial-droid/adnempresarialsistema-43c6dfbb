# Comunidad, perfiles con niveles y limpieza del menú

Nueva ventana **Comunidad** (estilo Skool) como primera pestaña del menú, perfiles de usuario completos con biografía y niveles, chat desde el perfil, y limpieza de menús.

## Menú (barra superior)

Orden nuevo: **Comunidad · Cursos · Clases en vivo · Calendario de clases · Agenda 1 a 1 · Miembros · Inicio** (Inicio queda a la derecha de Miembros).

- Se elimina por completo **Tutoriales** (página, entrada de menú y las URLs de video guardadas).
- **Mis clases asignadas** deja de verse para usuarios normales: solo profesores/soporte y admin.
- **Admin** sigue igual, visible solo para admin/soporte.

## Comunidad (muro tipo Skool)

- Caja "Escribe algo" arriba; al hacer clic se abre el editor con **Título**, texto, imagen/video adjunto y selector de **Categoría**.
- Filtros por categoría en chips (Todos + categorías creadas por admin).
- Cada publicación: foto y nombre del autor con su **insignia de nivel**, fecha, categoría, título, extracto, contador de **me gusta** y **comentarios**, y aviso del último comentario.
- Al abrir una publicación: contenido completo, me gusta y comentarios (con respuestas simples).
- Publicaciones **fijadas** arriba (solo admin/soporte pueden fijar, editar o borrar cualquier post; cada quien borra el suyo).
- Panel lateral derecho: portada de la comunidad, descripción, número de miembros, administradores.

## Perfil de usuario completo

Al hacer clic en la foto de alguien (en Comunidad o Miembros) se abre su perfil:

- Foto grande con **anillo de nivel**, nombre, actividad, **biografía**, fecha de ingreso y última actividad.
- **Nivel y puntos**: nivel actual, puntos y cuántos faltan para el siguiente.
- **Mis cursos**: por cada curso con acceso, barra de avance (clases completadas / total) y porcentaje.
- **Contribuciones**: sus últimas publicaciones y comentarios en la comunidad.
- Botón **CHAT** que abre la conversación 1 a 1 con esa persona (usa el chat que ya existe).
- En el perfil propio: editar foto, nombre, actividad y **biografía**.

## Puntos y niveles

Los puntos se acumulan automáticamente por:

- Completar una clase de cualquier curso.
- Publicar en la comunidad.
- Comentar.
- Recibir un me gusta.

Niveles del 1 al 9 por umbrales de puntos (5, 20, 65, 155, 515, 2.015, 8.015, 33.015). La insignia de nivel aparece junto al avatar en comunidad, miembros y chats.

## Detalles técnicos

Base de datos (una migración, con GRANT + RLS en cada tabla nueva):
- `comunidad_categorias` (nombre, color, emoji, orden).
- `comunidad_posts` (autor, categoría, título, contenido, media_url, tipo, fijado, contadores).
- `comunidad_comentarios` (post, autor, contenido, comentario padre).
- `comunidad_likes` (post o comentario, usuario; único por par).
- `puntos_usuario` (usuario, origen, referencia, puntos) + vista/función `nivel_usuario(uid)` que suma puntos y calcula nivel.
- `profiles`: nueva columna `biografia`; se amplía `perfiles_publicos()` para devolver biografía, puntos, nivel y fecha de ingreso.
- Triggers que insertan puntos al crear post, comentario, recibir like y al marcar `progreso_lecciones.completada`.
- RLS: lectura para usuarios autenticados; escritura/edición solo del autor; admin/soporte pueden moderar.
- Se elimina la página `tutoriales` y las columnas `tutorial_alumnos_url` / `tutorial_profesores_url` de `app_config`.

Frontend:
- Nuevas rutas `/comunidad`, `/comunidad/$postId` y `/perfil/$userId`.
- Nuevos componentes: muro, editor de publicación, tarjeta de post, hilo de comentarios, insignia de nivel, tarjeta de perfil.
- `src/lib/nav-items.ts` y `TopNav`/`AppSidebar`: nuevo orden y filtro por rol para "Mis clases asignadas".
- El chat del perfil reutiliza `chats_1a1` y `ChatThread`.

## Fuera de alcance

No se toca el sistema de pagos, tareas, agenda 1 a 1 ni la reproducción de videos de los cursos.
