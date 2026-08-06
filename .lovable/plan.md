# Arreglar modal de duración y meses inteligentes

## 1. El modal de duración se cae al tocar las horas

Al hacer clic en "Hora de inicio" u "Hora de fin" aparece "La página no cargó".
Causa probable: el clic del selector nativo de hora del navegador se cuenta como
clic "fuera" del modal, y con valores vacíos/parciales (ej. "12:") el cálculo de
minutos produce un resultado inválido que rompe la pantalla.

Cambios:
- Cerrar el modal solo al soltar el clic sobre el fondo oscuro (no con clics que
  vienen de los campos de hora ni del selector nativo), y agregar cierre con Esc.
- Blindar el cálculo: si la hora está incompleta o vacía, no calcular nada y solo
  mostrar el aviso "La hora de fin debe ser posterior a la de inicio" con el botón
  Guardar deshabilitado, sin romper la página.
- Envolver el modal en un límite de error para que, pase lo que pase, no se caiga
  la pantalla completa.

## 2. Meses inteligentes en Pagos e Informes

Hoy la lista muestra meses futuros (por ejemplo Septiembre a Diciembre estando en
Agosto). Pasa a mostrar:
- Del año en curso: solo desde Enero hasta el mes actual.
- Años anteriores con actividad: los 12 meses completos.
- Orden descendente (el mes actual primero).
- Al pasar a un nuevo mes o año, los meses nuevos aparecen automáticamente.

Aplica igual en Pagos y en Mis reportes (hoy Mis reportes arma su propia lista y
también incluye meses futuros; usará la misma función compartida).

## Detalles técnicos
- `src/components/RegistrarDuracionModal.tsx`: backdrop con `onMouseDown` +
  verificación de `event.target === currentTarget`, validación tolerante de
  "HH:MM", tecla Escape, y error boundary local.
- `src/lib/pagos-export.ts` → `listaMeses()`: recortar al mes actual en el año en
  curso.
- `src/routes/_authenticated/mis-reportes.tsx`: reemplazar la generación local de
  opciones por `listaMeses()`.

## Fuera de alcance
- No se cambian tarifas, cálculos de pago ni el resto de secciones.
