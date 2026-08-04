# Agenda 1 a 1: duración real y nombres visibles

## Qué cambia para el usuario

**1. Ya no son 30 minutos fijos**
- Al reservar solo se muestra la **hora de inicio** (sigue la regla de reservar con 1 día de anticipación y los límites actuales: máx. 3 al día, 1 por profesor).
- La sesión queda como "Duración por definir".
- Cuando termina la reunión, el **profesor** registra el tiempo real desde "Mis clases asignadas" (y también desde la agenda), con dos alternativas:
  - **Duración en minutos** (ej. 45) → el sistema calcula la hora de fin.
  - **Hora en que terminó** (ej. 10:50) → el sistema calcula los minutos.
- Al guardar, la sesión pasa a "finalizada" y muestra "09:00 – 09:50 · 50 min".
- Esa duración real es la que alimenta las horas trabajadas del profesor.

**2. Se ve quién reservó**
- En la cuadrícula de la agenda, si soy el profesor, la celda reservada muestra el **nombre del estudiante** en vez de solo "Reservada".
- En "Tus próximas sesiones" se muestra el nombre real del estudiante (hoy sale genérico "Alumna" porque solo se cargan perfiles de mentores).
- En "Mis clases asignadas" cada sesión 1 a 1 muestra nombre del estudiante, su duda y la duración registrada (o el botón para registrarla).
- Para el estudiante se sigue mostrando el nombre del mentor.

## Detalles técnicos

**Base de datos** (migración)
- `sesiones_1a1`: agregar `duracion_min integer` (nulo hasta que el profesor lo registre) y `hora_fin` pasa a ser nullable/estimada.
- Política de actualización: solo el `profesor_id` de la sesión (o admin) puede escribir `duracion_min`, `hora_fin`, `estado='finalizada'` y `finalizada_at`.
- Al registrar la duración, insertar/actualizar el registro en `horas_trabajadas` del profesor con las horas reales.

**Frontend**
- `src/routes/_authenticated/agenda-1a1.tsx`: quitar `DURACION_MIN = 30` del flujo de reserva (Zoom se crea con 60 min de holgura), cargar los perfiles de las contrapartes (estudiantes) además de los mentores para resolver nombres, y mostrar el nombre en la celda y en la tabla inferior.
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: mostrar nombre del estudiante y botón "Registrar duración" para sesiones ya pasadas sin duración.
- Nuevo modal compartido con dos pestañas: "Minutos" y "Hora de fin", que se convierten entre sí automáticamente.

## Fuera de alcance
- No se toca tareas ni otras secciones.
