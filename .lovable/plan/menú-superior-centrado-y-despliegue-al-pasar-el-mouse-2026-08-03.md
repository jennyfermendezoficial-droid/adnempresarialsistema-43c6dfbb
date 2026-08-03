# Menú superior: centrado y despliegue al pasar el mouse

## Qué cambia

1. **Todo centrado**
   - El contenido del menú se limita a un ancho máximo centrado en pantalla, en vez de quedar pegado a los bordes.
   - La fila de pestañas (Inicio, Tutoriales, General, Academia, Admin...) queda centrada horizontalmente, con espacios parejos entre cada opción.
   - La fila superior mantiene el logo a la izquierda y el perfil/descarga a la derecha, alineados con el mismo ancho centrado.

2. **Menús que se abren solos al pasar el mouse**
   - "Academia" y "Admin" se despliegan automáticamente al pasar el cursor, sin necesidad de hacer clic.
   - Se cierran solos al retirar el mouse, con una pequeña demora para que no se cierre al mover el cursor hacia las opciones.
   - El clic sigue funcionando igual (útil en pantallas táctiles).

3. Celular y tablet siguen exactamente igual (menú de tres rayitas).

## Detalle técnico

- `src/components/TopNav.tsx`: envolver ambas filas en un contenedor `mx-auto max-w-[1400px]`; la `<nav>` pasa a `justify-center`.
- Los grupos desplegables cambian de `DropdownMenu` controlado por clic a estado abierto controlado (`open` / `onOpenChange`) con handlers `onMouseEnter` / `onMouseLeave` sobre el disparador y el contenido, y un timeout de ~150 ms al salir.
- Sin cambios de datos ni de lógica de negocio.
