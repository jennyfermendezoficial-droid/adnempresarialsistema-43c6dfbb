# Menú superior en computador (estilo de la imagen)

## Qué cambia

En pantallas de computador el menú lateral izquierdo desaparece y se convierte en una barra superior de dos filas, con los mismos colores morados/oscuros que hoy tiene la barra lateral. Así la pantalla se ensancha y se ve mucho más contenido.

**Fila 1 (superior)**
- Logo + "ADN Empresarial" a la izquierda.
- A la derecha: botón de descargar app (solo el ícono de flecha, sin texto, con tooltip "Descargar app"), y el avatar del usuario con menú desplegable (Mi perfil / Cerrar sesión).

**Fila 2 (pestañas)**
- Enlaces directos: Inicio, Tutoriales, General, Agenda 1 a 1, Miembros.
- Grupos que se despliegan al pasar/hacer clic, para optimizar espacio:
  - **Academia** → Cursos, Calendario de clases, Mis clases asignadas.
  - **Admin** (solo admin/soporte) → Permisos, Acceso a cursos, Pagos e informes.
- La pestaña activa se marca con subrayado y color destacado (igual criterio de activo que hoy, incluyendo rutas hijas).
- Si no caben todos los elementos, los sobrantes pasan a un menú "Más".

**Celular y tablet**
- Todo queda igual que hoy: barra con las tres rayitas y el menú lateral deslizante con sus secciones (Inicio, Canales, Soporte, Academia, Comunidad, Admin) y el botón de descargar app con texto.

## Detalles técnicos

- Nuevo componente `src/components/TopNav.tsx`: barra fija superior, visible solo en `lg:` hacia arriba, usando los tokens actuales (`--deep-2`, `--violet-light`, `--violet`, `--line-dark`) para que coincida con la barra lateral.
- Los grupos desplegables usan `DropdownMenu` de shadcn ya presente en `src/components/ui`.
- `src/routes/_authenticated.tsx`: el contenedor pasa de fila (sidebar + main) a columna en `lg:` — `TopNav` arriba y `Outlet` abajo a todo el ancho; el sidebar de escritorio se oculta y el drawer + header con hamburguesa se muestran hasta `lg` (antes era hasta `md`), para que tablet conserve el menú lateral.
- Los ítems de navegación se extraen a `src/lib/nav-items.ts` y los consumen `AppSidebar` y `TopNav`, para no duplicar rutas ni íconos.
- `InstallAppButton` recibe una variante `icon` (solo flecha + `aria-label`/tooltip) sin tocar el modal ni la lógica de instalación existente.
- No se modifica ninguna ruta, consulta ni regla de negocio: es solo presentación.
