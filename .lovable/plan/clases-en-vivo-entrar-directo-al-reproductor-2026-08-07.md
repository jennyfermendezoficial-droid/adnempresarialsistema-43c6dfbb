# Clases en vivo: entrar directo al reproductor

Hoy "Clases en vivo" muestra primero una cuadrícula con una tarjeta y botones "Nueva clase en vivo" y "Entrar". Solo existe un contenedor de clases en vivo ("Clases Pregrabadas ADN Empresarial 3 meses de mentoria"), así que ese paso intermedio sobra.

## Qué cambia

- Al entrar a **Clases en vivo** se abre directamente la pantalla del reproductor con el listado lateral de módulos y clases (igual que la imagen de referencia).
- Desaparecen el botón "Nueva clase en vivo", las tarjetas de portada y el botón "Entrar".
- Se conserva todo lo de subir contenido: admin/soporte pueden crear y ordenar módulos, subir videos, editar y borrar lecciones, y adjuntar recursos, desde esa misma pantalla.
- Las alumnas sin permiso ven un mensaje de "Sin acceso" en lugar del contenido.
- **Cursos queda exactamente igual** (cuadrícula, crear, portadas, entrar).
- Los accesos ya otorgados y "Acceso a clases en vivo" en Admin siguen funcionando igual.

## Detalles técnicos

- Extraer el cuerpo de `src/routes/_authenticated/cursos.$cursoId.tsx` a un componente reutilizable `src/components/CursoDetalle.tsx` que reciba `cursoId`; la ruta de curso pasa a ser un envoltorio delgado.
- `src/routes/_authenticated/clases-en-vivo.tsx`: busca la fila de `cursos` con `tipo = 'clase_en_vivo'` (orden asc, la primera) y renderiza `CursoDetalle` con ese id; si no existe ninguna y el usuario es staff, la crea automáticamente con nombre "Clases en vivo".
- `CursosBiblioteca` deja de usarse para clases en vivo; se mantiene sin cambios para `/cursos`.
- Sin migración de base de datos.

## Fuera de alcance
- No se tocan permisos, tarifas ni el resto de secciones.
