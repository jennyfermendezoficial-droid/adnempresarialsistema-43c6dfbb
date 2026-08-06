# Menú plano, "Clases en vivo" separado de "Cursos" y duración por hora de inicio/fin

## 1. Menú sin desplegable de Academia

- Los ítems que hoy están dentro de "Academia" pasan a verse directamente en la barra (arriba y en el lateral), sin menú desplegable.
- Orden en la barra: Inicio · Tutoriales · Agenda 1 a 1 · **Cursos** · **Clases en vivo** (a la derecha de Cursos) · Calendario de clases · Mis clases asignadas · Miembros.
- Admin sigue igual como grupo, pero suma "Acceso a clases en vivo".

## 2. Dos bibliotecas separadas

Hoy hay una sola sección de contenido ("Cursos") con todo lo que ya está cargado.

- **Clases en vivo**: recibe todo el contenido que hoy está en Cursos (las grabaciones/módulos/lecciones existentes se mueven ahí tal cual, sin perder nada ni cambiar los accesos ya dados).
- **Cursos**: queda como una ventana idéntica en funcionamiento, pero vacía, para cargar los cursos "de verdad".
- Ambas se ven y se administran igual: crear, portada, editar, borrar, módulos, lecciones, video y recursos.

## 3. Accesos por separado (Admin)

- "Acceso a cursos" muestra solo los cursos reales.
- Nuevo "Acceso a clases en vivo" con la misma tabla de alumnas, pero listando las clases en vivo.
- Los permisos ya otorgados se mantienen (siguen apuntando al mismo contenido, ahora bajo Clases en vivo).

## 4. Registrar duración: hora de inicio y hora de fin

- Se elimina la opción de "minutos"; el modal pide **hora en que empezó** y **hora en que terminó**.
- Se muestra el resultado calculado: por ejemplo "09:00 – 10:10 · 1 h 10 min".
- Si la hora de fin es anterior a la de inicio, se avisa y no se guarda.
- Solo el profesor asignado a esa clase o sesión (o un admin) puede registrar/editar la duración. Ya es así en la base; se mantiene y el botón solo aparece para esa persona.

## 5. Cálculo del pago al minuto exacto

- Las horas se calculan al minuto: 1 h 10 min = 1,1667 h; 20 min = 0,3333 h; 35 min = 0,5833 h.
- Monto = tarifa × (minutos ÷ 60), redondeado solo al final a 2 decimales (centavos). Ejemplo con tarifa 12: 1 h 10 min → 14,00; 20 min → 4,00; 35 min → 7,00.
- Aplica igual a sesiones 1 a 1 (tarifa por sesión/hora 1 a 1) y clases en vivo (tarifa por hora de clase).
- Los registros ya existentes se recalculan con la nueva precisión.

## Detalles técnicos

**Base de datos (migración)**
- `cursos`: nueva columna `tipo text not null default 'curso'` con check `('curso','clase_en_vivo')`; las filas actuales se marcan `clase_en_vivo`.
- `registrar_duracion_clase` / `registrar_duracion_sesion`: aceptan `_hora_inicio` y `_hora_fin` (además de mantener minutos internamente), guardan `horas = duracion_min/60.0` con 4 decimales y `monto = round(tarifa * duracion_min / 60.0, 2)`.
- `horas_trabajadas.horas` pasa a `numeric(10,4)`; recálculo de filas existentes.

**Frontend**
- `src/lib/nav-items.ts`: disolver `academiaItems` en la lista plana; agregar `/clases-en-vivo` y `/acceso-clases-en-vivo`.
- `src/components/TopNav.tsx` y `AppSidebar.tsx`: quitar el grupo Academia (mantener el de Admin).
- `cursos.index.tsx` y `cursos.$cursoId.tsx`: filtrar/crear por `tipo`, con rutas nuevas `clases-en-vivo` reutilizando los mismos componentes.
- `acceso-cursos.tsx`: filtrar por `tipo`, y nueva ruta `acceso-clases-en-vivo`.
- `RegistrarDuracionModal.tsx`: dos campos de hora (inicio/fin), sin pestañas ni minutos.

## Fuera de alcance
- No se cambian tarifas, reglas de reserva ni otras secciones.
