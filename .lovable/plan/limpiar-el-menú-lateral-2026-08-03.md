# Limpiar el menú lateral

Quitar del menú los apartados que ya no se usan, sin tocar el resto.

## Se quitan del menú

- Soporte: Chats, y la sección completa desaparece si queda vacía (Agenda 1 a 1 se mantiene)
- Canales: Chat profesores
- Academia: Tareas
- Mi Agenda Emprendedora: Agenda diaria, Calendario, Negocio, Casa, Cuentas bancarias, Reportes → la sección entera desaparece
- Admin: Bonos

## Se mantienen igual

Inicio, Tutoriales, General, Agenda 1 a 1, Cursos, Calendario de clases, Mis clases asignadas, Miembros, Permisos, Acceso a cursos, Pagos e informes, Perfil y Cerrar sesión.

## Detalles técnicos

Solo se edita `src/components/AppSidebar.tsx`: se eliminan esas entradas de las listas de navegación y las secciones que quedan sin ítems (Mi Agenda Emprendedora, y Soporte si aplica).

Las páginas y los datos se conservan intactos: nada se borra de la base de datos y las rutas siguen existiendo por si más adelante se quieren volver a mostrar. Si prefieres que también se borren las páginas y sus datos, dilo y lo ajusto.
