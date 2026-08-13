# ADN Empresarial Connect

## ⚠️ INSTRUCCIONES GENERALES (léelas tú antes de empezar)

1. **Consume los menos créditos posibles.** No hagas refactors innecesarios. No rehagas trabajo ya hecho. Reutiliza componentes.

2. **Adjunta el HTML de referencia** (`adn-empresarial.html`) al primer mensaje en Lovable. Pídele que lo use como base visual y de estructura — colores, tipografía, sidebar, layout.

3. **Conecta GitHub desde el inicio** para tener historial.

4. **Trabaja con Supabase** para auth y base de datos (Lovable lo integra de un clic).

5. **Construye por fases** — Lovable trabaja mejor con prompts enfocados que con uno gigante.

---

## 🟦 FASE 1 — Fundación + Auth con Gmail

```

Crea una plataforma de mentoría online llamada "ADN EMPRESARIAL" basada en el HTML adjunto. Usa exactamente los mismos colores, tipografía (Bricolage Grotesque + Inter Tight) y estructura visual.

NOMBRE DE LA MARCA: "ADN EMPRESARIAL" en gradiente dorado (#F5D77A → #D4AF37 → #BFA168). El resto del UI mantiene el morado violet #7C6BFF como color principal.

STACK:

- Supabase para auth, base de datos y storage

- Tailwind CSS

- Bricolage Grotesque (títulos) + Inter Tight (cuerpo)

- React con TanStack Router

AUTH FLOW:

1. Login: email + contraseña + checkbox "Mantener sesión iniciada" + link "¿Olvidaste tu contraseña?"

2. Crear cuenta: nombre, email, contraseña, confirmar contraseña, checkbox de términos

3. Al crear cuenta → envía código de 6 dígitos por Gmail a su correo

4. Pantalla de verificación con 6 cuadros para ingresar código

5. Al verificar → cuenta creada con estado "Pendiente de aprobación"

6. Admin aprueba desde el panel de Permisos

CONEXIÓN GMAIL:

- Configura Supabase Auth con SMTP de Gmail (Google Workspace o cuenta Gmail con app password)

- El correo de verificación debe ser HERMOSO, branded ADN Empresarial:

  · Header con el logo dorado y fondo morado oscuro (#15102A)

  · Mensaje cálido de bienvenida firmado por Jennyfer Méndez

  · El código de 6 dígitos en un cuadro grande dorado, fuente grande, espaciado

  · Texto: "Tu código de verificación es válido por 15 minutos"

  · Footer con links a términos y privacidad

  · Que se vea profesional como los de Stripe, Linear o Notion

ROLES EN BASE DE DATOS (tabla 'usuarios'):

- admin (uno solo, el dueño)

- soporte (los profesores/especialistas)

- usuario (las alumnas)

TABLAS DE SUPABASE (crea todas):

usuarios: id (uuid), email, nombre_completo, password_hash, rol, avatar_url, estado (pendiente_aprobacion/activo/inactivo), created_at

cursos: id, nombre, descripcion, color_cover, orden

modulos_curso: id, curso_id, nombre, descripcion, orden

lecciones: id, modulo_id, nombre, descripcion, bunny_video_id, duracion_min, orden, recursos_adjuntos (jsonb)

permisos_cursos: id, usuario_id, curso_id, fecha_otorgado, otorgado_por

progreso_lecciones: usuario_id, leccion_id, completada (bool), fecha_completada, minutos_visto

disponibilidad: id, profesor_id, dia_semana (0=Lun, 4=Vie), hora_inicio (time), hora_fin (time), activo (bool)

sesiones_1a1: id, alumna_id, profesor_id, fecha, hora_inicio, hora_fin, zoom_link, zoom_meeting_id, estado (confirmada/realizada/cancelada), created_at

clases_en_vivo: id, fecha, hora_inicio, hora_fin, titulo, descripcion, profesor_id, zoom_link, zoom_meeting_id, recordatorio_enviado, created_by

chats_1a1: id, usuario_a_id, usuario_b_id (siempre alumna + profesor, nunca prof + prof), created_at, last_message_at

mensajes_chat_1a1: id, chat_id, autor_id, contenido, tipo (texto/imagen/audio/video), media_url, leido (bool), eliminado (bool), created_at

canal_general_mensajes: id, autor_id, contenido, tipo, media_url, eliminado, created_at

ia_bot_interacciones: id, usuario_id, chat_id, pregunta, respuesta, sugirio_agendar (bool), created_at

bonos: id, profesor_id, tipo, monto, motivo, frecuencia (una_vez/mensual), mes, anio, otorgado_por, estado (por_pagar/pagado)

horas_trabajadas: id, profesor_id, fecha, tipo (clase/sesion_1a1), horas, tarifa, monto, referencia_id

pagos_mensuales: id, profesor_id, mes, anio, total_horas, total_bonos, monto_total, estado, fecha_pago

calificaciones_mensuales: id, profesor_id, mes, anio, claridad, didactica, desenvolvimiento, practico, alumna_id

POLÍTICAS RLS:

- Admin ve y modifica todo

- Soporte (profesor) solo ve sus chats con alumnas, sus sesiones, sus tareas

- Usuario (alumna) solo ve sus cursos asignados, sus chats, sus sesiones

USUARIO INICIAL (data de prueba MÍNIMA, solo un admin):

- Crea UN solo usuario: Jaime Zambrano (admin) — email a definir

- No crees alumnas de ejemplo, no crees datos falsos. La plataforma debe verse "nuevecita" cuando se abra.

LO QUE DEBE CONSTRUIR EN ESTA FASE:

1. Auth flow completo (signup, verificación, login, reset password)

2. Email branded para código de verificación

3. Layout principal con sidebar morado oscuro (idéntico al HTML)

4. Página de Inicio vacía (con video placeholder y empty states)

5. Logout funcional

NO construyas todavía: cursos, agenda, chats, pagos. Eso viene en las siguientes fases.

```

---

## 🟦 FASE 2 — Permisos y aprobación de cuentas

```

Construye el módulo de Permisos (admin-only).

PANEL DE PERMISOS:

- Tabla con todos los usuarios: nombre, email, rol actual, estado, fecha de registro

- Filtros: por estado (pendiente/activo), por rol

- Por cada usuario, el admin puede:

  · Cambiar rol entre "usuario" y "soporte" (NUNCA puede crear otro admin)

  · Aprobar cuentas pendientes

  · Desactivar cuentas

  · Asignar cursos específicos (modal con checkboxes de los 5 cursos disponibles)

REGLAS:

- Solo el admin (Jaime Zambrano) puede entrar a Permisos

- El admin NO puede degradarse a sí mismo

- Solo puede haber UN admin en el sistema

- Cuando aprueba una cuenta pendiente, dispara un email a la alumna avisándole

ASIGNACIÓN DE CURSOS:

- Modal: "Asignar cursos a [nombre]"

- Lista de 5 cursos con checkbox: Sistema M.A.P.A., Cerebros y Embudos, 100K Meta Ads, WhatsApp Ventas, Marca Personal

- Al guardar, crea registros en la tabla permisos_cursos

- El usuario verá los cursos asignados en su sección de Cursos

EMAIL DE APROBACIÓN (también branded):

- Asunto: "¡Bienvenida a ADN Empresarial!"

- Cuerpo: mensaje cálido de Jennyfer, link directo a entrar, lista de cursos asignados

```

---

## 🟦 FASE 3 — Cursos con Bunny.net

```

Construye el módulo de Cursos / Classroom con integración de Bunny.net Stream.

LOS 5 CURSOS BASE (créalos vacíos):

1. Sistema M.A.P.A. — Metodología de Adquisición y Posicionamiento Acelerado

2. Cerebros y Embudos — Diseña el camino mental del cliente

3. 100K Meta Ads — Escalar campañas a 6 cifras

4. WhatsApp Ventas — Cierre por mensaje

5. Marca Personal — Posiciónate como autoridad

ESTRUCTURA:

- Curso → Módulos → Lecciones

- Cada lección tiene: nombre, descripción, video de Bunny, duración, recursos adjuntos (PDF, imágenes)

VISTA ALUMNA:

- Grid de cursos asignados (los del HTML adjunto)

- Click en curso → ve los módulos como acordeón

- Click en lección → reproductor de Bunny embebido + descripción + recursos

- Al terminar el video se marca como completada

- Barra de progreso por curso (% lecciones completadas)

VISTA ADMIN + SOPORTE:

- Pueden CREAR y EDITAR cursos

- Pueden CREAR módulos y lecciones

- Pueden SUBIR videos a Bunny directamente desde la plataforma

- Pueden agregar recursos adjuntos (PDF, imágenes, links)

- Botón "Reordenar" para arrastrar módulos y lecciones

INTEGRACIÓN BUNNY.NET:

- Conecta con la API de Bunny Stream usando API Key

- Cuando un admin/soporte sube un video, se sube directamente al library de Bunny

- Guarda el bunny_video_id en la tabla lecciones

- El reproductor debe usar el embed de Bunny con player personalizado:

  · Color principal: #7C6BFF (violet)

  · Color secundario: #D4AF37 (dorado)

  · Watermark sutil con el logo de ADN Empresarial

  · Bloqueo de descarga

  · Sin recomendaciones de videos externos

PASO A PASO PARA CONFIGURAR BUNNY (instruye al admin):

1. Crear cuenta en bunny.net

2. Crear un "Stream Library"

3. Copiar API Key y Library ID

4. Pegarlas en Configuración → Integraciones de la plataforma

5. Personalizar el player desde el dashboard de Bunny con los colores indicados

```

---

## 🟦 FASE 4 — Calendario de clases en vivo con Zoom

```

Construye el módulo de Calendario de clases en vivo.

VISTA (todos los roles):

- Calendario mensual con los eventos del programa

- Click en evento → modal con detalle: título, profesor, hora, link de Zoom

- Botón grande "Unirme al Zoom" si la clase es ahora o en menos de 15 min

EDICIÓN (solo admin + soporte):

- Botón "+ Nueva clase en vivo"

- Modal:

  · Fecha y hora

  · Duración

  · Título y descripción

  · Profesor responsable (dropdown con los 5 especialistas)

  · Generar link de Zoom automáticamente (vía API) O pegar link manualmente

  · Botón "Crear clase y generar Zoom"

INTEGRACIÓN ZOOM:

- API de Zoom OAuth (Server-to-Server o User OAuth)

- Al crear una clase, automáticamente crea un meeting de Zoom

- Guarda el zoom_meeting_id y zoom_link

- Los profesores tienen "Sign in with Zoom" en su perfil para conectar su cuenta

- Si la clase es editada o cancelada, el meeting de Zoom se actualiza/elimina también

NOTIFICACIONES:

- 24h antes de la clase, envía email a todos los usuarios con cursos relacionados

- 30 min antes, envía notificación en la plataforma (campanita) y un sonido suave de aviso

PASO A PASO PARA CONFIGURAR ZOOM (instruye al admin):

1. Crear app en Zoom Marketplace (Server-to-Server OAuth)

2. Activar scopes: meeting:write:admin, meeting:read:admin, user:read:admin

3. Copiar Account ID, Client ID, Client Secret

4. Pegarlas en Configuración → Integraciones

5. (Para cada profesor) Conectar su Zoom personal desde su perfil

```

---

## 🟦 FASE 5 — Agenda 1 a 1 con Zoom

```

Construye el módulo de Agenda 1 a 1 con los 5 especialistas:

ESPECIALISTAS:

1. Jennyfer Méndez — Mentora principal · Marketing y WhatsApp Ventas

2. Henry Rojas — Meta Ads · Tráfico Pagado

3. Karen Ayauca — WhatsApp · Seguimiento

4. Eric Troya — Inteligencia Artificial · Avatares y video con IA

5. Jaime Zambrano — Programación · Landing Pages (es el admin, pero también atiende sesiones)

VISTA ALUMNA:

- Cards de los 5 especialistas (sin estrellas, sin calificaciones, sin precios)

- Cada card: avatar, nombre, especialidad

- Click en card → muestra grid semanal Lunes a Viernes

- Slots de 1 hora en cada celda (09:00 a 21:00)

- Estados: Libre / Reservado por mí / Tomado por otro / Pasó

- Click en slot libre → confirma con botón "Confirmar sesión con [profesor]"

VISTA PROFESOR:

- "Mi disponibilidad": grid Lun-Vie con toggles para activar/desactivar bloques

- Solo puede agendar el profesor sesiones en bloques activos

- "Mis sesiones": lista de las próximas con botón "Abrir Zoom" cada una

VISTA ADMIN:

- Ve TODAS las sesiones del equipo

- Puede cancelar cualquier sesión

- Puede reagendar

AVISO DE GRABACIÓN (importante, va en la card de cada sesión confirmada):

"¿Quieres grabar esta sesión? Para grabar tu reunión 1:1, primero pídele permiso al especialista al inicio de la sesión. Esta es una decisión privada entre ustedes y nos ayuda a respetar el espacio confidencial de la mentoría."

INTEGRACIÓN ZOOM (lo mismo que clases en vivo):

- Al confirmar reserva, crea automáticamente meeting de Zoom

- Envía email a alumna + profesor con el link

- 30 min antes, recordatorio en plataforma + sonido

LUNES A VIERNES SOLAMENTE — sábado y domingo no aparecen.

```

---

## 🟦 FASE 6 — Chats (reemplaza Tickets de soporte)

```

Construye el módulo de Chats. ESTO REEMPLAZA "Tickets de soporte" — no hay tickets, todo es chat continuo.

ESTRUCTURA DE CHATS:

- Cada ALUMNA tiene un chat permanente con CADA profesor (incluyendo el admin)

- Cada PROFESOR ve sus chats con TODAS las alumnas (NO ve chats con otros profesores)

- El ADMIN ve sus chats con TODAS las alumnas (también es profesor en este contexto)

VISTA "Chats" (sidebar):

- Lista de conversaciones

- Para ALUMNAS, el orden es:

  1. Asistente IA (bot, dorado, siempre arriba)

  2. Jennyfer Méndez

  3. Henry Rojas

  4. Karen Ayauca

  5. Eric Troya

  6. Jaime Zambrano (admin)

- Para PROFESORES: lista de todas las alumnas que tienen acceso al programa

DENTRO DE UN CHAT:

- Burbujas estilo WhatsApp: las mías a la derecha (violet), las del otro a la izquierda (blanco)

- Avatar pequeño y nombre del autor en cada mensaje

- Soporta:

  · Texto

  · Imágenes (drag and drop o botón 📎)

  · Audios (botón 🎤 graba in-line)

  · Videos livianos (límite 25 MB)

- "Está escribiendo..." cuando el otro escribe

- Tick de leído (✓✓)

- Click derecho en mensaje propio → opción "Eliminar". Cuando se elimina, el mensaje DESAPARECE COMPLETAMENTE — NO debe aparecer "Este mensaje fue eliminado", simplemente ya no está.

- NO se puede eliminar mensajes ajenos

- Búsqueda dentro del chat (icono lupa)

ASISTENTE IA (BOT) — TOP DE LA LISTA:

- Card destacada con icono dorado ✦ y badge "BOT"

- Es un chat con un agente de IA (OpenAI / Claude / similar)

- Prompt del bot: "Eres un asistente de la mentoría ADN Empresarial. Ayudas a las alumnas con dudas sobre los cursos: Sistema M.A.P.A., Cerebros y Embudos, 100K Meta Ads, WhatsApp Ventas, Marca Personal. Cuando la duda sea muy específica o compleja (problemas técnicos serios, casos personales, situaciones que requieren juicio humano), SIEMPRE responde: 'Esta es una duda que necesita la atención personalizada de uno de nuestros especialistas. Te recomiendo agendar una sesión 1:1 con [profesor relevante]. Puedes hacerlo desde el menú Agenda 1 a 1.' Cuando la duda sea básica (cómo navegar la plataforma, qué hay en cada curso, horarios de clases), responde directamente."

- Cuando el bot detecta complejidad, agrega un botón "Agendar sesión 1:1" debajo de la respuesta

NOTIFICACIONES Y SONIDOS:

- Mensaje nuevo en chat 1:1 → sonido SUTIL tipo "ping" (un solo tono corto y agradable)

- Mensaje nuevo en canal general → sonido DIFERENTE, más bajo y discreto (tipo "blip")

- Los sonidos solo suenan si la persona NO tiene el chat abierto

- Notificación visual: badge rojo en el sidebar al lado de "Chats"

- Configuración para silenciar notificaciones (en perfil)

CANAL GENERAL:

- Único canal público para toda la comunidad

- Todos pueden enviar: texto, imágenes, audios, videos livianos (25 MB max)

- Sonido distinto al de chats 1:1

- Admin y soporte pueden anclar mensajes importantes arriba

```

---

## 🟦 FASE 7 — Pagos e Informes (admin)

```

Construye el módulo de Pagos e Informes (admin-only).

KPIs ARRIBA:

- Total a pagar este mes (suma de horas + bonos pendientes)

- Horas totales del equipo

- Sesiones 1:1 realizadas

- Calificación promedio del equipo (cuando exista la calificación mensual)

TABLA "Resumen del equipo":

- Una fila por profesor con: horas de clase × tarifa, sesiones 1:1 × tarifa, tareas culminadas, bonos del mes, calificación, A pagar (total), estado (Por pagar / Pagado), botón "Marcar pagado"

- Fila TOTAL al final

INFORME DETALLADO POR PROFESOR (cards al hacer click en un profesor):

- Card 1: Resumen económico (horas × tarifa, bonos, total)

- Card 2: Actividad del mes (clases impartidas, sesiones 1:1, tareas, tickets respondidos)

- Card 3: Calificaciones (cuando exista) en 4 barras: claridad, didáctica, desenvolvimiento, práctico

- Card 4: Bitácora — cada movimiento con fecha y monto generado

CONFIGURACIÓN DE TARIFAS:

- En cada profesor (desde Permisos): admin define tarifa_hora_clase y tarifa_sesion_1a1

- Por defecto $0 hasta que el admin las configure

CIERRE DE MES:

- Botón "Cerrar mes y generar pagos" (con confirmación)

- Al cerrar, bloquea ediciones de ese mes

- Genera registro en pagos_mensuales por cada profesor

- Marcar como pagado registra fecha_pago

EXPORTAR:

- Botón "Exportar Excel" → descarga .xlsx con todo el mes

- Botón "Generar PDF" → reporte profesional con logo

HISTORIAL:

- Tabla de meses cerrados con total pagado por mes

```

---

## 🟦 FASE 8 — Bonos (admin)

```

Construye el módulo de Bonos (admin-only). Es una ventana separada donde el admin asigna bonos a los profesores que se suman automáticamente a su pago del mes.

VISTA PRINCIPAL:

- KPIs: Bonos asignados este mes, Bono más alto, Profesores premiados, Tipo más usado

- Cards por profesor (uno por cada uno de los 5):

  · Lista de bonos del mes (con tag, monto, botón eliminar)

  · Total acumulado destacado en verde

  · Botón "+ Agregar bono" que abre el modal

MODAL "ASIGNAR BONO":

- Selector de profesor

- 6 tipos predefinidos: ⭐ Meta mensual, 🏆 Mejor calificación, 📈 Campaña exitosa, ⛑ Tickets resueltos, 🎯 Objetivo extra, ✨ Otro

- Monto en USD

- Motivo (texto, visible para el profesor)

- Frecuencia: Una sola vez / Recurrente mensual

- Botón "Asignar bono"

HISTORIAL:

- Tabla con todos los bonos asignados (fecha, profesor, tipo, motivo, monto, estado)

- Filtro por mes

CONEXIÓN CON PAGOS:

- Los bonos se suman automáticamente al monto a pagar en "Pagos e informes"

- El profesor también ve sus bonos en su vista de pagos

```

---

## 🟦 FASE 9 — Calificación mensual de profesores

```

Construye el sistema de calificación mensual de profesores.

NO ES UNA CALIFICACIÓN POR CADA SESIÓN — es una sola vez al mes.

DISPARO:

- El primer día de cada mes, a las 9am, envía a cada alumna ACTIVA un email con link único a un formulario de calificación

- Solo califican profesores con los que tuvieron al menos UNA sesión 1:1 ese mes

FORMULARIO (página pública con token único):

- Header: avatar del profesor + nombre + "Calificación de [mes] [año]"

- 4 preguntas escala 1-5 con botones circulares grandes:

  · "¿Cómo explica el profesor?" — Claridad al transmitir conceptos

  · "Didáctica" — Métodos y dinámicas

  · "Desenvolvimiento" — Seguridad y manejo

  · "¿Práctico o teórico?" — Qué tanto aplicaste

- Etiquetas debajo de cada escala (Nada claro/Excelente, etc.)

- Textarea opcional para comentario libre

- Botón "Enviar calificación"

LO QUE NO QUEREMOS:

- NO calificaciones después de cada sesión

- NO estrellas visibles en la lista de profesores

- NO contadores de "★ 4.9"

LO QUE SÍ:

- El admin ve las calificaciones agregadas mensualmente en "Pagos e informes"

- El profesor ve sus calificaciones promedio del mes y comentarios

```

---

## 🟦 FASE 10 — Configuración final + Optimizaciones

```

Antes de lanzar:

CONFIGURACIÓN GENERAL (panel admin):

- Logo y nombre de la plataforma

- API Keys de Bunny, Zoom, OpenAI (para el bot IA), SMTP Gmail

- Tarifas por defecto de profesores

- Plantillas de emails (bienvenida, código, aprobación, recordatorios)

PERFIL DE USUARIO:

- Cambiar foto

- Cambiar contraseña

- Conectar Google Calendar y Zoom (para profesores)

- Configurar sonidos de notificación

- Idioma (por ahora solo español)

ASISTENTE IA FLOTANTE:

- El botón ✦ arriba a la derecha abre un chat con el bot IA (el mismo de Chats)

RESPONSIVE:

- Mobile-first verificado en cada pantalla

- Sidebar se convierte en menú hamburguesa

- Modales se expanden a pantalla completa en mobile

PERFORMANCE:

- Lazy load de videos de Bunny

- Paginación en mensajes de chat (50 a la vez)

- Imágenes optimizadas

DESPLIEGUE:

- Domain personalizado (te lo configuro yo después)

- SSL automático de Lovable

```

---

## 📌 Resumen de lo que necesita Lovable PARA CADA FASE

| Fase | Requiere | Tiempo estimado |

|------|----------|----|

| 1 | Supabase + Gmail SMTP | 1 prompt grande |

| 2 | — | 1 prompt mediano |

| 3 | API Bunny.net | 1 prompt + setup Bunny |

| 4 | API Zoom | 1 prompt + setup Zoom |

| 5 | API Zoom (mismo de fase 4) | 1 prompt |

| 6 | API OpenAI (para bot) | 1 prompt + setup OpenAI |

| 7 | — | 1 prompt |

| 8 | — | 1 prompt mediano |

| 9 | Cron job (pg_cron en Supabase) | 1 prompt |

| 10 | — | Iterativo |

---

## 🎯 PRIORIDAD para arrancar rápido

**Indispensable para empezar a operar:**

- Fases 1, 2, 3 (auth + permisos + cursos básicos)

**Importante para la primera semana:**

- Fase 4 (calendario de clases)

- Fase 6 (chats con el bot)

**Para el segundo mes:**

- Fases 5, 7, 8 (agenda 1:1, pagos, bonos)

**Cuando ya tengas alumnas activas:**

- Fase 9 (calificación mensual)

- Fase 10 (configuración final)

---

## 💰 TRUCO PARA AHORRAR CRÉDITOS EN LOVABLE

1. **Adjunta el HTML de referencia siempre** — Lovable usa los mismos componentes en lugar de re-imaginar todo

2. **Sé específico en cada prompt** — frases tipo "como en el HTML adjunto" o "usa la clase .card-soft" evita refactors

3. **Trabaja por fases pequeñas** — si pides todo de golpe, Lovable se confunde y consume el doble

4. **Cuando algo funcione, no lo toques** — pídele a Lovable que NO refactorice trabajo previo

5. **Conecta GitHub** — puedes volver atrás si algo sale mal sin gastar créditos

6. **Pre-comprueba en Supabase** — antes de pedirle a Lovable construir features, revisa que las tablas estén bien armadas es erick la primera cuenta que se cree va a ser la mia Jaime Zambrano por el momento no hay cuentas no hay miembros no hay nada 

Mira, amigo, lo va a haber. Tiene que estar todo. Tú sabes que ya hicimos en otro, aunque sea otra cuenta esta. Tenemos que hacer esto para que sean varias cuentas conectadas, enviar para crear la cuenta con Gmail, enviar un código, que estén bien todos los recuadritos, todo bien, todo clean. Que se vea todo bien como está así, eh, que funcione todo, que funcione todo. Eso también es importante que esté funcionando todo. Que funcionen los chats, que funcione lo del-- como ser, en la parte de chat no le expliqué bien al Claudio que me pase el prompt. Verás, los profesores, los que tienen rol de profesores o, o, ah, o, o soporte, eh, profesor o soporte y admins, debe salirles las-- un, un admin que es y los profesores que son, todos son profesores, todos son profesores, el admin y los, y los de soporte. De los usuarios debe tener un chat, como ser un usuario tiene que tener un chat con todos los profesores, abierto un chat con todos, todos, todos los profesores. Como ser, hay un chat abierto con el profesor J-Jaime, con el Erick, con el-- con la Karen, con Henricito, con ingeniera Jennifer. Y verás que ya está corregido el nombre de cómo es Jennifer Hernández, que es con Y. Y verás que no hay cuentas, ponte pilas, tú eres superpilas, sabes cómo se hace el trabajo, eres superprofesional, conectado todo, todo superpro, que funcione bien, que esté bien configurado, porque necesitamos tenerlo para hoy día listo, con-- tenerlo con la menor cantidad de créditos, porque no, no, no tenemos tantos créditos. No quiero que consumas, porque el otro día con otra página que creé, me consumiste como veinte créditos en una sola cosa pequeña. Entonces consúmelo, pues, mmm, lo menos posible, pero bien hecho. Bien hecho, superbién hecho, bien configurado. Tú eres un pro, sabes cómo tienes que hacer tu trabajo, así que ponte pilas con eso

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://adnempresarialsistema.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6980a227-5530-486f-bd67-bf641e83d284).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
