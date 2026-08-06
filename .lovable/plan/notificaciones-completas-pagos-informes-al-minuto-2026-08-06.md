# Notificaciones completas + pagos/informes al minuto

## 1. Notificaciones de sesiones 1 a 1 y clases

**Nueva reserva 1 a 1**
- Al profesor y a los admins: "Nueva reserva 1 a 1 — Ana reservó con el profe Luis · 12/08 09:00".
- Al estudiante también le llega su confirmación: "Reserva confirmada — con el profe Luis · 12/08 09:00". Hoy no le llega porque el sistema omite a quien hizo la acción.
- Los estudiantes siguen recibiendo aviso de clases en vivo nuevas (ya funciona) y ahora también el nombre del profesor que la dicta.

**Recordatorios 1 hora antes**
- Una hora antes de cada sesión 1 a 1 llega aviso al estudiante y al profesor: "Tu sesión 1 a 1 empieza en 1 hora · 09:00".
- Una hora antes de cada clase en vivo llega aviso al profesor y a las alumnas con acceso.
- Se envía una sola vez por sesión/clase (no se repite).

## 2. Pagos e informes al minuto

- Todo lo que hoy muestra solo horas pasa a mostrar horas y minutos: "1 h 10 min", "35 min", "4 min".
- El monto se calcula con los minutos exactos (tarifa ÷ 60 × minutos), como ya quedó en la base; se corrigen las pantallas que redondeaban a horas y a dólares enteros (ahora con 2 decimales).
- Aplica en: tarjetas de resumen (Horas totales), tabla del equipo, detalle del profesor y bitácora.

## 3. Selector de mes

- Hoy solo aparecen los últimos 12 meses corridos. Pasa a listar **todos los meses del año** (Enero a Diciembre) del año actual y de los años anteriores con actividad, en orden descendente, tal como en la imagen.
- Mismo selector en Pagos y en Mis reportes.

## 4. Exportar PDF y Excel (Pagos)

- **PDF**: reporte del mes con encabezado de marca, mes/año, totales (a pagar, horas y minutos, sesiones, calificación) y la tabla del equipo (profesor, tema, horas clase, sesiones 1:1, calificación, monto, estado). Pie con fecha de generación.
- **Excel**: archivo .xlsx con las mismas columnas en texto plano, **sin avatares ni círculos de color ni fotos**, con encabezados, anchos de columna y fila de totales. Montos y minutos como números.

## Detalles técnicos

Base de datos (migración):
- `notif_sesion_1a1_ins`: incluir profesor + admins con el nombre del profesor en el cuerpo, e insertar aparte la notificación para la alumna (sin filtrar por actor).
- `notif_clase_nueva`: añadir el nombre del profesor al cuerpo.
- Columna `recordatorio_enviado boolean default false` en `sesiones_1a1` y `clases_en_vivo`.
- Función `enviar_recordatorios()` (security definer) que busca sesiones/clases cuyo inicio cae en los próximos 55–65 min (zona America/Guayaquil), notifica y marca la bandera; programada con `pg_cron` cada 5 minutos.

Frontend:
- `src/lib/tiempo.ts` (nuevo): `formatHM(minutos)` para mostrar "1 h 10 min".
- `src/routes/_authenticated/pagos.tsx`: acumular minutos en vez de horas redondeadas, usar `formatHM`, montos con 2 decimales, selector de meses completo, y exportadores reales de PDF/Excel.
- `src/routes/_authenticated/mis-reportes.tsx`: mismo selector de meses y minutos.
- `src/lib/pdf-reports.ts`: añadir `generarPagosPDF`; nuevo `src/lib/excel-export.ts` usando `xlsxwriter`-equivalente en JS (`xlsx`) para el .xlsx.

## Fuera de alcance
- No se cambian tarifas ni reglas de reserva.
