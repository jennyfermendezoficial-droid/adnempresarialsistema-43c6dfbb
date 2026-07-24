## Diagnóstico confirmado

- El reproductor muestra "404" porque el backend responde `Bunny status 401` al consultar el estado de cada video en Bunny (verificado en las peticiones de red actuales, se repite cada ~10s).
- Los `bunny_video_id` en la base de datos son correctos (GUIDs válidos) y el código del reproductor está bien.
- El problema es **credenciales**: la `BUNNY_STREAM_API_KEY` guardada ya no autentica contra `video.bunnycdn.com`.

## Qué haremos

1. **Renovar la API key de Bunny Stream**
   - Abrir un formulario seguro para que pegues la API key actualizada de la biblioteca de Bunny (Bunny.net → Stream → tu biblioteca → API → "API Key").
   - Verificar también que `BUNNY_STREAM_LIBRARY_ID` y `BUNNY_STREAM_CDN_HOSTNAME` sigan siendo los correctos de esa misma biblioteca (te los pediré solo si sospechamos que también cambiaron).
2. **Validar en vivo** — Una vez guardada la key, entramos a "Dia 1 ADN Empresarial" y confirmamos que el iframe deja de mostrar 404 y reproduce. Como el frontend hace polling cada 5–10s, se ve el cambio sin recargar.
3. **Mejora chiquita opcional** — Si te sirve, en el reproductor podemos mostrar un mensaje claro tipo "El servicio de video no está autenticado, contacta al admin" en lugar del 404 crudo, para que los alumnos no se confundan si vuelve a pasar.

## Lo que NO hay que hacer

- No hay que re-subir los videos (siguen en Bunny).
- No hay que cambiar código del reproductor (funciona bien).
- No hay que tocar la base de datos.

## Detalles técnicos

- Secret afectado: `BUNNY_STREAM_API_KEY` (runtime secret).
- Server function afectada: `getBunnyVideoStatus` en `src/lib/bunny.functions.ts` — usa `AccessKey: apiKey` contra `https://video.bunnycdn.com/library/{libraryId}/videos/{videoId}` y recibe 401.
- Efecto colateral: al no llegar `ready: true`, el iframe cae a la variante donde Bunny devuelve 404 en el reproductor embed.

Al aprobar este plan, el primer paso será abrirte el formulario seguro para pegar la nueva API key de Bunny.