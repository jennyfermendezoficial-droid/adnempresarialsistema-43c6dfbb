# Registrar duración también en clases en vivo

## Qué cambia para el usuario

**Agenda 1 a 1 (confirmación)**
- Registrar duración solo lo puede hacer el profesor con quien se agendó la sesión (o un admin). Ya está así en la base de datos; se mantiene y además el botón solo aparece para ese profesor.
- Si se equivocaron, se puede volver a editar la duración.

**Calendario de clases (nuevo)**
- Al terminar una clase en vivo, el profesor que la dicta ve el botón "Registrar duración" en la tarjeta de la clase (en el calendario y en "Mis clases asignadas").
- Mismo modal que en 1 a 1, con dos formas:
  - Cuánto duró (minutos) → calcula la hora de fin.
  - A qué hora terminó → calcula los minutos.
- Al guardar, la clase queda finalizada y muestra "09:00 – 10:20 · 80 min", y se puede editar después.
- Esa duración real suma a las horas trabajadas del profesor, con su tarifa por hora de clase.

## Detalles técnicos

**Base de datos** (migración)
- `clases_en_vivo`: agregar `duracion_min integer` y `finalizada_at timestamptz`.
- Nueva función `registrar_duracion_clase(_clase_id uuid, _duracion_min integer)` (security definer): valida que quien llama sea el `profesor_id` de la clase o admin, actualiza `duracion_min` / `hora_fin` / `finalizada_at`, y reemplaza el registro en `horas_trabajadas` (`tipo = 'clase'`, `referencia_id = clase_id`) usando `tarifa_hora_clase` del profesor. Al reeditar borra el registro anterior y lo vuelve a insertar, así no se duplica el pago.

**Frontend**
- `src/components/RegistrarDuracionModal.tsx`: recibir el tipo (`1a1` o `clase`) para llamar a la RPC correspondiente y aceptar un valor inicial cuando se edita.
- `src/routes/_authenticated/calendario-clases.tsx`: botón "Registrar/Editar duración" solo si el usuario es el `profesor_id` de la clase (o admin) y la hora de inicio ya pasó; mostrar la duración registrada en la celda.
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: mismo botón para las clases en vivo propias, junto al que ya existe para 1 a 1, y permitir editar la duración ya registrada.

## Fuera de alcance
- No se cambian las reglas de reserva ni otras secciones.