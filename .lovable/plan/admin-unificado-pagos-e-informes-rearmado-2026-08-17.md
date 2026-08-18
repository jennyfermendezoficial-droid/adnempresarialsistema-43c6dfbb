# Admin unificado + Pagos e informes rearmado

## 1. Menú

- **Admin** (solo administradores): una sola ventana con pestañas internas — **Permisos**, **Acceso a cursos**, **Acceso a clases en vivo**. Las tres páginas actuales se fusionan; los enlaces sueltos desaparecen del menú.
- **Pagos e informes** (solo administradores): queda como botón propio, a la derecha de "Admin".
- Soporte/profesores ya no ven ninguno de los dos.

## 2. Pagos e informes — una sola ventana

Se eliminan las pestañas. Todo queda en una página, en este orden:

**Barra superior:** selector de mes · Exportar Excel · Generar PDF · **Cuentas bancarias** (botón del mismo estilo violeta) · Cerrar mes y generar pagos.

**Resumen del equipo** (tabla principal, la de siempre pero corregida):
- Se elimina la columna **Chats**.
- **Calif.** pasa a llamarse **Calificación (estrellas)**: 5 estrellas del 1 al 5 con el promedio al lado; si nadie calificó, muestra "Sin calificar".
- Al lado de cada profesor se ven sus datos bancarios (logo/imagen del banco, banco y N° de cuenta) tomados de la cuenta que él registró.
- Junto a **Tiempo clase** y **Sesiones 1:1** aparece un campo para el **valor por hora** de cada uno. Al escribirlo, el sistema calcula solo el monto exacto al minuto (tarifa ÷ 60 × minutos, con centavos) y actualiza el total del profesor al instante.
- Cada fila muestra: tiempo en clase + n° de clases, tiempo en sesiones 1:1 + n° de sesiones, bonos, descuentos, total, estado.
- Botones por fila: **Bono** (a la izquierda de Informe), **Informe** (PDF personal) y **Marcar pagado**.

**Clases y sesiones** (debajo del resumen): la lista completa del mes con fecha, hora inicio/fin, duración, profesor y con quién fue, con su precio editable; se sigue pudiendo poner un precio manual que manda sobre el cálculo por hora.

**Pagos realizados** (al final): historial de abonos con comprobante; cada uno se puede **descargar como recibo** en PDF, con las horas, clases y sesiones que justifican el monto.

## 3. Bonos

- Ya no es pestaña. Es un botón por profesor en el resumen: monto + **motivo** ("Bono por…") + mes.
- Los bonos del mes se listan bajo el nombre del profesor y suman a su total.
- Desde "Marcar pagado" se pueden ver y editar los bonos ya creados.

## 4. Cuentas bancarias

- Botón en la barra superior (mismo color que Cerrar mes) que abre la gestión de cuentas de la empresa, tal como está hoy, más **imagen/logo del banco**.
- Además, cada profesor registra su propia cuenta (banco, tipo ahorros/corriente, número, titular) desde su ficha de usuario; es la que aparece junto a su nombre en el resumen.

## 5. Marcar pagado (rediseño)

Modal más ancho, sin líneas divisorias, todo centrado, siguiendo tu plantilla:

- Cabecera: profesor, periodo y cuatro totales — **Total · Abonado · Descuentos · Saldo**.
- **Descuentos funcionales**: se agrega un descuento con monto + **motivo** obligatorio; se resta del total y aparece arriba en la tarjeta "Descuentos".
- **Bonos**: se seleccionan de los ya creados y se puede ajustar el monto aquí mismo.
- **Método de pago**: Transferencia, Depósito, Cheque, Otro (se quita Efectivo).
- Campos: fecha, monto, N° de comprobante (lo llena el lector automático), cuenta bancaria de origen (lista de cuentas ya creadas, sin crearlas desde aquí), observación.
- **Imagen del comprobante**: recuadro **cuadrado y más pequeño**, ocupa el ancho de dos casillas sin desperdiciar espacio; se sube o se pega con Ctrl+V.
- El sistema lee el comprobante y **avisa si el monto no coincide** con la suma de clases + sesiones 1:1 + bonos − descuentos del mes ("coincide" en verde / "difiere en $X" en ámbar).
- Cada campo lleva su indicación corta debajo para que no haya dudas.
- Lista de abonos registrados con opción de ver comprobante, descargar recibo y borrar.

## 6. Registro obligatorio de tiempos y multas

- Al terminar una clase del calendario o una sesión 1 a 1, el profesor debe registrar hora de inicio y fin. Si no lo hace, la clase queda marcada **pendiente de registro** con un aviso permanente en "Mis clases asignadas".
- El sistema propone una **duración estimada realista** a partir del Zoom (ej. 43 min, no bloques redondos de 2 h) para que el profesor solo confirme o corrija.
- **Periodo de gracia:** todo lo anterior al 18 de agosto de 2026 se puede registrar sin penalidad. Desde el 18 en adelante, si pasa el plazo, la clase queda **"En duda"** y el profesor debe **informar el motivo del retraso** antes de poder registrarla.
- Al profesor le llega su propio aviso: "No registraste las horas de N clases/sesiones" con la lista y el enlace para completarlas. Ese conteo aparece en el resumen del admin y en el informe del profesor, para que el admin decida si aplica descuento (con motivo) desde Marcar pagado.
- En el calendario de "Mis clases asignadas" se distinguen las ya registradas de las pendientes, y se pueden registrar las de días pasados.

## 7. Calificaciones mensuales obligatorias

- A fin de mes, a cada estudiante le sale un formulario obligatorio para calificar (1 a 5 estrellas) a los profesores con los que **realmente tuvo actividad** ese mes: sesiones 1 a 1 o clases a las que tuvo acceso, aunque el profesor no haya registrado la duración.
- Mientras no lo llene, se le recuerda al entrar. El promedio alimenta la columna de estrellas y los informes.

## 8. Informes

- **Informe personal por profesor** (PDF): clases (cantidad y tiempo), sesiones 1 a 1 (cantidad y tiempo), valor hora aplicado, detalle fecha por fecha, bonos con motivo, descuentos con motivo, registros tardíos, calificación en estrellas, abonos recibidos, saldo y total.
- **Excel y PDF generales** del mes: todo el equipo, en texto plano, sin fotos ni círculos de color.
- **Recibo** descargable por cada pago realizado.

## 9. Ficha de usuario obligatoria (una sola vez)

Al entrar por primera vez, el usuario ve un formulario que debe completar una única vez, con el diseño de tu plantilla: foto, nombres, apellidos, cédula, fecha de nacimiento, correo, WhatsApp, dirección, **banco a depositar, tipo de cuenta, número de cuenta**, rol/sucursal y observación. Una vez guardado no vuelve a salir; se edita desde el perfil.

## 10. Comunidad

- El admin puede editar la cabecera de Comunidad ("ADN Empresarial · Comparte tus avances…"): **imagen de portada**, título y texto.

## Detalles técnicos

Base de datos (una migración):
- `pagos_descuentos` (profesor_id, mes, anio, monto, motivo obligatorio).
- `bonos`: usar `motivo` como campo obligatorio en el alta desde el resumen.
- `pagos_tarifas_mes` (profesor_id, mes, anio, valor_hora_clase, valor_hora_sesion) para el cálculo automático al minuto.
- `profiles`: campos de ficha (cédula, fecha_nacimiento, whatsapp, dirección, banco, tipo_cuenta, numero_cuenta, titular, logo del banco, `ficha_completa boolean`).
- `pagos_cuentas_bancarias`: columna `logo_url`.
- `registros_tardios` (referencia, tipo, profesor, fecha límite, motivo del retraso) + función que marca "En duda" pasada la fecha de gracia (2026‑08‑18) y notifica al profesor.
- `app_config`: campos de portada de Comunidad (imagen, título, texto).
- Grants + RLS en cada tabla nueva (admin escribe; profesor lee lo suyo).

Frontend:
- `src/routes/_authenticated/admin.tsx` nuevo con pestañas que reutiliza `permisos`, `AccesoCursosPanel` y acceso a clases; `nav-items.ts` actualizado (Admin y Pagos solo para admin).
- `pagos.tsx` reescrito como página única; `PagosPrecios`, `PagosAbonos` se conservan como secciones; se eliminan `PagosBonos`/`PagosCuentas` como pestañas (Bonos pasa a modal por profesor, Cuentas a modal desde la barra).
- `RegistrarAbonoModal.tsx` rediseñado (descuentos, bonos, comprobante cuadrado, validación de monto, métodos de pago).
- `src/lib/pagos-export.ts`: recibo por abono y nuevas secciones en los informes.
- `mis-clases-asignadas.tsx`: pendientes, motivo de retraso y duración estimada desde Zoom.
- Modal obligatorio de ficha de usuario y cabecera editable de Comunidad.

## Fuera de alcance por ahora
- Migrar las imágenes a Cloudinary (queda para mañana, como acordamos).
