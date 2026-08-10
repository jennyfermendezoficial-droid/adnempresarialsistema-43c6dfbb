# Pagos e informes con pestañas, comprobantes y calendario de reemplazos

## 1. Pagos e informes con pestañas
Una sola pantalla con pestañas arriba para que no haya que dar vueltas:

- **Resumen** — lo de hoy: tarjetas del mes, tabla del equipo, cerrar mes, PDF y Excel.
- **Clases y sesiones (precios)** — lista de TODAS las clases en vivo y sesiones 1 a 1 del mes, de todos los profesores, con fecha, hora de inicio y fin, duración exacta, profesor y con quién fue. Al lado de cada fila un campo para escribir el precio; se guarda al instante y suma al total del profesor.
- **Pagos realizados** — historial de abonos con comprobante, banco, fecha y número. Se puede ver o descargar el comprobante.
- **Bonos** — el contenido actual de Bonos integrado aquí (otorgar, listar, borrar), filtrado por el mes seleccionado y sumando al total del profesor.
- **Cuentas bancarias** — crear y editar las cuentas de la empresa (banco, tipo, número, titular). Son las que aparecen al registrar un pago.

La página `/bonos` y `/mis-cuentas-bancarias` siguen existiendo, pero la jefa ya no las necesita: todo está dentro de Pagos e informes.

## 2. Marcar pagado → registrar abono (como la imagen)
Al pulsar "Marcar pagado" se abre un modal con:

- Cabecera con el profesor y el periodo, y cuatro totales: **Total**, **Abonado**, **Descuentos**, **Saldo**.
- Campos: fecha, monto, tipo de pago (transferencia, efectivo, cheque, otro), N° de comprobante, **cuenta bancaria de origen** (lista de las cuentas creadas), observación.
- Zona para **subir o pegar (Ctrl+V) la imagen del comprobante**.
- Al subir la imagen, el sistema **lee el comprobante automáticamente** y rellena monto, fecha, número de comprobante y banco; la jefa puede corregir cualquier dato antes de guardar.
- Lista de abonos ya registrados abajo, con opción de borrar.
- El profesor queda "Pagado" cuando lo abonado cubre el total; si es menos, queda "Abono parcial" con el saldo visible.

## 3. Los pagos entran en los informes
- PDF del mes y PDF por profesor: sección "Pagos realizados" con fecha, monto, tipo, banco y N° de comprobante, más total abonado y saldo.
- Excel: mismas columnas en texto plano, sin fotos ni círculos de color.

## 4. Calendario de reemplazos en Mis clases asignadas
- Nueva vista de **calendario mensual** del profesor: cada día muestra sus clases en vivo y sesiones 1 a 1 con hora y duración.
- Al tocar un día se abren sus clases y desde ahí se puede **reportar reemplazo** (a quién reemplazó, nota) o registrar duración.
- Los reemplazos del mes se listan aparte y salen en el informe PDF del profesor y en el detalle del admin.
- Se mantiene la lista actual como segunda vista (Lista / Calendario).

## Detalles técnicos
Base de datos (una migración):
- `pagos_cuentas_bancarias`: cuentas de la empresa (nombre, tipo, número, titular, activo). Lectura para admin/soporte, escritura solo admin.
- `pagos_comprobantes`: abonos (profesor_id, mes, anio, fecha_pago, monto, tipo_pago, numero_comprobante, cuenta_id, observacion, archivo_url, datos_ocr jsonb). Escritura solo admin.
- Bucket privado `comprobantes` con políticas de lectura/escritura para admin/soporte.

Frontend:
- `src/routes/_authenticated/pagos.tsx` se divide en componentes: `PagosResumen`, `PagosPrecios`, `PagosAbonos`, `PagosBonos`, `PagosCuentas` bajo `src/components/pagos/`, con una barra de pestañas.
- `src/components/pagos/RegistrarAbonoModal.tsx` con subida/pegado de imagen y llamada a un server function `src/lib/comprobante-ocr.functions.ts` que usa el modelo de visión de Lovable AI para extraer monto, fecha, número y banco.
- `src/lib/pagos-export.ts`: añadir la sección de abonos al PDF del mes, al PDF por profesor y al Excel.
- `src/routes/_authenticated/mis-clases-asignadas.tsx`: alternador Lista/Calendario y vista de calendario mensual reutilizando el modal de reemplazo existente.

## Fuera de alcance
- No se cambian las tarifas automáticas ni las reglas de reserva.
