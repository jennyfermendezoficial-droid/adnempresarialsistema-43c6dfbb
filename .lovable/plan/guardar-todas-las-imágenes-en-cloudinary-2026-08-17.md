# Guardar todas las imágenes en Cloudinary

Todas las imágenes del sistema pasan a subirse a Cloudinary. En la app se ven igual (o mejor: cargan más rápido y se ajustan de tamaño solas). Lo que ya está subido sigue funcionando; lo nuevo va a Cloudinary.

## Paso a paso para ti (antes de que yo programe)

1. Entra a cloudinary.com y crea una cuenta gratis (o inicia sesión).
2. En el panel, arriba, busca **Dashboard / API Keys**.
3. Ahí verás tres datos:
   - **Cloud name** (ej. `dxxxxxx`)
   - **API Key** (números)
   - **API Secret** (oculto, dale a "Reveal")
4. Cuando apruebes este plan, te abriré un formulario seguro para pegar esos tres valores. No se guardan en el código, quedan cifrados.
5. Listo: desde ese momento cada foto que suba cualquier usuario se guarda en tu cuenta de Cloudinary y la puedes ver en Media Library.

## Qué se cambia en la app

Pasan a Cloudinary todas las subidas de imágenes:

- Comunidad: imágenes de publicaciones y portada de la comunidad
- Perfil: foto de usuario y foto del negocio
- Cursos: portadas de curso
- Chats (1 a 1, profesores): imágenes enviadas
- Tareas: imágenes que suben las alumnas
- Pagos: fotos de comprobantes

Los **videos** y los **archivos que no son imagen** (PDF, documentos) siguen como están hoy.

## Detalles técnicos

- Subida **firmada**: una server function (`src/lib/cloudinary.functions.ts`) genera la firma con el API Secret en el servidor; el navegador sube el archivo directo a Cloudinary. El secreto nunca llega al cliente.
- Secretos: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Helper único `subirImagen(file, carpeta)` en `src/lib/cloudinary.ts` que devuelve la URL final; reemplaza las llamadas a `supabase.storage...upload` de imágenes en: `PostEditor.tsx`, `perfil.tsx`, `CursosBiblioteca.tsx`, `ChatThread.tsx`, `tareas.tsx`, `RegistrarAbonoModal.tsx`, `CursoDetalle.tsx` (solo portadas/imágenes).
- Carpetas en Cloudinary por área: `adn/comunidad`, `adn/avatares`, `adn/cursos`, `adn/chats`, `adn/tareas`, `adn/comprobantes`.
- Se guarda la URL de Cloudinary en las mismas columnas de la base de datos que ya existen, así que las pantallas no cambian de estructura.
- Las imágenes ya guardadas en el almacenamiento actual se siguen mostrando: el código detecta si la URL es de Cloudinary o no.
- Nota de privacidad: comprobantes y tareas hoy son privados con enlace temporal. En Cloudinary quedarán con URL pública difícil de adivinar (nombre aleatorio). Si prefieres mantenerlos privados, dímelo y dejo esos dos fuera.

## Fuera de alcance

No se migran los archivos antiguos, no se tocan los videos de Bunny ni ninguna otra funcionalidad.
