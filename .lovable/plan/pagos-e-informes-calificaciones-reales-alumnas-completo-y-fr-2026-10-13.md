# Pagos e informes: calificaciones reales, Alumnas completo y Freelance independiente

## 1. Calificaciones solo con actividad real
- Un estudiante solo puede calificar a un profesor si ese mes tuvo con él **una sesión 1 a 1 o una clase en vivo** (con acceso a ese curso).
- El formulario mensual muestra únicamente esos profesores; si no hubo actividad, no aparece.
- En el resumen, el profesor sin actividad con estudiantes sale como **"Sin calificar"**.
- Se limpian las calificaciones de este mes que no tengan actividad detrás (las que salieron "todos calificaron a todos").
- Solo califican las **alumnas seleccionadas** en la pestaña Alumnas.

## 2. Pagos e informes · Alumnas
**Valor del curso (se llena una vez, con botón Editar)**
- Valor total del curso, valor ya pagado, cuota mensual y saldo pendiente (se calcula solo).
- Se quita "Registrar bono" en esta pestaña.

**Datos bancarios obligatorios**
- La alumna seleccionada debe llenar con qué cuenta va a pagar (banco, tipo, número, titular, cédula). También puede llenarlos la ingeniera.
- Mientras falten, sale "Cuenta bancaria pendiente".

**Acompañantes**
- La propia alumna elige Acompañante 1 y Acompañante 2 desde su ficha (el admin puede corregir).

**Registrar abono (cada mes o atrasado)**
- Métodos: Transferencia bancaria, Depósito bancario, Cheque, Efectivo, Pago directo, Tarjeta de crédito, Tarjeta de débito.
- Al subir o pegar la imagen del comprobante se llenan solos: monto, fecha, N° comprobante, banco, cuenta de origen, titular, referencia/código. La observación se escribe a mano.
- Cada abono se puede ver, editar y borrar.

**Totales arriba:** Total por cobrar, Total abonado, Saldo pendiente, Mentoría del mes.

**Informe PDF individual por alumna:** valor del curso, cuotas, abonos con comprobante, saldo y acompañantes.

## 3. Freelance — ventana totalmente separada
Se quita todo lo copiado de Profesores.

- **Seleccionar freelancers** (como en Alumnas). Ej.: Jaime Zambrano.
- Al estar seleccionado, al freelancer le aparece **"Datos de pago"** para registrar su cuenta bancaria.
- **Actividades del mes:** el freelancer sube PDFs o imágenes (sin videos) con título, descripción y horas. Quedan guardados por mes, para siempre.
- **Valor acordado:** por hora o monto fijo mensual.
- **Bonos y descuentos** con motivo obligatorio.
- **Registrar pago** con lectura automática del comprobante (igual que Profesores).
- **Informe PDF mensual por freelancer:** actividades, horas, valor, bonos, descuentos, pagos y un **resumen corto de lo importante del mes**, sacado de sus PDFs.

## 4. Herramientas gratuitas (recomendación)
- **Guardar PDFs:** el almacenamiento de archivos que ya incluye la app sirve para PDFs e imágenes sin otra cuenta. Cloudinary gratis también acepta PDFs, pero tiene límite mensual. Ninguna opción gratis es ilimitada de verdad. Para pocos PDFs al mes, lo incluido en la app alcanza de sobra.
- **IA sin gastar créditos de Lovable:** usar **Google Gemini con tu propia clave gratuita** de Google AI Studio (sin tarjeta). Lee los PDFs y escribe el resumen mensual. Tiene un límite diario de uso, pero alcanza de sobra para los informes. Tendrías que crear la clave y pegarla cuando te la pida.
- La lectura de comprobantes puede usar esa misma clave gratuita, así tampoco gasta créditos.

## Detalles técnicos
- Migración: `calificaciones_mensuales` validada con un trigger (requiere sesión/clase en el mes y que sea alumna seleccionada) + borrado de las filas inválidas; `mentoria_cursos` (valor_total, pagado_inicial, cuota_mensual); columnas nuevas en `pagos_mentoria_abonos` (referencia, código); `freelance_miembros`, `freelance_datos_pago`, `freelance_tarifas`, `freelance_actividades` (archivo_url, mes, anio, horas), `freelance_bonos`, `freelance_descuentos`, `freelance_pagos`, `freelance_resumenes`. Grants + RLS (`puede_pagos` para admin, freelancer lee y escribe lo suyo).
- Bucket privado `freelance` (solo pdf/imagen, máx 20 MB).
- Server function `resumen-freelance.functions.ts` y OCR con el secreto `GEMINI_API_KEY` (API de Google directa).
- Frontend: reescribir `pagos/freelance.tsx`; ampliar `pagos_.alumnas.tsx`; ruta del freelancer para subir actividades y datos de pago; ajustar el formulario de calificación; PDF en `pagos-export.ts`.

## Fuera de alcance por ahora
- Otros temas, para después.
