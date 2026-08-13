# Miembros al estilo comunidad

Rediseñar la página **Miembros** para que se vea como la referencia: lista en una sola columna, con foto, nivel, nombre, usuario, biografía, estado en línea y fecha de ingreso, más un botón **CHAT** a la derecha. **Sin botón "Invitar"**.

## Qué se ve

- Filtros arriba en forma de píldoras: `Miembros N`, `Administradores N`, `En línea N`.
- Buscador de miembros arriba de la lista.
- Cada fila muestra:
  - Foto de perfil con la insignia de nivel en la esquina.
  - Nombre completo y, debajo, el usuario en formato `@nombre-apellido-1234`.
  - Su biografía o actividad en una línea.
  - Punto verde "En línea ahora" o "Activo hace X" cuando corresponda.
  - "Se unió el <mes día, año>".
  - Botón **CHAT** a la derecha (no aparece en tu propia fila), que abre el chat privado con esa persona.
- Al tocar la fila se abre el perfil público del miembro, como ahora.
- Sin botón de invitar y sin mostrar correos electrónicos ni el rol crudo; los administradores se distinguen por el filtro y una etiqueta discreta.

## Detalles técnicos

- Reescribir `src/routes/_authenticated/miembros.tsx`:
  - Datos vía `perfiles_publicos()` (nombre, avatar, actividad, biografía, fecha de ingreso, puntos, nivel) en lugar de leer `profiles` y `user_roles` directamente, así se evita exponer correos.
  - Administradores/staff se identifican con `listar_profesores()`.
  - Insignia de nivel con `NivelBadge`; `@handle` derivado del nombre normalizado + 4 dígitos estables del id.
  - Botón CHAT navega a `/chats?con=<userId>` (flujo ya existente).
- Estado en línea: nueva función segura en la base de datos que devuelve solo `user_id` + `ultima_actividad` agregada desde `sesiones_activas` para usuarios autenticados (sin exponer sesiones ni dispositivos). Se considera "en línea" la actividad de los últimos 5 minutos.
- Sin cambios en el menú ni en otras páginas.
