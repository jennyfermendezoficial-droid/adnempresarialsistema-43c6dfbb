# Nombres con mayúscula y "Mis clases asignadas" solo mías

## 1. Nombres siempre bien escritos

Hoy conviven nombres como `maria veronica zhumi cajamarca` y `JENNYFER MENDEZ CALLE`. Se normalizan a formato de nombre propio: **María Veronica Zhumi Cajamarca**, **Jennyfer Mendez Calle**.

- Al registrarse o al editar el perfil, el nombre se guarda automáticamente con cada palabra en mayúscula inicial, sin espacios sobrantes (aunque el usuario escriba todo en minúscula o todo en mayúscula).
- Se corrigen también todos los nombres ya existentes en la base.
- Además, en pantalla (agenda, chats, pagos, notificaciones, miembros) se aplica el mismo formato al mostrar, para que nada se vea tosco aunque venga de datos viejos.
- Se respetan partículas cortas en minúscula (de, del, la, los, y) salvo cuando abren el nombre.

## 2. "Mis clases asignadas" muestra solo lo mío

Comportamiento correcto: en esa página cada persona ve **únicamente** las clases en vivo donde ella es la profesora y las sesiones 1 a 1 donde participa (como profesora o como estudiante). Nunca las de otros profesores.

- El listado de clases en vivo se filtra siempre por "yo soy el profesor asignado", sin excepción por rol (hoy, si el rol no es admin/soporte, se cargan todas las clases del sistema).
- Las sesiones 1 a 1 se filtran por participación real y, además, se descarta en pantalla cualquier fila que no sea mía.
- El botón "Registrar / Editar duración" aparece solo si yo soy el profesor de esa clase o sesión. Se quita la excepción actual que se lo muestra a admin sobre clases ajenas, y el "soy profesor" pasa a calcularse comparando explícitamente el profesor de la sesión con mi usuario (hoy se deduce por descarte, lo que puede marcar como mías sesiones ajenas visibles por permisos de administración).

## Detalles técnicos

- Migración: función `public.titlecase_nombre(text)` + trigger `BEFORE INSERT OR UPDATE` en `profiles` que normaliza `nombre_completo`; ajuste equivalente en `handle_new_user()`.
- Backfill de `profiles.nombre_completo` con la nueva función.
- Nuevo helper `src/lib/nombres.ts` (`formatNombre`) usado en `mis-clases-asignadas`, `agenda-1a1`, `miembros`, `chats`, `pagos`, `mis-reportes`, `permisos`, `TopNav`, `AppSidebar` y notificaciones.
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: query de `clases_en_vivo` siempre con `.eq("profesor_id", uid)`; `soyProfe` = `s.profesor_id === uid`; condición del botón de duración basada solo en eso.

## Fuera de alcance
- No se cambian reglas de reserva, pagos ni otras secciones.
