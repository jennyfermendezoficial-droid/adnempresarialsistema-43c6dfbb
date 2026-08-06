# Mostrar el profesor en las notificaciones de reserva 1 a 1

## Qué pasa hoy

Las notificaciones que ves en la imagen ("Marcia Eulalia Buri Macancela agendó para 06/08 · 17:00") se crearon **antes** del cambio de ayer. El texto nuevo ya incluye al profesor ("… reservó con el profe X · 06/08 · 17:00"), pero las notificaciones viejas quedaron guardadas con el texto anterior y no se actualizan solas.

Verificado: la función que genera las notificaciones ya arma el texto con el nombre del profesor; las filas antiguas en la tabla conservan el texto sin profesor.

## Qué se hará

- Reescribir el texto de las notificaciones de reserva 1 a 1 ya existentes para que digan "Alumna reservó con Profesor · fecha · hora", tomando el profesor de la sesión asociada.
- Si alguna notificación vieja ya no tiene sesión asociada (sesión borrada), se deja el texto tal cual.

Después de esto, tanto las viejas como las nuevas mostrarán con quién es la sesión.

## Detalles técnicos

Migración de datos (sin cambios de esquema):

```sql
UPDATE public.notificaciones n
SET cuerpo = public.nombre_usuario(s.alumna_id)
  || ' reservó con ' || public.nombre_usuario(s.profesor_id)
  || ' · ' || to_char(s.fecha,'DD/MM')
  || ' · ' || to_char(s.hora_inicio,'HH24:MI')
FROM public.sesiones_1a1 s
WHERE n.referencia_id = s.id
  AND n.tipo = 'sesion_nueva'
  AND n.titulo = 'Nueva reserva 1 a 1'
  AND n.cuerpo NOT LIKE '%reservó con%';
```

Las notificaciones con título "Reserva confirmada" (las del estudiante) ya incluyen al profesor y no se tocan.

## Fuera de alcance
- No se cambia el diseño del panel ni la lógica de reservas.
