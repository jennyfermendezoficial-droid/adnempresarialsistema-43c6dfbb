## Objetivo
Permitir que cada usuario tenga **hasta 5 sesiones activas al mismo tiempo** (5 dispositivos/navegadores distintos logueados con la misma cuenta). Si intenta abrir una 6ta sesión, se cierra la más antigua automáticamente.

## Cómo funcionará

1. Cuando un usuario inicia sesión, se registra su sesión actual en una tabla `sesiones_activas` con: `user_id`, `session_id` (un UUID generado en el cliente y guardado en localStorage), `dispositivo` (user agent), `ultima_actividad`, `creada_en`.
2. Al iniciar sesión, el sistema cuenta cuántas sesiones activas tiene el usuario:
   - Si tiene menos de 5 → registra la nueva normalmente.
   - Si ya tiene 5 → elimina la más antigua (por `ultima_actividad`) y registra la nueva. El dispositivo expulsado, al hacer cualquier acción, detecta que su sesión ya no existe y se desloguea automáticamente con un mensaje: *"Tu sesión se cerró porque se superó el límite de 5 dispositivos."*
3. Cada vez que el usuario navega/usa la app, se actualiza `ultima_actividad` (cada 2-3 minutos, no en cada click).
4. Al cerrar sesión manualmente, se borra el registro de esa sesión.
5. Las sesiones inactivas por más de 30 días se limpian automáticamente.

## Cambios técnicos

### Base de datos (migración)
- Nueva tabla `public.sesiones_activas` (`id`, `user_id`, `session_id` único, `dispositivo`, `ip`, `creada_en`, `ultima_actividad`).
- RLS: cada usuario ve/borra solo sus propias sesiones; admin ve todas.
- GRANTs a `authenticated` y `service_role`.
- Función RPC `registrar_sesion(session_id, dispositivo)` que: inserta la sesión, y si hay >5, borra la más antigua. `SECURITY DEFINER`.
- Función RPC `validar_sesion(session_id)` que devuelve `true/false` si la sesión sigue activa.

### Frontend
- `src/lib/auth-context.tsx`:
  - Al detectar `SIGNED_IN`, generar un `session_id` (UUID), guardarlo en `localStorage`, y llamar `registrar_sesion`.
  - Cada 2 minutos (o al cambiar de ruta), llamar `validar_sesion`. Si devuelve `false` → `signOut()` + toast *"Tu sesión se cerró: superaste el límite de 5 dispositivos activos."*
  - Al hacer `signOut`, borrar el registro de la sesión actual y limpiar `localStorage`.

### Página opcional (no incluida, solo aviso)
- No agrego UI nueva para listar dispositivos activos. Si querés esa pantalla ("mis dispositivos conectados, cerrar sesión remota"), avisame y la sumo.

## Lo que NO cambia
- El login sigue igual (email + contraseña).
- No se tocan permisos, roles, ni otras tablas.
- No afecta a usuarios ya logueados hasta su próximo inicio de sesión (las sesiones viejas no tienen `session_id` registrado y se contarán como "sin límite" hasta que vuelvan a entrar — alternativamente las puedo invalidar todas de golpe forzando un re-login global; decime si lo querés).

## Confirmación
¿Procedo así? ¿O preferís:
- (a) Bloquear el 6to login con error en vez de expulsar al más antiguo, o
- (b) Sumar la pantalla "Mis dispositivos conectados" para ver/cerrar sesiones manualmente?
