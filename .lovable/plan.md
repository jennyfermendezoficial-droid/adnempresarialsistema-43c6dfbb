# Restaurar la vista de Miembros como en la imagen

La versión actual de Miembros es una cuadrícula simple de tarjetas. La vista que aparece en tu captura (buscador grande, pestañas y botón CHAT) no está en el código actual: se perdió al revertir a una versión anterior. Se vuelve a dejar exactamente como en la imagen.

## Cómo quedará

- Buscador ancho arriba con lupa: "Buscar miembros".
- Pestañas tipo píldora: **Miembros N · Administradores N · En línea N**.
- Lista en una sola columna dentro de una tarjeta:
  - Avatar con anillo e insignia de nivel.
  - Nombre en grande y `@usuario` debajo.
  - Estado: "En línea ahora" con punto verde, o "Activo hace 41d".
  - "Se unió el 9 jun 2026".
  - Botón **CHAT** a la derecha que abre la conversación 1 a 1 con esa persona.
- Al hacer clic en la fila se abre su perfil público.

## Detalles técnicos

Solo se reescribe `src/routes/_authenticated/miembros.tsx`:
- Datos vía `fetchPerfiles()` (`perfiles_publicos`) + `user_roles` para separar administradores.
- Nivel/puntos desde el mismo perfil público; se reutiliza `Avatar`/`NivelBadge`.
- Handle `@nombre-slug-####` derivado del nombre e id, como en la captura.
- "En línea" y "activo hace" a partir de la última actividad del perfil; si el dato no existe, se muestra solo la fecha de ingreso.
- CHAT navega a la ruta de chats con el parámetro `con` ya existente.

No se toca la base de datos ni ninguna otra pantalla.
