# Bitácora maestra de EvaluEdu

Este documento conserva las decisiones funcionales del proyecto y debe mantenerse junto con `README.md` y `AGENTS.md`.

## Estado actual

Existe un MVP visual construido con React/Vite/TypeScript, responsive para Android y computadora. Supabase ya es la fuente principal para contenido, salas e intentos; `localStorage` y `sessionStorage` se mantienen como respaldo temporal con cola de sincronización. Realtime está activo para estados de sala y el acceso estudiantil temporal usa una Edge Function protegida.

La etapa de plantilla ya comenzó: existe un `EvaluationTemplate` persistido localmente, un constructor guiado para datos esenciales y una vista que calcula compatibilidad inicial por tipo de actividad. El PDF imprimible, el guardado automático y los seis editores específicos ya están implementados en modo demo local.

El proyecto está separado de `APP DE JUEGO` y de Ecoliderazgo. No modificar esos proyectos.

## Decisiones cerradas

### Identidad y roles

- Nombre provisional: **EvaluEdu**.
- La pantalla principal debe permitir elegir mediante iconos: Administrador, Docente y Estudiante.
- El docente será un usuario autorizado.
- El estudiante ingresará con código de sala, nombre y datos mínimos.
- Cada estudiante tendrá un solo intento por sala.

### Plantilla de contenido

La plantilla contiene contenido pedagógico estructurado y no selecciona actividades. Debe admitir bloques repetibles para datos de materia, título, objetivo, competencia, conceptos, definiciones, autores, teorías, ejemplos, situaciones, casos, relaciones, categorías, elementos, procesos, decisiones, consecuencias, errores frecuentes, criterios de aprendizaje, retroalimentación y dificultad.

La creación será mediante formulario guiado dentro de la app, con campos obligatorios, ayuda, validación, progreso, guardado automático, vista previa, aceptación final y descarga de PDF de respaldo. No se usará la carga de archivos como método principal.

### Registro de implementación · 2026-10-20

- Se añadió el modelo `EvaluationTemplate` y su persistencia local.
- Se añadió el constructor guiado con título, asignatura, descripción, objetivo, competencia y dificultad.
- Se añadieron bloques repetibles para conceptos y situaciones, además de procesos y categorías por línea.
- Se añadió compatibilidad inicial para escenario, falso/verdadero, asociación, clasificación, ordenamiento y selección múltiple.
- Las opciones no compatibles se muestran atenuadas con la información faltante.
- Guardar borrador y aceptar contenido están separados. Aceptar contenido crea directamente las actividades compatibles; no exige aprobarlas una por una.
- `Nueva actividad` ahora solicita una plantilla aceptada antes de crear una actividad.
- El selector de tipo solo muestra formatos compatibles con la plantilla elegida y el editor recibe el tema, objetivo y elementos derivados del contenido.
- Se añadió el configurador de sala/evaluación con límite de estudiantes, cantidad de preguntas, puntaje por pregunta, instrucciones, tiempo total, mezcla, navegación y selección de actividades.
- Las preguntas pueden repetirse desde el banco seleccionado hasta completar la cantidad configurada, respetando un máximo de tres tipos diferentes.
- Se reemplazó el formulario genérico de actividad por seis editores específicos: escenario por etapas, falso/verdadero, asociación por pares, clasificación por categorías, ordenamiento por pasos y selección única con una respuesta correcta.
- Cada editor guarda `details` estructurados, conserva los campos compatibles con la vista estudiante y valida sus requisitos mínimos antes de publicar.
- El constructor de plantilla ahora muestra progreso por criterios, guarda automáticamente el borrador en `localStorage`, recupera la edición al volver a abrir y ofrece una vista previa imprimible para guardar como PDF.
- Las salas ahora tienen ciclo local controlado: `ready` (lista para iniciar) → `waiting` (abierta y esperando) → `active` (en curso) → `finished` (finalizada) → `archived` (archivada). Las salas finalizadas o archivadas se pueden duplicar con código nuevo.
- El docente puede abrir, iniciar, finalizar, archivar, duplicar y copiar el código de una sala. El estudiante solo entra a las actividades cuando la sala está `active`; antes queda en una pantalla de espera con actualización manual.
- Se implementó el flujo estudiantil local: validación de código y nombre, espera hasta que la sala esté activa, selección de actividades respetando mezcla, navegación anterior/siguiente, omisión, feedback inmediato, tiempo límite general y pantalla de finalización.
- Al terminar se registra un intento local por sala y nombre; el estudiante no ve el resultado final. La reconexión persistente, la sincronización entre dispositivos y la aplicación segura de un solo intento todavía requieren Supabase Auth, Realtime, base de datos y RLS.
- Se desarrolló el punto 6 en modo demo local: el panel docente filtra intentos por sala, muestra participación, aciertos, puntaje, omisiones y estado, permite abrir el detalle por actividad y registra respuestas, tiempos y eventos de navegación. La exportación CSV genera una fila por actividad con campos compatibles con Excel.
- Se desarrollaron las bases previas al backend: el rol administrador ahora tiene navegación y vistas propias para resumen global, usuarios/permisos y auditoría local, diferenciadas del panel docente.
- Se creó un motor de ejecución estructurada para las seis actividades. Usa `details`, normaliza actividades antiguas, registra respuestas tipadas, permite respuestas incorrectas para que puedan recibir feedback y calcula la corrección según escenario, verdadero/falso, asociación, clasificación, ordenamiento o selección única.
- TypeScript y build Vite de producción verificados correctamente.

### Registro de implementación · 2026-10-21 · Bases 3 y 4

- Se extrajo el motor de respuestas a `src/lib/activityEngine.ts` para mantener una única fuente de verdad para la estructura, completitud, comparación, serialización y puntuación.
- Se añadió `evaluateActivityResponse`, que devuelve un resultado uniforme para respuestas omitidas, respondidas correctas y respondidas incorrectas; `finishStudentAttempt` ahora usa este evaluador.
- Se añadió `src/lib/activityEngine.test.ts` con cobertura para los seis tipos, compatibilidad con actividades antiguas sin `details`, categorías configurables, ordenamiento y puntuación.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build Vite de producción exitoso.

### Registro de implementación · 2026-10-21 · Inicio del punto 7

- Se creó `src/lib/supabase.ts` con cliente browser opcional, sesión persistente, renovación automática y detección de retorno de OAuth; en ausencia de variables el modo demo local se mantiene intacto.
- Se añadió pantalla de autenticación para docente y administrador con ingreso por correo/contraseña y registro inicial. El estudiante conserva el acceso público por código de sala.
- Se actualizó `.env.example` para preferir `VITE_SUPABASE_PUBLISHABLE_KEY` y mantener compatibilidad con `VITE_SUPABASE_ANON_KEY`.
- La autorización por rol todavía no se considera real: falta crear perfiles en base de datos, políticas RLS, validar permisos en servidor, migrar datos y activar Realtime.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas, build Vite exitoso y pantalla demo cargando visualmente.

### Registro de infraestructura · 2026-10-21

- Se creó el proyecto Supabase `EvaluEdu` en la organización de trabajo, región `sa-east-1`, con estado `ACTIVE_HEALTHY` y costo estimado de `$0` mensuales.
- Se configuró localmente `.env.local` con la URL y la clave pública `publishable`; el archivo está excluido de Git y no contiene `service_role`.
- Verificación remota completada: el proyecto responde y todavía no tiene tablas públicas, por lo que está listo para recibir el esquema inicial.
- Se aplicaron las migraciones remotas `initial_core_schema` e `index_foreign_keys`. El esquema inicial contiene perfiles, plantillas, actividades, salas, actividades por sala, participantes, intentos, respuestas y eventos de auditoría.
- Las nueve tablas tienen RLS habilitado y políticas iniciales de propietario para usuarios autenticados. El análisis de seguridad no reportó hallazgos; el aviso de índices no usados es informativo porque la base aún está vacía.
- Se añadió la migración `secure_profile_onboarding`: las cuentas autenticadas solo pueden crear su propio perfil como `teacher`; no pueden autoasignarse `admin` ni modificar su rol desde el cliente.
- La aplicación ahora consulta `profiles` después de iniciar sesión, muestra una pantalla de primer ingreso para completar el perfil docente y bloquea el panel administrativo si la cuenta no tiene un perfil `admin` válido.
- Verificación completada: TypeScript sin errores, 7 pruebas aprobadas, build de producción exitoso, nueve tablas con RLS y análisis de seguridad sin hallazgos.

### Corrección de acceso · 2026-10-21

- Se detectó que cualquier persona podía elegir el icono Docente y llegar al registro de cuenta.
- Se eliminó el registro público de la interfaz: docente y administrador ahora solo muestran ingreso para cuentas creadas o invitadas.
- La política de Supabase ya restringe la creación de perfiles al rol `teacher`; la asignación de `admin` queda fuera del cliente.
- Pendiente operativo: desactivar también `Allow new users to sign up` en Authentication > Providers del proyecto Supabase para cerrar el endpoint público de registro. El flujo de invitaciones administrativas se desarrollará después.

### Flujo administrativo y verificación de cuenta · 2026-10-21

- Se añadió `Agregar usuario` al panel administrativo con nombre visible y correo del docente.
- La interfaz invoca `admin-invite-teacher`; no crea administradores desde el cliente ni muestra contraseñas generadas.
- Se creó y desplegó `supabase/functions/admin-invite-teacher/index.ts` con JWT obligatorio (`verify_jwt = true`), validación de sesión y comprobación del rol `admin` mediante `profiles`.
- La función usa `auth.admin.inviteUserByEmail` únicamente en servidor y crea el perfil persistente con rol `teacher`.
- Si el perfil no puede insertarse, la función informa que la invitación fue enviada y devuelve el identificador para resolver el caso sin ocultar un estado inconsistente.
- Verificación completada: Edge Function activa en el proyecto Supabase, TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.
- El proyecto todavía no tiene perfiles registrados (`profiles = 0`); antes de usar el panel administrativo se debe asociar el correo exacto de la primera cuenta Auth al rol `admin` mediante una operación controlada de servidor.
- Se verificó `elmeryaletorrez@gmail.com`: todavía no existe como usuario en `auth.users`, por lo que la cuenta no puede asociarse hasta crearla o invitarla desde Authentication > Users.
- Se aclaró la pantalla de acceso: el aviso de solicitud de acceso no es un enlace ni envía correos automáticamente.

### Verificación de administrador · 2026-10-21

- Se confirmó que `elmeryaletorrez@gmail.com` ya existe y está confirmado en Supabase Auth.
- Se creó o actualizó su perfil en `public.profiles` con nombre visible `Elmer Yaletorrez` y rol `admin`.
- Verificación remota completada mediante consulta de Auth + `profiles`; la cuenta ya puede entrar al panel administrativo.
- El asesor de seguridad reporta un aviso externo: está desactivada la protección contra contraseñas comprometidas. Se intentó activarla desde Authentication > Providers > Email, pero Supabase confirmó que la función HaveIBeenPwned requiere un plan Pro o superior; el proyecto quedó sin cambios.
- Se desactivó y verificó `Allow new users to sign up` en Authentication > Providers. El alta queda restringida a invitaciones administrativas y la configuración se conservó después de recargar el Dashboard.

### Punto 4 · Plantillas y actividades en Supabase · 2026-10-21

- Se conectó el constructor de plantillas con `evaluation_templates` para usuarios autenticados con perfil válido.
- Al iniciar sesión se cargan las plantillas y actividades propias desde Supabase respetando RLS; el contenido local de demostración se conserva como respaldo.
- Guardar una plantilla escribe su contenido estructurado en `content`, mantiene el estado `draft` o `accepted` y registra `accepted_at` cuando corresponde.
- Aceptar una plantilla sincroniza también las actividades compatibles generadas automáticamente en `activities`, conservando `template_id` y `details`.
- Crear una actividad manual y cambiar el estado de una propuesta también intentan sincronizarse con Supabase; si el backend falla, la interfaz informa el problema y conserva la copia local.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build Vite exitoso.
- Pendiente: conectar con la misma estrategia las salas, participantes, intentos, respuestas y auditoría para completar la persistencia multi-dispositivo.

- Al iniciar sesión se cargan las plantillas y actividades propias y se reemplazan únicamente los registros cloud del respaldo local, sin mezclar datos de otros usuarios.
- Las plantillas guardan su contenido pedagógico estructurado en `content`; las actividades conservan `options`, `answer`, `details`, `template_id` y su estado.
- Aceptar una plantilla sincroniza primero la plantilla y luego las actividades compatibles generadas automáticamente.
- La sincronización usa las políticas RLS existentes de propietario; no expone `service_role` en el navegador.

### Punto 2 · Verificación de rol · 2026-10-21

- `profiles` es la fuente de verdad para distinguir `teacher` y `admin`; la selección visual de la pantalla inicial solo inicia el flujo y no concede permisos.
- `getProfile` valida que el perfil leído pertenezca al usuario autenticado y que el rol sea uno de los roles permitidos.
- Si la consulta del perfil falla, la aplicación muestra una pantalla de verificación detenida y no entra a ningún panel protegido.
- Si el rol elegido no coincide con el rol persistido, se bloquea el acceso al panel incorrecto y se ofrece entrar con el rol verificado.
- La cuenta `elmeryaletorrez@gmail.com` permanece vinculada a `admin`; el alta de docentes continúa restringida a invitaciones administrativas.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.

### Punto 3 · Protección de paneles · 2026-10-21

- Se definió una lista de vistas permitidas para cada panel: el docente accede a contenido, propuestas, salas y resultados; el administrador accede a usuarios, auditoría, salas globales y resultados.
- Si una vista interna queda fuera del conjunto permitido para el rol actual, la interfaz vuelve al resumen en lugar de renderizar el panel equivocado.
- `Usuarios y permisos` exige un perfil `admin` antes de mostrar la acción de invitar docentes y vuelve a comprobarlo antes de llamar a `admin-invite-teacher`.
- La Edge Function conserva la validación de servidor y no se considera suficiente la protección visual del navegador.
- En modo demo local se conserva la navegación simulada; con Supabase configurado, los paneles docente y administrativo requieren sesión y perfil verificado.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.

### Compatibilidad

Después de aceptar la plantilla, la aplicación analizará qué actividades son viables. Las actividades incompletas deben aparecer deshabilitadas, en tono oscuro y con explicación de la información faltante.

La aceptación de la plantilla es la aprobación docente del contenido. Al aceptarla, EvaluEdu genera directamente una actividad por cada formato compatible. Las actividades generadas no requieren una segunda aprobación; la opción de crear una actividad manual adicional se conserva.

### Seis actividades iniciales

1. Escenario de decisiones con consecuencias diferentes por opción y etapas lineales.
2. Falso/verdadero con afirmación, respuesta esperada, explicación, feedback y puntaje.
3. Asociación de ideas con pares y relaciones correctas.
4. Clasificación con categorías, elementos y arrastrar y soltar.
5. Ordenamiento con pasos libres, orden correcto y arrastrar y soltar.
6. Selección múltiple con varias opciones y una sola respuesta correcta.

Cada actividad tendrá su propio editor, esquema y validación. No se debe usar un formulario genérico para todas.

### Generación automática

La plantilla aprobada es la autorización docente del contenido. EvaluEdu genera directamente las actividades compatibles para evaluar ese contenido; no solicita una segunda aprobación por cada actividad. Las propuestas generadas por IA, si se incorporan después, deberán distinguirse de estas actividades determinísticas y seguir su propia revisión.

```text
Contenido estructurado → aprobación docente → generación de actividades compatibles → sala
```

### Salas

- De una a tres actividades diferentes por sala.
- Las actividades pueden repetirse y reordenarse.
- Puntajes configurables antes de iniciar.
- Tiempo general opcional; si existe, cierra la sesión para todos al llegar a cero.
- Código nuevo en cada sala.
- Una sala iniciada no puede modificarse.
- No habrá pausa en la primera versión.

Estados:

```text
Borrador → Lista para iniciar → En espera → En curso → Finalizada → Archivada
```

Las salas archivadas conservan resultados y pueden duplicarse.

### Estudiante y resultados

- Puede esperar, avanzar, volver a preguntas anteriores y dejar preguntas sin responder.
- Puede reconectarse mientras la sala siga activa.
- Recibe feedback inmediato.
- Si se equivoca, recibe orientación sin ver directamente la respuesta correcta.
- No ve el resultado final.
- No existe ranking como función de la evaluación.
- La aplicación calcula y exporta evidencias, pero no decide aprobación, certificación ni nota mínima.
- El Excel/CSV debe registrar participante, horarios, actividades, respuestas, omisiones, cambios, tiempos, feedback, puntajes, desconexiones, abandono y eventos importantes.

### Seguridad

- Resultados privados para el docente propietario y el administrador.
- Códigos aleatorios y validados en backend.
- Supabase Auth, RLS, sesiones protegidas y Realtime cuando esté configurado.
- Nunca colocar `service_role` en el frontend.
- Solicitar solo datos necesarios.
- Exportaciones privadas, nunca mediante enlaces públicos.

## Orden de desarrollo

1. Pantalla de selección de rol e identidad EvaluEdu.
2. Modelo y constructor de plantilla.
3. Validación, progreso, borradores, vista previa y PDF.
4. Motor de compatibilidad.
5. Editores específicos de las seis actividades.
6. Propuestas con revisión docente.
7. Salas reales, repetición, orden y estados.
8. Supabase Auth, base de datos, RLS y Realtime.
9. Respuestas, reconexión, resultados y exportación detallada.
10. Pruebas responsive y PWA instalable.

## Registro de avance

### 2026-10-20

- Proyecto independiente creado.
- MVP visual responsive creado.
- Roles simulados y menú docente implementados.
- Seis actividades representadas.
- Flujo demo de borrador, revisión y publicación.
- Salas demo con código, máximo de tres tipos y tiempo opcional.
- Feedback sin revelar directamente la respuesta.
- Resultados demo y CSV compatible con Excel.
- TypeScript y build de producción verificados.

### 2026-10-20 · Identidad y roles

- Se añadió la pantalla inicial de selección por iconos.
- Se adoptó **EvaluEdu** como nombre visible provisional.
- Se actualizó el título del navegador, manifest y paquete.
- TypeScript y build de producción verificados.

### Pendiente inmediato

### Punto 5 · Salas, participantes e intentos · 2026-10-21

- Las salas del docente autenticado se cargan desde `rooms` y `room_activities` mediante las políticas RLS de propietario.
- Crear y duplicar una sala mantiene una copia local inmediata y sincroniza la configuración, código, estados y posiciones de actividades cuando las actividades seleccionadas ya existen en Supabase.
- Las transiciones de sala actualizan también `started_at`, `finished_at` y `archived_at` en Supabase.
- El panel de resultados recupera participantes, intentos y respuestas del propietario; se agregó `attempts.events` como JSONB para conservar navegación, omisiones, tiempos y eventos importantes.
- El límite de estudiantes se valida en el esquema de participantes preparado para el backend.
- No se desplegó un endpoint anónimo sin JWT que devolviera respuestas correctas; el flujo remoto usa autenticación anónima y evaluación server-side.
- Se desplegó `student-room-sync` con `verify_jwt = true`: exige una sesión anónima, vincula el participante a `auth_user_id`, entrega solo la estructura segura y recalcula el puntaje con la actividad privada en backend.
- Se agregó `room_participants.auth_user_id` con índice único por sala y usuario anónimo para impedir duplicar sesiones en una misma sala.
- El frontend crea la sesión anónima al ingresar por código, puede descubrir salas cloud sin precargarlas localmente y sincroniza el intento final sin confiar en el puntaje enviado por el navegador.
- Falta activar `Anonymous Sign-Ins` en Authentication > Providers; la plataforma también recomienda CAPTCHA/Turnstile y limpieza periódica de usuarios anónimos antes de producción.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build Vite de producción exitoso.

### Punto 6 · Realtime para salas y cronómetro · 2026-10-21

- Se verificó que `Anonymous Sign-Ins` está disponible, pero el flujo principal ya no depende de él porque `Allow new users to sign up` debe permanecer desactivado.
- Se agregó `public.rooms` a la publicación `supabase_realtime` mediante la migración `enable_room_realtime_access`.
- El panel docente/administrativo escucha cambios de sus propias salas mediante `postgres_changes`; una transición realizada desde otra sesión actualiza el estado visible sin recargar.
- La ruta autenticada conserva acceso restringido por `room_participants.auth_user_id`; la ruta temporal no abre lectura pública de tablas y consulta su estado mediante Edge Function.
- La ruta con Auth puede recibir en vivo el paso de `En espera` a `En curso` y el cierre. La ruta estudiantil temporal usa sondeo cada 2,5 segundos, con comprobación manual disponible como respaldo.
- El cronómetro de `PlayView` toma `rooms.started_at` como reloj de servidor y calcula el tiempo restante; reconectarse o recargar ya no reinicia el contador.
- La copia local continúa activa como respaldo temporal y no se eliminó.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas, build de producción exitoso y prueba visual de la entrada estudiantil con Supabase configurado.
- La prueba de ingreso remoto quedó bloqueada por la configuración de seguridad actual: `signInAnonymously()` responde `Signups not allowed for this instance` porque `Allow new users to sign up` permanece desactivado. En Supabase, el alta anónima también cuenta como alta de usuario.

### Acceso estudiantil sin cuentas · 2026-10-21

- Se mantiene desactivado `Allow new users to sign up`; el estudiante no crea usuarios de Supabase.
- Se desplegó `student-room-guest` con `verify_jwt = false`, pero la función exige su propio token opaco temporal para consultar estado o enviar el intento. El token se genera solo después de validar código, nombre, estado y límite de la sala.
- En `room_participants` se agregaron `guest_token_hash` y `guest_token_expires_at`; nunca se guarda el token en texto plano y el hash se invalida después de seis horas.
- El servidor sigue devolviendo actividades sanitizadas sin respuestas correctas y recalcula el puntaje usando la actividad privada.
- El frontend usa `student-room-guest`, conserva la credencial durante la sesión del navegador y consulta el estado periódicamente. El endpoint autenticado anterior queda disponible como ruta futura, pero ya no depende del registro anónimo.
- La llamada de prueba con código inexistente confirmó que el nuevo endpoint responde desde Supabase sin devolver el error `Signups not allowed`.

### Roles múltiples para la prueba docente · 2026-10-21

- `public.profiles` ahora conserva el rol principal en `role` y los permisos disponibles en `roles`.
- La cuenta de Elmer Yaletorrez mantiene `role = admin` y quedó autorizada también como `teacher`.
- El frontend permite cambiar entre Administrador y Docente cuando ambos permisos están presentes; las cuentas de un solo rol no obtienen acceso adicional.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.

### Panel administrativo conectado · 2026-10-21

- Se desplegó `admin-platform-data` con JWT obligatorio; valida el perfil administrador antes de consultar información global.
- El panel administrativo ahora puede leer desde Supabase usuarios, salas globales, actividades, intentos y auditoría sin exponer `service_role` al frontend.
- Se reemplazaron los avisos desactualizados de “Supabase pendiente” por estados diferenciados: conectado, respaldo local y cargando.
- El directorio muestra roles, estado de cuenta y último acceso; las salas globales muestran docente propietario y actividades; los resultados administrativos usan intentos del backend.
- La invitación de docentes conserva el flujo protegido existente y refresca el directorio después de enviarse.
- Verificación completada: Edge Function activa versión 2, TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.

### Sesión expirada al invitar docentes · 2026-10-21

- Se identificó en los logs de Supabase que `admin-invite-teacher` respondía `401` porque el navegador enviaba una sesión vencida; la Edge Function sí estaba desplegada y protegida correctamente.
- El formulario de invitación ahora intenta renovar la sesión antes de llamar a la función.
- Los errores de Edge Functions ahora muestran mensajes específicos para sesión vencida (`401`) o permisos insuficientes (`403`) en lugar del mensaje genérico de estado no `2xx`.
- Si el refresh token ya no es válido, la interfaz solicita cerrar sesión e iniciar nuevamente; no reenvía invitaciones automáticamente.
- Se añadió un botón visible de **Cerrar sesión** en la barra superior común para los paneles de administración y docente.

### Paneles independientes en el navegador · 2026-10-21

- Se agregaron URLs directas por rol mediante `?panel=teacher`, `?panel=student` y `?panel=admin`.
- La pantalla inicial ofrece enlaces para abrir cada panel en una pestaña o ventana independiente.
- La barra superior incluye **↗ Abrir panel** para abrir otro rol sin cambiar el panel actual.
- Las ventanas del mismo navegador comparten la sesión persistida de Supabase; el acceso del servidor continúa validando el rol de cada cuenta.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.

### Invitación docente y activación de contraseña · 2026-10-21

- Se corrigió `admin-invite-teacher` para recibir el destino actual de EvaluEdu y pasarlo a `inviteUserByEmail` de forma controlada.
- La función quedó desplegada como versión 3, con JWT obligatorio y validación de destinos locales o de `APP_URL`.
- Se agregó el flujo de aceptación de invitación: el enlace válido abre EvaluEdu y permite definir la contraseña docente mediante `auth.updateUser`.
- Los enlaces de invitación son de un solo uso; el enlace anterior que ya falló debe reemplazarse por una nueva invitación.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build de producción exitoso.
- En Supabase Auth se actualizó el `Site URL` a `http://192.168.18.106:4177` y se agregaron las rutas locales permitidas para los puertos 4177 y 4176, incluyendo `localhost`, `127.0.0.1` y la IP LAN de prueba.

### Prueba integral de plantilla, salas y resultados · 2026-10-21

- Se creó y aceptó la plantilla **Cuidado del agua y manejo responsable de residuos**, con conceptos, situaciones, pasos y categorías completos.
- La aprobación generó automáticamente las seis actividades compatibles: escenario, falso/verdadero, asociación, clasificación, ordenamiento y selección múltiple.
- En la sala `EDU-624` se configuraron 3 preguntas, máximo 3 estudiantes, 10 minutos, 10 puntos por pregunta y se probaron escenario, falso/verdadero y asociación.
- Desde la pantalla estudiantil se verificó el ingreso por código, la actualización de `En espera` a `En curso` sin recarga, el cronómetro, el feedback, el cierre y la participación sincronizada: **30/30, 3 correctas**.
- En la sala `EDU-851` se probaron los tres formatos restantes: clasificación, selección múltiple y ordenamiento. El intento también quedó sincronizado con **30/30, 3 correctas**.
- Se corrigió la reconciliación entre respaldo local y Supabase: un mismo intento ya no aparece duplicado en resultados cuando existe en ambas fuentes.
- Se corrigió **Salir de la sala** para devolver al estudiante a la pantalla de ingreso, permitiendo cambiar de sala sin quedar atrapado en la vista de actividad.
- Se verificó el detalle docente de ambas participaciones, incluidas respuestas, tiempos, eventos y puntajes.
- TypeScript pasó sin errores. La prueba Vitest ya había pasado con 7 casos; una nueva ejecución quedó impedida por el entorno local de `node_modules` enlazado a otra carpeta, no por un error de código.

### Revisión QA con tres paneles abiertos · 2026-10-21

- Se revisaron simultáneamente los paneles docente, estudiante y administrativo en ventanas separadas.
- El panel docente conserva los dos intentos, permite filtrar por sala y conserva el detalle después de archivar las salas de prueba.
- El panel administrativo confirma usuarios, resultados y salas globales; las salas archivadas siguen visibles y en solo lectura.
- El selector de actividades bloquea correctamente una cuarta clase cuando ya hay tres tipos distintos seleccionados.
- El formulario de invitación docente se abre con correo y nombre visible, sin enviar una invitación durante la prueba.
- Se detectó y corrigió que el snapshot administrativo no se actualizaba al cambiar de sección; ahora vuelve a consultar Supabase cuando cambia la vista.
- La auditoría administrativa sigue vacía porque todavía no se insertan filas en `audit_events`; los eventos de cada intento sí se conservan dentro del detalle del intento.
- La exportación CSV/Excel fue invocada desde docente y administrador, pero la descarga no pudo verificarse automáticamente en el navegador; requiere una comprobación manual del archivo descargado.
- TypeScript pasó sin errores después de la corrección.

### Reconexión estudiantil y omisiones · 2026-10-21

- Se detectó que al recargar una evaluación activa el estudiante volvía al ingreso y perdía la vista del intento.
- Se agregó un respaldo temporal en `sessionStorage` con sala, participante, token temporal, actividad actual, respuestas, tiempos, eventos y estado de finalización.
- Al recargar una sala cloud activa, el frontend valida nuevamente el participante mediante `student-room-guest` y restaura la actividad actual sin reiniciar el cronómetro del servidor.
- La prueba con `EDU-678` confirmó la reconexión, la continuidad del recorrido, una respuesta correcta y dos preguntas omitidas.
- El resultado quedó registrado como `1/3 respondidas`, `2 omitidas` y `10/30`, y la sala fue finalizada y archivada conservando el intento.
- TypeScript pasó sin errores después de esta implementación.

### Pendiente inmediato

Falta registrar eventos en `audit_events`, verificar manualmente el CSV/Excel descargado y convertir el directorio administrativo demo en gestión real de usuarios y permisos. El PDF usa el flujo de impresión del navegador para que el docente pueda elegir "Guardar como PDF".

### Punto 7 · Persistencia cloud principal y respaldo local · 2026-10-21

- Se creó `src/lib/sync.ts` con una cola persistente en `localStorage` para operaciones pendientes de actividades, plantillas, salas, cambios de estado e intentos.
- Las escrituras locales se mantienen disponibles aunque Supabase falle; la interfaz muestra `Sin conexión · respaldo local`, la cantidad de operaciones pendientes o `Sincronizado` en la barra superior.
- La cola se reintenta automáticamente al recuperar conexión, al volver a disponer de una sesión válida y mediante el botón visible `Sincronizar`.
- Se agregaron reintentos protegidos contra duplicados para plantillas, actividades y salas, y los intentos conservan sus respuestas tipadas para poder enviarse después.
- La copia cloud pasa a ser la fuente principal al cargar contenido; `localStorage` queda como respaldo temporal y la reconciliación conserva una sola copia de cada intento.
- Se actualiza la última fecha de sincronización después de cargas y escrituras exitosas.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas y build Vite de producción exitoso. El build emitió únicamente el aviso existente de tamaño del bundle principal.

### PWA instalable · 2026-10-21

- Se completó `public/manifest.webmanifest` con identidad, descripción, alcance, orientación, colores, categorías e iconos adaptables.
- Se agregaron `public/icon.svg` y `public/icon-maskable.svg` para la identidad de EvaluEdu en la pantalla de inicio.
- Se agregó `public/sw.js` con caché de la carcasa de la aplicación y estrategia network-first para navegación; no cachea rutas privadas de Supabase.
- `src/main.tsx` registra el service worker en producción y el panel muestra `Instalar app` cuando el navegador expone `beforeinstallprompt`.
- La instalación como PWA requiere HTTPS en un dominio o `localhost`; la URL LAN HTTP sirve para probar la vista móvil, pero puede no mostrar la opción de instalación completa.
- Verificación completada: TypeScript sin errores, 7 pruebas Vitest aprobadas, build de producción exitoso y archivos PWA presentes en `dist/`. El bundle principal mantiene el aviso informativo de tamaño.

### Importación de contenido JSON estructurado · desarrollo local · 2026-10-21

- Se confirmó que la versión publicada de referencia es `https://evaluedu.elmer-yale99-torrez.chatgpt.site/`, actualmente versión 7 del Site; esta implementación se mantiene en la rama `codex/import-json-content` y no se ha publicado.
- Se definió el esquema versionado `edueval.content` v1 en `src/lib/edueval-content-v1.schema.json` y el validador runtime en `src/lib/contentImport.ts`.
- El validador rechaza JSON inválido, versiones o identificadores desconocidos, propiedades no permitidas, tipos incorrectos, campos obligatorios vacíos, listas demasiado grandes y textos que exceden los límites; los errores incluyen rutas específicas.
- Se añadió el prompt oficial para que una IA externa produzca únicamente el JSON compatible. EduEval no genera contenido con IA ni envía el contenido importado a un servicio externo.
- Se integró `Mi contenido → Importar JSON`: acepta pegar el JSON o seleccionar un archivo, valida, muestra errores, detecta los formatos compatibles y convierte el contenido válido en una plantilla interna.
- Las actividades generadas desde una importación quedan en estado `pending` para revisión docente; solo después de aprobarlas pueden seleccionarse para una sala. El formulario manual continúa disponible.
- La importación reutiliza la persistencia existente: `evaluation_templates.content` (JSONB), `activities`, RLS de propietario y la cola local de sincronización; no fue necesario agregar tablas ni Edge Functions.
- Se añadieron 6 casos de prueba para el contrato: documento completo, JSON inválido, versión/esquema incorrectos, rutas específicas, contenido sin compatibilidad y cálculo de compatibilidad. Verificación: 13 pruebas Vitest aprobadas, TypeScript sin errores y build Vite exitoso.
- La prueba visual con navegador remoto quedó limitada porque el entorno no pudo acceder al servidor local; no se desplegó ni alteró la versión publicada.

### Preparación de publicación HTTPS · 2026-10-21

- Se verificó que `dist/` contiene el bundle PWA completo y los archivos estáticos necesarios.
- Se creó `docs/PUBLICACION_PWA.md` con comandos, variables públicas de Supabase, configuración de Auth, reglas SPA y pruebas móviles.
- Se eligió Sites para la primera publicación porque entrega HTTPS y despliegue estático sin exponer el repositorio fuente como ocurriría con un repositorio público de GitHub Pages.
- Se creó el Site `EvaluEdu`, se sincronizó el commit `e22fe28b4a9eb55b6d303372668f6d6def502d5a` y se guardó la versión 1.
- Se configuró el Site como público para que los estudiantes puedan abrirlo desde el móvil e ingresar mediante código de sala; la autorización de docente y administrador sigue en Supabase Auth + `profiles`.
- Despliegue verificado: [https://evaluedu.elmer-yale99-torrez.chatgpt.site](https://evaluedu.elmer-yale99-torrez.chatgpt.site).
- La URL de producción todavía debe registrarse como `Site URL` y Redirect URL en Supabase Auth antes de probar invitaciones docentes en producción.
- Se endureció localmente el prompt oficial de importación JSON: ahora indica que las actividades no se generan desde la IA externa, trata el contenido del docente como datos, exige una salida parseable sin claves adicionales y se muestra en la interfaz en modo solo lectura. El validador continúa siendo la autoridad final.
- Se confirmó que la versión actual soporta seis formatos de actividad. Los cinco formatos adicionales solicitados aún no están implementados porque falta definir sus tipos y reglas de corrección antes de modificar el motor, el editor y la vista del estudiante.

### Consolidación de decisiones del chat de organización · 2026-10-22

Esta entrada reúne las decisiones funcionales confirmadas durante el chat utilizado para organizar la idea de EduEval. Las entradas anteriores se conservan como historial; cuando exista una contradicción, esta consolidación representa el criterio vigente para la primera versión.

#### Decisiones cerradas

- EduEval/EvaluEdu es una PWA responsive para Android y computadora, funciona en línea y usa Supabase como backend principal. El respaldo local no sustituye la fuente cloud.
- La primera versión mantiene los roles Administrador, Docente y Estudiante. No existe un rol de revisor independiente; el docente revisa y aprueba sus actividades. El administrador autoriza docentes; el estudiante ingresa mediante código de sala y no necesita una cuenta permanente. El registro universitario queda como posible mejora futura.
- El contenido se prepara mediante un contrato JSON versionado (`edueval.content` v1). El docente puede usar una IA externa de su preferencia con el prompt oficial, descargar el JSON y cargarlo o pegarlo en EduEval.
- EduEval no genera contenido con IA ni envía el contenido importado a servicios externos. La validación del esquema y del runtime de EduEval es la autoridad final.
- No se aceptan documentos arbitrarios como fuente automática. Word, PDF y texto libre no se interpretan directamente; el PDF de la app sirve como respaldo exportable.
- La importación válida se convierte en una plantilla interna, calcula las actividades viables y deja las actividades en estado `pending`. El docente debe revisarlas y aprobarlas antes de que puedan usarse en una sala.
- El formulario manual se conserva como vía alternativa mientras el flujo JSON se consolida; no se elimina sin una decisión explícita.
- La primera versión contempla seis actividades: escenario de decisiones, falso/verdadero, asociación de ideas, clasificación, ordenamiento y selección única.
- Una sala admite hasta tres tipos diferentes, permite repetir y reordenar actividades, configura puntajes antes de iniciar y tiene tiempo general opcional. No hay pausa en la primera versión y una sala iniciada no se modifica.
- El estudiante recibe retroalimentación después de responder, pero si se equivoca no se le muestra directamente la respuesta correcta. No ve resultados finales ni ranking.
- El docente y el administrador acceden a resultados privados y el docente puede descargar el registro detallado en CSV/Excel. La aplicación no decide aprobación, certificación ni nota mínima.

#### Rectificaciones documentales

- Las menciones históricas a que la plantilla “no depende de cargar archivos” quedan superadas por la importación controlada de archivos JSON. La restricción vigente es que solo se acepten archivos que cumplan el contrato JSON.
- Las menciones históricas a que aceptar la plantilla genera y publica directamente las actividades quedan superadas: las actividades importadas requieren revisión y aprobación docente.
- Las menciones a una posible IA dentro de EduEval quedan superadas por el flujo de IA externa; no se incorpora un servicio generativo dentro de la aplicación en esta versión.

#### Pendientes que permanecen abiertos

- Registrar eventos administrativos en `audit_events`.
- Verificar manualmente la descarga CSV/Excel en dispositivos reales.
- Completar la gestión administrativa real de usuarios, permisos y suspensión.
- Configurar definitivamente `Site URL` y Redirect URLs de Supabase para producción.
- Definir las reglas de los cinco formatos de actividad futuros antes de implementarlos.

La actualización de esta documentación no modifica la versión publicada ni altera los cambios pendientes del código. El esquema JSON y la guía técnica existentes continúan siendo la base de implementación.

### Auditoría y secuencia v1.2 de actividades · 2026-10-22

Esta entrada integra las decisiones posteriores del chat de trabajo. En esta etapa no se modifica código ni se publica la aplicación; se establece la base para revisar las seis actividades actuales antes de perfeccionar el prompt y el validador.

#### Interpretación del contenido importado

- La skill no está necesariamente equivocada cuando transforma un material expositivo en JSON. El problema aparece si ese JSON se interpreta como material de evaluación completo sin distinguir el nivel de preparación.
- Objetivo y competencia son relevantes para una evaluación pedagógicamente estructurada. No deben inventarse cuando el docente no los proporcionó; su ausencia debe advertirse y puede reducir la disponibilidad de actividades, pero no invalidar automáticamente todo el archivo.
- Una lista de categorías no demuestra una clasificación. Debe existir una relación explícita entre cada elemento y su categoría.
- La compatibilidad debe basarse en evidencia relacionada y corregible, no en la mera presencia de listas.

#### Requisitos mínimos acordados

1. Escenario: contexto, decisión, alternativas reales y consecuencias asociadas.
2. Falso/verdadero: afirmación verificable, valor esperado y explicación/evidencia.
3. Asociación: pares inequívocos entre elementos y relaciones.
4. Clasificación: categorías y asignaciones elemento → categoría.
5. Ordenamiento: pasos distintos y orden correcto.
6. Selección única: pregunta, distractores plausibles y una sola respuesta sustentada.

#### Secuencia de trabajo

La atención se realizará por capas: contrato de las actividades; auditoría del editor, generador, vista del estudiante, motor de respuestas, feedback, puntaje y persistencia; corrección del motor; corrección de compatibilidad y validador; diseño de la skill/prompt; pruebas completas. La skill se probará antes de integrarla en la aplicación. Los quince formatos futuros quedan fuera de esta etapa y se incorporarán cuando sus reglas estén definidas.

#### Riesgos iniciales a verificar

- Clasificación habilitada sin relaciones explícitas.
- Escenarios con alternativas inventadas por el generador.
- Falso/verdadero que marca siempre como verdadera la primera definición.
- Selección única sin pregunta ni respuesta sustentada.
- Uso insuficiente de `details` y de las relaciones del contenido.
- Posible diferencia entre los campos opcionales del esquema y los campos que el validador runtime trata como obligatorios.

La documentación queda lista para iniciar la matriz de actividades v1.2 en el espacio de trabajo separado. La publicación vigente no se modifica.

### Sincronización del espacio operativo v1.2 · 2026-10-22

- Se integraron en la documentación los criterios de preparación pedagógica, los requisitos mínimos de las seis actividades, los riesgos preliminares del generador y la secuencia de trabajo.
- Se agregó `docs/MATRIZ_ACTIVIDADES_V12.md` como base para la auditoría detallada.
- La documentación anterior que se había conservado temporalmente fue eliminada para evitar referencias duplicadas en el espacio activo.
- A partir de esta entrada, el trabajo operativo de esta etapa continuará en `C:\Users\elmer\OneDrive\Desktop\EduEval-v12-Actividades`.
- No se modificó código ni se alteró la versión pública.

### Análisis comparativo profundo y base de ampliación · 2026-10-22

- El usuario confirmó que la matriz es una guía y solicitó fundamentar las correcciones con referencias de plataformas educativas existentes. Autorizó el análisis profundo y considerar un catálogo final de aproximadamente 21 actividades. Las menciones históricas a cinco formatos adicionales no fijan el alcance futuro vigente.
- Se creó `docs/ANALISIS_COMPARATIVO_ACTIVIDADES_V12.md`: fuentes oficiales de H5P, Moodle y Canvas; referencias de QTI, W3C y OWASP; revisión integral de las seis actividades; 22 hallazgos priorizados y propuesta de arquitectura modular.
- Se creó `docs/PLAN_VERIFICACION_ACTIVIDADES_V12.md`: evidencia de 17 comprobaciones locales en memoria y plan de pruebas de motor, privacidad, intentos, importación, skill, accesibilidad y extremo a extremo. Los casos futuros están identificados como propuestos, no aprobados por ejecución.
- Se confirmó localmente que la construcción de la respuesta de ingreso incluye `privateActivities` con respuestas y claves, que el motor puede aceptar una respuesta de tipo distinto y que una actividad sanitizada puede calificarse de forma diferente al original privado. La comprobación usó datos técnicos y un cliente simulado, sin consultas remotas.
- Se revisó que el envío se evalúa desde las filas recibidas del navegador, que el reloj visual se detiene durante feedback y que faltan garantías visibles de ocurrencias, revisiones y recuperación estudiantil. Las restricciones SQL y el despliegue público no se verificaron.
- Se precisó que las flechas de ordenamiento y los selectores de clasificación deben conservarse como alternativas accesibles al arrastre. La asignación de puntaje parcial no se adopta por copia de otra plataforma: queda como una decisión explícita por tipo después de reparar la política exacta actual.
- El horizonte de 21 actividades se atiende mediante contratos por tipo, servicios comunes, versiones, ocurrencias y pruebas. No se definieron los quince formatos pendientes ni se amplió su contrato.
- Se sincronizó README con el estado de análisis y el horizonte del catálogo. No se modificaron motor, editores, esquema, validador, skill ni funciones de servidor; no se publicó ni se modificó Supabase.
- Verificación: 17 comprobaciones dirigidas ejecutadas con Node.js v24.19.0. `npm run test` y `npm run build` no pudieron iniciar porque `npm` no está reconocido en PATH; `node_modules` no existe en esta copia. No se declara aprobada la suite Vitest, TypeScript, build ni prueba visual.

Pendiente: revisar las decisiones concretas de contrato/puntaje/confirmación del informe y continuar la secuencia vigente: contrato de las seis → motor y pruebas → compatibilidad/validador → skill/prompt → extremo a extremo. Cualquier operación remota o publicación queda fuera de esta etapa de análisis.

### Auditoría de lectura de app publicada y Supabase · 2026-10-22

- El usuario proporcionó `https://hjcspzgglchnksnrcwmd.supabase.co`, abrió app y Dashboard con sesión y autorizó proceder con la auditoría real. Se realizaron lecturas y consultas SELECT; no se implementaron correcciones ni se alteró el despliegue.
- Se creó `docs/AUDITORIA_APP_PUBLICADA_SUPABASE_V12.md`, con evidencia de versión, inventario, fuentes desplegadas, restricciones, políticas, seis editores, respuestas existentes y exportación.
- Sites confirmó la publicación v13, commit `c9ecae6817970d887c661ab1facd7ca2a960714b`, despliegue exitoso. La carpeta local no dispone de HEAD y no se declaró paridad completa de frontend. La biblioteca publicada no mostró el importador JSON presente en esta copia.
- Supabase confirmó nueve tablas con RLS, doce actividades publicadas con `details = {}`, cuatro salas, tres participantes, tres intentos y nueve respuestas. Se leyó la fuente de guest v1 y sync v2: coincide con los archivos locales normalizando saltos de línea y espacios finales. La colección privada en el ingreso continúa presente en ese código desplegado.
- Rectificación: existe `UNIQUE(participant_id)` en intentos y `UNIQUE(attempt_id, question_index)` en respuestas. El mismo participante no puede crear libremente dos intentos. Sigue pendiente el acuse idempotente de guest y contrastar cada fila con las ocurrencias autorizadas; no se intentó provocar la colisión en producción.
- Las políticas `*_permanent_users_only` son restrictivas y se combinan con las de propietario; los avisos de acceso anónimo del asesor se contextualizaron y no se presentaron como prueba de fuga directa de tablas. No se modificó RLS.
- Se observaron prellenados genéricos en escenario, asignaciones por posición en clasificación y primera opción marcada en selección única. Se canceló el formulario sin publicar. Los intentos existentes incluyen una pregunta usada como alternativa correcta de escenario y claves de clasificación por posición: puntaje alto no certifica preparación pedagógica.
- La biblioteca docente mostró dieciocho actividades frente a doce cloud, incluyendo seis demo; se registró un indicador `1 pendiente` sin forzar su sincronización.
- Se verificó la descarga `C:\Users\elmer\Downloads\edueval-resultados (3).csv`: nueve filas, veinte columnas, BOM UTF-8 y acentos preservados; no incluye columnas de feedback/eventos. No se abrió Excel/LibreOffice.
- Se inspeccionó la entrada estudiantil a 360 × 800 sin desbordamiento; se restauró el viewport. No se registró un participante ni se inició la sala en espera.
- Algunas consultas del conector SQL fallaron; la lectura de nueve respuestas funcionó en el editor temporal del Dashboard, cerrado sin guardar snippet. No se infirió pérdida de datos por ese fallo.
- Se actualizaron README, análisis y plan de verificación con el contraste real. Motor, editores, contratos, validador, skill y funciones permanecen sin cambios. Las pruebas nuevas de estudiante, reconexión y envío requieren una sala exclusiva de pruebas y no se declaran completadas.

### Diagnóstico final con participación estudiantil real · 2026-10-22

- El usuario precisó que la publicación v13 es correcta como referencia pública y que la importación JSON era una versión local de prueba. Su ausencia en v13 no se considera falla. Se trabajará primero en local y los cambios públicos se revisarán después; esta auditoría no autoriza desplegar mejoras.
- Autorizó crear salas desde el panel docente e ingresar estudiantes de nombre ficticio para completar el diagnóstico. Se crearon dos por el límite de tres tipos distintos: `AUDITORÍA v1.2 · A · 22-10-2026`, código `EDU-360`, y `AUDITORÍA v1.2 · B · 22-10-2026`, código `EDU-322`.
- Se reutilizaron las seis actividades existentes de El Ciclo del Agua; no se generó contenido ni se modificaron sus claves. Participantes ficticios: `Prueba V12 Lince 22` y `Prueba V12 Colibri 22`.
- A tiene seis ocurrencias (escenario, V/F y asociación repetidos), cinco minutos y diez puntos por pregunta. Resultado real: `timeout`, cinco respondidas, una omitida, tres correctas, 30/60. B tiene clasificación, ordenamiento y selección única, sin límite; resultado real: 30/30.
- Se comprobó ingreso/espera/inicio, elecciones exclusivas, asociación, repetición, bloqueo de respuestas confirmadas al volver atrás, arrastre de clasificación, reasignación con selector, ordenamiento con flechas, final sin nota y recuperación de finalización tras recarga.
- Fallas nuevas confirmadas: un par sin confirmar desaparece al recargar; el escenario muestra la misma consecuencia favorable al elegir una opción equivocada; el plazo de A terminó aproximadamente 50,7 segundos tarde y no cerró la sala; la última asociación parcialmente contestada quedó omitida con respuesta vacía y cero segundos.
- B fue finalizada por docente a las 18:45:53.481 UTC. El estudiante aún pudo confirmar a las 18:46:13.670 y entregar a las 18:46:21.372. SQL confirmó el intento posterior al cierre. Fechas de intento/eventos son actualmente declaradas por el cliente, contrastadas con UI y consultas; no se presentan como sellos autoritativos de recepción.
- Los resultados docentes nuevos aparecieron después de recargar; se registró también una discrepancia transitoria del estado de A en la pestaña, corregida al recargar desde Supabase. No se atribuye una causa no demostrada.
- SELECT confirmó ambas salas `finished`, sin archivar. El control automático de aprobación rechazó el intento de archivado por considerarlo un cambio persistente adicional no autorizado; no se buscó una vía alternativa ni se borraron datos. El archivado queda pendiente de autorización específica.
- Inventario posterior: seis salas, veintiuna relaciones, cinco participantes, cinco intentos y dieciocho respuestas; plantillas tres, actividades doce y perfiles tres sin incremento. `audit_events` continúa en cero. Los datos de prueba deben excluirse de interpretaciones sobre alumnado real.
- Se creó `docs/DIAGNOSTICO_FINAL_ACTIVIDADES_V12.md` con dieciocho comprobaciones T01–T18, funcionamiento/fallas por actividad, archivos, prioridades, criterios y arquitectura para aproximadamente veintiún formatos sin definir los quince futuros. Se guardaron cinco capturas en `docs/evidencias-v12/` y se enlazaron los informes anteriores.
- No se publicaron cambios, no se modificaron motor/editores/contrato/validador/skill ni funciones, políticas o esquema de Supabase. Solo documentación/capturas locales y datos de prueba creados mediante la app.
- Límites: no se simuló desconexión real, no se probaron dispositivos limpios/Android físico, concurrencia o todos los casos con `details` completos. El viewport solicitado de 360 no se aplicó a la pestaña esperada; ancho efectivo observado 628 y override restablecido. No se declara aprobada una prueba móvil completa.
- La limitación previa de `npm` ausente y `node_modules` inexistente permanece; no se repitieron comandos inviables ni se instalaron dependencias en esta fase. Diagnóstico listo para iniciar contratos y motor con pruebas de regresión; no equivale a autorización de publicación ni certificación completa.
- Verificación de cierre documental: los 25 archivos de `src`, `supabase` y `public` mantienen sus hashes SHA-256 de la auditoría inicial; seis documentos revisados sin caracteres de reemplazo ni enlaces locales rotos. Cinco capturas guardadas; pestañas temporales de prueba cerradas y pestañas originales conservadas.

### Etapa 1 · Contrato y motor independiente de Falso/verdadero · 2026-10-24

- Diagnóstico previo registrado en `docs/REVISION_ANTIGRAVITY_DIAGNOSTICO_V12.md` (hallazgos F01–F26).
- Entorno habilitado con autorización del usuario: Node.js LTS v24.22.1 y npm 11.19.1 instalados en Windows; `node_modules` instalado en esta carpeta. Línea base previa: 14/14 pruebas y build correcto.
- Decisiones del docente: arquitectura con un contrato independiente por actividad (escalable a ~21); público objetivo bachillerato en adelante; empezar por la actividad más sencilla.
- Contrato de Falso/verdadero acordado: una afirmación por actividad; contexto opcional; clave `correct` obligatoria y explícita, sin valor por defecto; `explanation` privada (docente/CSV); `hint` público mostrado solo tras confirmar, idéntico acierte o falle (se mantiene la regla de retroalimentación orientadora, opción D); omisión distinta de Falso; respuesta de otro tipo o actividad rechazada.
- Decisión técnica: con tiempo agotado sin confirmar se conserva el valor marcado como evidencia, pero no se puntúa.
- Implementado: `src/lib/activities/trueFalse.ts` y `src/lib/activities/trueFalse.test.ts` (11 pruebas). Estado: **módulo aislado, no integrado** en `App.tsx`, Supabase, esquema JSON ni prompt.
- Verificación: `npm run test` 25/25 (3 archivos) y `npm run build` correcto.
- Reversión: borrar los dos archivos nuevos y restaurar `BITACORA.md.bak`.
- Pendiente: autorizar la integración en editor docente, vista del estudiante y exportación; luego continuar con las otras cinco actividades.

### Integración de Falso/verdadero v1.2 en la aplicación local · 2026-10-24

- Se instaló `MinGit v2.56.0.3` y se creó el punto de retorno en Git (`commit 9777d6c`) además de respaldos locales (`src/App.tsx.bak` y `BITACORA.md.bak`) para permitir reversión inmediata si el usuario lo solicita.
- Se integró el contrato v1.2 de Falso/verdadero (`src/lib/activities/trueFalse.ts`) en:
  1. Motor común (`src/lib/activityEngine.ts`): soporte de `context` y `hint` en `details.trueFalse`, rechazo de comparación cruzada de tipos para `trueFalse` y tratamiento de respuesta vacía como `omitted` (nunca como `"Falso"`).
  2. Editor docente (`TrueFalseEditor` en `src/App.tsx`): campos para contexto opcional, afirmación obligatoria, selector de clave esperada sin valor predeterminado (`— Elige la clave —`), pista orientadora pública (`hint`) y explicación privada (`explanation`), validados mediante `validateTrueFalseDefinition`.
  3. Vista del estudiante (`PlayView` en `src/App.tsx`): visualización del contexto opcional antes de la afirmación y entrega exclusiva de la pista orientadora (`hint`) tras confirmar la respuesta, sin exponer la explicación privada ni la clave.
  4. Vista docente de resultados (`ResultsView`) y exportación CSV (`exportCsv` en `src/App.tsx`): inclusión de la explicación privada y de la pista entregada para las respuestas de Falso/verdadero.
- Se agregó `src/lib/activities/trueFalseIntegration.test.ts` (3 pruebas de integración con el motor común).
- Verificación ejecutada: `npm run test` aprobó 28/28 pruebas (4 archivos) y `npm run build` compiló sin errores (`tsc -b && vite build`).

### Nivelación de la interfaz local con la publicación pública v13 · 2026-10-24

- El usuario solicitó activar la conexión local a Supabase y traer a esta copia local los 4 bloques de interfaz presentes en la versión pública v13 (`https://evaluedu.elmer-yale99-torrez.chatgpt.site/`).
- Se creó `.env.local` (excluido de Git) con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` públicas del proyecto Supabase de EvaluEdu.
- Se integraron en `src/App.tsx` y `src/index.css` los 4 bloques de v13 conservando intactos el importador JSON (`edueval.content` v1) y las mejoras del contrato v1.2 de Falso/verdadero:
  1. **Opciones de cuenta en barra lateral (`.sidebar-account-actions`) y cabecera `.role-label`:** botones directos de `🔑 Cambiar contraseña` y `↪ Cerrar sesión` en el pie de la barra lateral y correo de la sesión activa bajo el título del panel.
  2. **Centro de Ayuda (`HelpModal`):** tarjeta interactiva `¿Necesitas ayuda?` que abre la guía rápida de 4 pasos y el espacio para el video tutorial.
  3. **Contacto Docente (`FeedbackModal`):** botón `✎ Escribir sugerencia` en el panel docente con formulario que prepara el envío hacia `elmeryaletorrez@gmail.com`.
  4. **Acceso Piloto en Administración (`AdminUsersView` y `AuthScreen`):** selector entre `Acceso piloto` (con contraseña temporal e invocación de `admin-create-pilot-teacher`) e `Invitar por correo`.
- Se simplificó el manejo de `Dificultad` por decisión del docente: se retiró el selector de niveles de dificultad de los formularios (`TemplateBuilder` y `ActivityForm`) y de las tarjetas/vistas previas para no complicar el desarrollo de las actividades. Internamente se mantiene `'Intermedio'` por defecto para conservar compatibilidad con el esquema de Supabase y en el validador JSON (`validateContentDocument`) pasó a ser opcional con valor por defecto `'Intermedio'`.
- Verificación ejecutada: `npm run test` (29/29 pruebas aprobadas) y `npm run build` exitoso.

### Etapa 2 · Contrato modular e integración de Selección única (`singleChoice`) + Orden de actividades de fácil a difícil · 2026-10-24

- Por indicación del docente, se reordenaron las seis actividades en toda la interfaz, motor, matriz de compatibilidad y generador de plantillas desde la más sencilla hasta la más compleja:
  1. `trueFalse` (`Falso / verdadero`)
  2. `singleChoice` (`Selección múltiple`)
  3. `matching` (`Asociación`)
  4. `sorting` (`Clasificación`)
  5. `ordering` (`Ordenamiento`)
  6. `scenario` (`Escenario de decisiones`)
- Se creó el contrato modular independiente de Selección única en `src/lib/activities/singleChoice.ts` con sus pruebas unitarias (`src/lib/activities/singleChoice.test.ts`, 10 pruebas) y de integración (`src/lib/activities/singleChoiceIntegration.test.ts`, 3 pruebas):
  - Valida enunciado obligatorio (`prompt`), pista orientadora pública obligatoria (`hint`), contexto opcional (`context`), explicación privada opcional (`explanation`), entre 2 y 6 opciones con texto no vacío, sin opciones duplicadas (normalizando espacios y mayúsculas/minúsculas) y **exactamente una opción marcada como correcta** (`correct: true`).
  - La proyección pública (`toSingleChoicePublic`) entrega solo `{ id, label }` en cada opción, sin exponer `correct`, `explanation` ni `hint`.
  - La evaluación (`evaluateSingleChoice`) distingue respuestas confirmadas (`correct` / `incorrect`), omitidas (`omitted`, 0 puntos, `correct: null`) y tiempo agotado sin confirmar (`timeout`, conserva la opción marcada como evidencia sin puntuar), y rechaza respuestas de otro tipo o con opciones inexistentes.
- Se integró `singleChoice` v1.2 en `src/lib/activityEngine.ts` y `src/App.tsx`:
  - En `SingleChoiceEditor` ninguna opción aparece marcada como correcta por defecto al crear una actividad manual (`correct: false` en todas las opciones iniciales), obligando al docente a elegir explícitamente la clave y a escribir la pista orientadora.
  - En `PlayView` el estudiante ve el contexto opcional (`context`) si existe y tras confirmar recibe la pista orientadora (`hint`).
  - En `ResultsView` y en la exportación CSV (`exportCsv`) el docente visualiza la pista entregada y la explicación privada de `singleChoice`.
- Verificación ejecutada: `npm run test` aprobó **42/42 pruebas** (6 archivos de prueba) y `npm run build` (`tsc -b && vite build`) compiló sin errores.

### Etapa 3 · Contrato modular e integración de Asociación (`matching`) con tablero de enlace por columnas · 2026-10-24

- Por decisión del docente, la interacción del estudiante en **Asociación (`matching`)** se diseñó con un **tablero visual de enlace tocando columnas** (columna izquierda de conceptos y columna derecha de definiciones/relaciones barajadas determinísticamente) en lugar de un menú desplegable `<select>`, manteniendo paridad entre móvil (Android) y computadora.
- Se creó el contrato modular independiente de Asociación en `src/lib/activities/matching.ts` con sus pruebas unitarias (`src/lib/activities/matching.test.ts`, 9 pruebas) y de integración (`src/lib/activities/matchingIntegration.test.ts`, 3 pruebas):
  - Valida enunciado obligatorio (`prompt`), pista orientadora pública obligatoria (`hint`), contexto opcional (`context`), explicación privada opcional (`explanation`) y entre 2 y 6 pares (`pairs`) con textos de concepto (`left`) y relación (`right`) no vacíos y sin conceptos ni relaciones duplicadas.
  - La proyección pública (`toMatchingPublic`) entrega `leftItems` y `rightOptions` desordenados mediante `scrambleRightOptions` sin revelar qué par corresponde a cuál ni exponer `explanation` o `hint`.
  - La evaluación (`evaluateMatching`) exige el 100 % de los pares correctamente enlazados para otorgar el puntaje (todo o nada en v1.2, o `omitted` si no se enlazó ningún par), y rechaza respuestas con relaciones repetidas (garantizando relación biunívoca 1 a 1) o conceptos/relaciones inexistentes.
- Se integró `matching` v1.2 en `src/lib/activityEngine.ts`, `src/App.tsx` y `src/index.css`:
  - `MatchingEditor` incluye campo de contexto opcional, pares, pista orientadora obligatoria (`hint`) y explicación privada (`explanation`), validados con `validateMatchingDefinition`.
  - `MatchingQuestion` permite tocar un concepto a la izquierda (`A`, `B`, `C`...) y tocar su relación a la derecha para enlazarlos con insignias del mismo color y letra (`.matching-badge.pair-tone-1`..`6`), además de un botón `×` para desenlazar cualquier par antes de confirmar.
  - En `PlayView`, `ResultsView` y exportación CSV (`exportCsv`) se muestran el contexto, la pista orientadora y la explicación docente de `matching`.
- Verificación ejecutada: `npm run test` aprobó **54/54 pruebas** (8 archivos de prueba) y `npm run build` (`tsc -b && vite build`) compiló sin errores.

### Etapa 4 · Contrato modular e integración de Clasificación (`sorting`) con banco desordenado y arrastrar/tocar · 2026-10-24

- Se creó el contrato modular independiente de Clasificación en `src/lib/activities/sorting.ts` con sus pruebas unitarias (`src/lib/activities/sorting.test.ts`, 9 pruebas) y de integración (`src/lib/activities/sortingIntegration.test.ts`, 3 pruebas):
  - Valida enunciado obligatorio (`prompt`), pista orientadora pública obligatoria (`hint`), contexto opcional (`context`), explicación privada opcional (`explanation`), entre 2 y 6 categorías únicas (`categories`) y entre 2 y 12 elementos únicos (`items`) distribuidos en **al menos dos categorías distintas** para garantizar clasificación real.
  - La proyección pública (`toSortingPublic`) entrega las categorías y los elementos desordenados mediante `scrambleSortingItems`, ocultando la categoría correcta de cada elemento, la pista y la explicación privada.
  - La evaluación (`evaluateSorting`) verifica que el 100 % de los elementos estén asignados a su categoría correcta para otorgar el puntaje (todo o nada en v1.2, o `omitted` si no se clasificó ningún elemento), conserva asignaciones parciales por tiempo agotado (`timeout`) y rechaza elementos o categorías inexistentes.
- Se integró `sorting` v1.2 en `src/lib/activityEngine.ts`, `src/App.tsx` y `src/index.css`:
  - `SortingEditor` incluye campo de contexto opcional, categorías con botón de eliminación seguro, elementos, pista orientadora obligatoria (`hint`) y explicación privada (`explanation`), validados con `validateSortingDefinition`.
  - `SortingQuestion` desordena automáticamente las tarjetas del banco superior y permite tanto **arrastrar y soltar (drag & drop)** en computadora como **tocar tarjeta y tocar contenedor de categoría** (además de botón `×` en cada elemento clasificado para devolverlo al banco y selector de apoyo en móvil).
  - En `PlayView`, `ResultsView` y exportación CSV (`exportCsv`) se muestran el contexto, la pista orientadora y la explicación docente de `sorting`.
- Verificación ejecutada: `npm run test` aprobó **66/66 pruebas** (10 archivos de prueba) y `npm run build` (`tsc -b && vite build`) compiló sin errores.

### Etapa 5 · Contrato modular e integración de Ordenamiento (`ordering`) con desorden garantizado y doble interacción · 2026-10-24

- Se resolvió el diagnóstico `F16` y `F17` donde el ordenamiento aleatorio previo podía entregar los pasos ya resueltos de forma casual. Se creó el contrato modular independiente en `src/lib/activities/ordering.ts` con sus pruebas unitarias (`src/lib/activities/ordering.test.ts`, 9 pruebas) y de integración (`src/lib/activities/orderingIntegration.test.ts`, 3 pruebas):
  - Valida enunciado obligatorio (`prompt`), pista orientadora pública obligatoria (`hint`), contexto opcional (`context`), explicación privada opcional (`explanation`) y entre 3 y 8 pasos únicos (`steps`) con texto no vacío ni marcadores vacíos.
  - La función determinista `scrambleOrderingSteps` garantiza que la secuencia inicial entregada al estudiante **nunca sea idéntica a la clave correcta**.
  - La proyección pública (`toOrderingPublic`) oculta la clave original, la pista y la explicación privada.
  - La evaluación (`evaluateOrdering`) verifica la secuencia exacta posición por posición para otorgar el puntaje (100% de coincidencias en v1.2 o 0 puntos si falla alguna posición), registra omisiones (`omitted`, 0 puntos, `correct: null`), conserva orden parcial en tiempo agotado (`timeout`) y rechaza secuencias con pasos repetidos o ajenos.
- Se integró `ordering` v1.2 en `src/lib/activityEngine.ts`, `src/App.tsx` y `src/index.css`:
  - `OrderingEditor` incluye campo de contexto opcional, pasos con botones de reordenamiento rápido (`↑` / `↓`), eliminación segura hasta el mínimo permitido, pista orientadora obligatoria (`hint`) y explicación privada (`explanation`), validados con `validateOrderingDefinition`.
  - `OrderingQuestion` inicializa la secuencia con desorden determinista garantizado y permite tanto **arrastrar y soltar filas (drag & drop)** como **reordenar con botones `↑` / `↓`** para máxima accesibilidad y fluidez en móvil (Android) y computadora.
  - En `PlayView`, `ResultsView` y exportación CSV (`exportCsv`) se muestran el contexto, la pista orientadora y la explicación docente de `ordering`.
- Verificación ejecutada: `npm run test` aprobó **78/78 pruebas** (12 archivos de prueba) y `npm run build` (`tsc -b && vite build`) compiló sin errores.

### Etapa 6 · Contrato modular e integración de Escenario de decisiones (`scenario`) y cierre de las 6 actividades v1.2 · 2026-10-24

- Se completó la actividad de mayor rigor formativo: **Escenario de decisiones (`scenario`)**, tomando como referencia pedagógica la app de decisiones compartida por el docente (`https://ecoliderazgo-movil.elmer-yale99-torrez.chatgpt.site`), adaptada para bachillerato en adelante sin requerir imágenes.
- Se creó el contrato modular independiente en `src/lib/activities/scenario.ts` con sus pruebas unitarias (`src/lib/activities/scenario.test.ts`, 8 pruebas) y de integración (`src/lib/activities/scenarioIntegration.test.ts`, 3 pruebas):
  - Define límites pedagógicos rigurosos en `SCENARIO_LIMITS` (de 1 a 4 etapas, de 2 a 4 opciones por etapa, situación contextual obligatoria y textos claros).
  - `validateScenarioDefinition`: valida que exista un planteamiento de dilema o situación (`situation`), etapas secuenciadas con consigna (`prompt`), opciones no vacías con consecuencia reflexiva (`consequence`) y orientación formativa (`feedback`), y **exactamente una opción recomendada por etapa** (`recommended: true`).
  - `toScenarioPublic`: proyecta la estructura pública segura eliminando los campos `recommended`, `consequence` y `feedback` antes del envío al estudiante, impidiendo que la clave se filtre.
  - `validateScenarioResponse` y `evaluateScenario`: evalúa las decisiones tomadas por etapa contra las opciones recomendadas, calcula puntaje formativo privado, conserva consecuencias reflexivas correspondientes a las elecciones del alumno para su retroalimentación y gestiona estados de omisión (`omitted`) y tiempo parcial (`timeout`).
  - `formatScenarioReport`: genera el desglose de decisiones, consecuencias y pistas para el informe de resultados del docente.
- Se integró `scenario` v1.2 en `src/lib/activityEngine.ts`, `src/App.tsx` y `src/index.css`:
  - `ScenarioEditor`: editor docente completo con adición y eliminación controlada de etapas y alternativas, marcación explícita de la alternativa recomendada, redacción de consecuencias reflexivas por decisión, pista orientadora general (`hint`) y justificación privada (`explanation`).
  - `ScenarioQuestion`: interfaz de evaluación inmersiva con recuadro destacado de dilema/situación (`📋 Contexto del dilema / Situación`), barra de progreso de etapas decididas, tarjetas de etapas numeradas y tarjetas de opciones táctiles que despliegan la consecuencia reflexiva de la decisión tomada (`⚡ Consecuencia de tu decisión:`).
  - En `PlayView`, `ResultsView` y exportación CSV (`exportCsv`) se incluyen las pistas, consecuencias y explicaciones de `scenario`.
- Verificación ejecutada: `npm run test` aprobó **89/89 pruebas** (14 archivos de prueba) y `npm run build` (`tsc -b && vite build`) compiló con éxito sin errores.
- **Hito v1.2 completado:** Las **seis actividades oficiales** de EduEval (`trueFalse`, `singleChoice`, `matching`, `sorting`, `ordering`, `scenario`) cuentan con sus contratos modulares independientes, pruebas unitarias y de integración, editores docentes específicos, vistas estudiantiles responsive con accesibilidad táctil/computadora y retroalimentación formativa sin ranking.

### Etapa 7 · Rediseño Warm Modernist, tipografía oficial y sistema de temas Día / Noche · 2026-10-24

- Con la aprobación expresa del docente, se realizó la modernización visual y ergonómica de la interfaz, dejando atrás el aspecto genérico y anticuado para adoptar un estilo de alta gama (*Warm Modernist / Soft UI*):
  - **Tipografía oficial:** Se integró la fuente Google Fonts `Plus Jakarta Sans` (pesos 400 a 800) en `index.html` con precarga (`preconnect`) y `font-display: swap`, sustituyendo las fuentes del sistema y la serif tradicional por una tipografía sans-serif geométrica de máxima legibilidad.
  - **Sistema de temas dual (Modo Día / Modo Noche):**
    - **Modo Día:** Diseñado para alta visibilidad contra el reflejo del sol en exteriores y aulas iluminadas, con fondo marfil luminoso (`#F7F9F8`), textos en verde petróleo profundo (`#14352F`) con ratio de contraste accesible > 10:1 (eliminando grises lavados ilegibles) y tarjetas blancas nítidas.
    - **Modo Noche:** Diseñado para estudio nocturno sin fatiga visual ni deslumbramiento, con fondo petróleo oscuro antirreflejo (`#0D1D21`) en lugar de negro puro `#000000` (evitando efecto halo en pantallas OLED/LCD), superficies suaves en `#152F36` y textos en blanco marfil no hiriente (`#E6F0EB`).
    - **Acento cálido:** Naranja/ámbar melocotón (`#F8A452`) como punto focal compartido para botones principales y estados activos.
  - **Botón conmutador ☀️ / 🌙 en esquina superior derecha:**
    - Se reemplazó el avatar estático e inerte ("EL" / "LM") en `topbar-actions` por un botón compacto de alternancia rápida de tema.
    - Se incorporó también en la esquina superior de la pantalla inicial de selección de rol (`RoleLanding`).
    - Guarda y recuerda automáticamente la elección del usuario en `localStorage` (`evaluedu-theme`).
  - **Geometría y componentes táctiles:**
    - Esquinas redondeadas amplias y amigables (`border-radius: 16px - 20px`) en tarjetas de las 6 actividades, paneles y métricas docentes.
    - Botones de acción en cápsula (*pill-buttons*, `border-radius: 9999px`) con micro-presión física bajo el dedo (`transform: scale(0.97)` en `@media (hover: none)`), eliminando el molesto *sticky hover* de celulares.
    - Tarjeta de dilema y contexto en verde petróleo profundo con títulos en acento ámbar.
  - **Afinación radical y modernización integral:**
    - **Erradicación de tipografía anticuada:** Se eliminaron las 25+ referencias a `'Playfair Display'` que quedaban en selectores específicos de títulos, unificando todo el sistema bajo `Plus Jakarta Sans` con peso 700/800 y tracking ajustado (`-0.02em`).
    - **Conjunto de iconos vectoriales SVG:** Se creó `src/lib/icons.tsx` con componentes SVG vectoriales limpios (reemplazando caracteres Unicode planos como `✦`, `⚙`, `⌂`, `✎`, `?` por `IconTeacher`, `IconStudent`, `IconAdmin`, `IconHome`, `IconContent`, `IconSun`, `IconMoon`, etc., así como los iconos específicos de las 6 actividades).
    - **Rectificación y rediseño profesional del Modo Noche:** Atendiendo la observación del docente sobre la pérdida de contraste y los colores estridentes/pantanosos del intento previo, se reescribió por completo la paleta nocturna adoptando un estándar de alta gama (estilo Linear/GitHub/Apple Dark):
      * Fondo carbón neutro profundo (`#0A0D0F`) y superficies de tarjeta en `#12161A` con bordes ultra-finos `#1E262C`, eliminando el tinte verdoso sucio y los parches de color extraños en métricas.
      * Jerarquía de texto limpia y natural: títulos y encabezados en blanco nítido (`#F8FAFC`), consignas en `#CBD5E1`, y textos secundarios (`small`, metadatos, subtítulos, pies de tarjeta) en gris slate claro (`#94A3B8`) con ratio de contraste accesible > 8:1 sin forzar tonos verde agua artificiales.
      * Opciones de evaluación en Modo Noche con fondo `#151A1F`, borde `#232B32`, y al seleccionarse un resalte sutil en ámbar cálido con texto blanco puro.
    - **Transformación profunda del Modo Día:** Isotipo de marca moderno con esquinas suaves (12px/14px), tarjetas de rol con círculos pastel de alta gama, barra superior con sombra flotante suave y botones píldora consistentes.
    - **Eliminación definitiva de fondos blancos en Modo Noche (KPIs y Hover de tablas):** Atendiendo la captura y reporte específico del docente donde las tarjetas de resumen y las filas de la tabla quedaban con fondo blanco ilegible en Modo Noche:
      * Se neutralizaron los fondos blancos forzados en `.results-summary`, sustituyéndolos por carbón elevado `#12161A` con bordes `#1E262C` y dando máxima vitalidad y diferenciación a los cuatro indicadores KPI: Respuestas registradas en azul cielo vibrante (`#38BDF8`), Aciertos en verde esmeralda luminoso (`#34D399`), Intentos en ámbar cálido brillante (`#FBBF24`) y Puntaje acumulado en lila orquídea (`#C084FC`), con etiquetas descriptivas en gris slate neutro legible (`#94A3B8`).
      * En la tabla de resultados (`.results-panel` y `.result-detail`), se eliminó el fondo claro `#F3F9F3` en hover y filas seleccionadas, reemplazándolo por un carbón secundario distinguible (`#1A232B`), con nombres de estudiantes en blanco puro (`#FFFFFF`), códigos en ámbar cálido (`#F8A452`), badges de estado en verde bosque nocturno (`#12281E`) y botón "Ver detalle" en ámbar luminoso.
      * Se auditaron y adaptaron todas las interacciones de hover en tarjetas de actividad, listas, filtros de sala, menús desplegables y modales para garantizar que ningún elemento interactivo despliegue fondos claros al pasar el cursor en Modo Noche.
    - **Ajuste ergonómico de títulos e higienización de la Pantalla de Contenido en Modo Noche:**
      * **Eliminación de la redirección al inicio desde títulos de pantalla:** Se removió la interactividad de enlace (`onHome`) en el componente `PageIntro` de todas las pantallas (Contenido, Propuestas, Salas, Resultados y paneles administrativos). Los títulos quedan como encabezados informativos estáticos normales sin `role="button"`, sin eventos de clic y sin `cursor: pointer`, reservando la navegación exclusivamente para la barra lateral y los controles destinados a tal fin.
      * **Corrección de fondos blancos en la Pantalla de Contenido (`ContentView`):** Se neutralizaron los fondos menta y grises claros de las tarjetas de compatibilidad (`.compatibility-item` y `.compatibility-item.unavailable`), pasando a carbón secundario `#151A1F` con textos legibles en blanco y slate. Los chips de estadísticas (`.template-stats span`), las notas (`.generated-note`), el contador de pestañas (`.tabs span`) y los iconos de tipo (`.list-type.type-*`) ahora usan fondos oscuros y tonos vibrantes acordes al Modo Noche.
      * **Modales de contenido:** Se adaptaron los constructores y vistas previas de plantilla (`TemplateBuilder`, `TemplatePreview` y `TemplateActivityPicker`), asegurando que bloques repetibles, barras de progreso y tarjetas de selección utilicen la paleta oscura de alto contraste.
    - **Publicación oficial en GitHub y despliegue automatizado con GitHub Pages:**
      * Se vinculó el repositorio remoto `https://github.com/elmeryale99torrez-prog/EduEval.git` y se subió el código fuente completo en la rama `main`.
      * Se configuró el flujo de integración continua `.github/workflows/deploy.yml` con GitHub Actions para compilar y desplegar automáticamente en cada push.
      * Se adaptó `vite.config.ts` (`base: './'`), `public/manifest.webmanifest` (`id`, `start_url`, `scope` e iconos con rutas relativas `./`), `src/main.tsx` (`swUrl` relativo con `BASE_URL`) y `public/sw.js` (`self.registration.scope`), resolviendo la limitación de subdirectorio para habilitar la instalación como PWA en Android, iOS y computadora desde la URL pública oficial `https://elmeryale99torrez-prog.github.io/EduEval/`.
### Etapa 8 · Erradicación de zoom móvil, preparación PWA y transición visual · 2026-10-25

- **Bloqueo de zoom involuntario en móviles (*pinch-to-zoom* / doble toque):**
  - Se actualizó el `<meta name="viewport">` en `index.html` a `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
  - En `src/index.css`, se asignó `touch-action: pan-x pan-y; -webkit-text-size-adjust: 100%;` a `html, body` y `touch-action: manipulation;` a todos los botones, enlaces, tarjetas y campos de entrada. Esto impide que los gestos de pellizco o toques rápidos amplíen o encojan accidentalmente la pantalla, garantizando un comportamiento 100% fijo y compacto de aplicación nativa.
- **Corrección de enlaces del Manifest e Iconos para instalación PWA en GitHub Pages:**
  - Se sustituyeron las rutas absolutas `/manifest.webmanifest` y `/icon.svg` por rutas relativas `./manifest.webmanifest` y `./icon.svg` en `index.html`, permitiendo que el navegador en Android e iOS descargue correctamente el manifiesto e iconos dentro de la subruta `/EduEval/` para mostrar el botón de "Instalar / Descargar aplicación".
- **Análisis de referencia visual (Pinterest - 60fps.design):**
  - Se inspeccionó y analizó el contenido del enlace `https://es.pinterest.com/pin/1110770695648844785/`: corresponde al prototipo *"Trendy Splash Screen Transition: Onboarding Mascot Animation"* de *60fps.design*, una transición fluida desde una pantalla de bienvenida naranja hacia una cabecera con mascota e ingreso escalonado de opciones.
- **Adopción de la nueva Mascota e Icono oficial ("Chispa Curiosa"):**
  - Con la aprobación del usuario del **Concepto A**, se creó la ilustración vectorial SVG de la Chispa Curiosa (llama ámbar/naranja con ojos expresivos y mejillas sonrosadas sobre fondo esmeralda profundo).
  - Se actualizaron `public/icon.svg` y `public/icon-maskable.svg` para la PWA e instalación en dispositivos móviles.
  - Se creó el componente `<IconSparkMascot />` en `src/lib/icons.tsx` y se integró como imagotipo oficial en la cabecera superior y la pantalla de inicio.
- **Implementación de la Pantalla de Bienvenida y Transición (*Splash Screen Transition*):**
  - Se integró la secuencia de onboarding interactiva en `RoleLanding` (`src/App.tsx`) y `src/index.css`:
    * Estado de bienvenida inmersiva con halo cálido pulsante y flotación de la mascota.
    * Transición fluida (*morphing*) que eleva el icono hacia el encabezado de marca tras 1.5s o al tocar la pantalla.
    * Aparición escalonada (*staggered fade-in*) de las tarjetas de perfil (Docente, Estudiante, Administrador).
    * Control de sesión (`edueval-splash-seen`) para no interrumpir al usuario en navegación repetida, con opción de revivir la animación tocando el logo de marca.
- **Corrección integral del Icono PWA (Mascota Chispa) e invalidación de caché móvil:**
  - Se identificó la causa de que los celulares mostraran el icono antiguo: Android Chrome no acepta formato SVG para los accesos directos de pantalla de inicio y requiere iconos PNG específicos (`192x192` y `512x512`), además de que el Service Worker local mantenía en caché la versión antigua `edueval-shell-v4`.
  - Se generaron los archivos PNG oficiales de alta resolución: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` y `public/apple-touch-icon.png`.
  - Se actualizó `public/manifest.webmanifest` incorporando los iconos PNG y SVG con sus resoluciones exactas.
  - Se actualizó `public/sw.js` elevando la versión a `edueval-shell-v6`, implementando eliminación inmediata de cachés anteriores (`caches.delete`) en el evento `activate`, activación inmediata (`skipWaiting()`, `clients.claim()`) y estrategia de red prioritaria para recursos de identidad (iconos y manifiesto).
  - En `index.html` se agregaron parámetros de versión (`?v=6`) para forzar la recarga inmediata del favicon y el icono en navegadores móviles.
- **Resolución definitiva de escala móvil y erradicación de interfaz diminuta / congelada:**
  - Se diagnosticó por qué la app se percibía "muy pequeña y congelada":
    * La directiva previa `user-scalable=no, maximum-scale=1.0` impedía ampliar la pantalla cuando los elementos antiguos tenían tamaños de 9px a 11px.
    * La ausencia de contención de desbordamiento horizontal (`overflow-x: hidden`) provocaba que en ciertos anchos el navegador redujera la escala global para ajustar elementos anchos.
  - Se reconfiguró el viewport a escala natural `width=device-width, initial-scale=1.0, viewport-fit=cover`.
  - Se implementó un sistema de diseño responsive móvil ergonómico en `src/index.css`:
    * Contención horizontal estricta con `width: 100%; max-width: 100vw; overflow-x: hidden;` en `html`, `body` y contenedores principales.
    * Elevación de tipografía base en móviles: textos de cuerpo a 15px/16px, entradas de formulario a 16px (evitando zoom forzado del sistema), y etiquetas secundarias a 12px/13px legibles (eliminando textos diminutos de 9px).
    * Altura táctil ergonómica mínima de 48px a 52px en botones, tarjetas de rol (`RoleCard`), opciones de respuesta (`answer-option`) y campos de entrada para interacción cómoda con el pulgar.
- **Pendientes inmediatos:**
  - **Fase 4: Importación JSON y generador estructurado:** Actualizar `src/lib/contentImport.ts` y `buildActivitiesFromTemplate` en `src/App.tsx` para que las propuestas nazcan con el objeto `details` v1.2 de las 6 actividades y validación pedagógica estricta de compatibilidad.
- Verificación ejecutada: `npm run test` aprobó **89/89 pruebas** (14 suites intactas) y `npm run build` (`tsc -b && vite build`) compiló con éxito sin errores.


### Etapa 9 — Escala móvil ampliada (+15%), optimización vertical de tarjetas métricas y depuración de textos superfluos — 2026-10-25

- **Aumento de escala móvil del 15% sobre la versión antigua:**
  - Implementación en `index.html` del escalado dinámico de Viewport para dispositivos móviles (`screen.width < 600px`: factor de escala `1.15`, ancho virtual `Math.round(screen.width / 1.15)` con `initial-scale=1.15`), logrando que tipografías, botones táctiles, tarjetas y márgenes crezcan de forma exacta y proporcional un 15% más que en la versión previa sin romper la cuadrícula ni generar barras de desplazamiento horizontales.
- **Corrección definitiva del encogimiento en celulares (causa raíz):**
  - Se identificó que la regla `.role-cards { display: grid !important; grid-template-columns: repeat(3, 230px) !important; gap: 16px !important; }` forzaba un ancho de 762 px en todo el documento. Se restringió a `@media (min-width: 721px)`.
  - En pantallas móviles (`max-width: 720px`), `.role-cards` utiliza una sola columna fluida centrada (`width: min(360px, 100%)`), y la pantalla de bienvenida cuenta con `padding-top: 76px` para que el botón de instalación y cambio de tema permanezcan en la esquina superior sin solaparse con el logotipo de la Chispa.
- **Optimización de espacio en tarjetas métricas (`Metric`):**
  - Se rediseñó el componente `Metric` en `src/App.tsx` y `src/index.css` incorporando el contenedor `.metric-card-top`.
  - El icono y la cifra numérica ahora se ubican juntos en la fila superior (icono a la izquierda y número en negrita a la derecha), reduciendo la altura vertical de cada tarjeta de 123 px a 80 px (un ahorro de más de 40 px de altura). Esto permite que el contenido inferior ("Actividad reciente" y "Sugerencia de hoy") gane protagonismo inmediato en pantallas móviles sin requerir desplazamiento.
- **Depuración de textos superfluos e instrucciones innecesarias:**
  - En la entrada de estudiantes (`StudentView`): se eliminó el texto redundante *"No necesitas crear una cuenta."* y se simplificó la indicación inferior a *"La evaluación comenzará cuando tu docente dé inicio a la sala."*
  - En el acceso de usuarios (`AuthScreen`): se eliminaron referencias informales a *"acceso piloto"* y jerga técnica (*"Nunca se usa la clave service_role"*), simplificando a *"Cuenta de {roleLabel}. Ingresa tus credenciales para continuar."*
  - En la administración de usuarios (`AdminUsersView`): se unificó la terminología sustituyendo *"Acceso piloto"* por *"Contraseña directa"*.
  - En `AuthScreen` y `ProfileSetupScreen`: se reemplazó la letra *"E"* antigua por el imagotipo oficial de la Chispa Curiosa (`<IconSparkMascot />`).
- **Actualización de caché y PWA:**
  - Se incrementó la versión del Service Worker a `edueval-shell-v7` en `public/sw.js` y se actualizaron los parámetros `?v=7` en `index.html`.
- **Verificación:**
  - `npm run test` completó **89/89 pruebas aprobadas**.
  - `npm run build` compiló satisfactoriamente sin errores.


### Etapa 10 a 17 — Evolución v1.2: Motor de actividades, validación JSON v2, Torre de Control, resultados por sala y estabilización PWA — 2026-10-26

- **Definición definitiva de marca:**
  - El proyecto adopta oficialmente el nombre **EvaluEdu** de forma completa y consistente.
  - Se actualizaron los textos de la interfaz, el modal de importación guiada, el prompt oficial docente y la denominación de los archivos de exportación a `evaluedu-resultados-[codigo].csv`.
- **Motor de actividades v1.2 y validador de contenido:**
  - Se implementó la validación estricta v2 (`parseContentImport`) para los 6 formatos evaluables (`trueFalse`, `singleChoice`, `matching`, `sorting`, `ordering`, `scenario`) con generación automática de objetos `details` compatibles.
  - Pistas pedagógicas (`hint`) obligatorias en todas las actividades para guiar al estudiante sin revelar la respuesta correcta.
  - Explicaciones formativas opcionales para consulta privada docente.
- **Rediseño de Pantalla de Inicio (`Overview`):**
  - Botón de acción semántico `[＋ Nuevo contenido]`.
  - Métrica de pulso consolidada (contenidos preparados, salas activas, evaluaciones registradas).
  - Actividad viva con las últimas 3 salas y acceso contextual.
  - Consejo del día animado con la Chispa Curiosa, con rotación aleatoria por sesión (`sessionStorage`) y diseño cálido sin controles distractores.
  - Catálogo pedagógico completo: 6 formatos activos v1.2 (con modal de descripción pedagógica sobre habilidades y vivencia del estudiante) y 5 formatos proyectados v1.3 en tarjetas oscuras con badge `Próximamente`.
- **Rediseño de Resultados y Contenido:**
  - Agrupación por salas con tarjetas métricas independientes.
  - Navegación multinivel con buscador de estudiantes en tiempo real y exportación directa por sala a Excel/CSV.
  - Prevención de selección accidental de texto a nivel global (`user-select: none`).
- **Estabilización de sesión y eliminación de recargas involuntarias:**
  - Erradicación de la condición de carrera en eventos de sesión de Supabase que desmontaba la interfaz en segundo plano.
  - Eliminación del contador de pendientes y botón de sincronización confuso en el banner superior, sustituido por una píldora sobria (`En línea`, `Modo local` o `Sin conexión`).
  - Blindaje de la cola offline con descarte seguro tras reintentos fallidos.
- **Preparación y actualización de la PWA v1.2:**
  - Versión del Service Worker actualizada a `evaluedu-shell-v9` en `public/sw.js` y bus de caché a `?v=9` en `index.html`.
  - Los dispositivos móviles y navegadores que tienen la app instalada o en caché se actualizarán automáticamente en segundo plano a la versión v1.2 al conectarse a internet.
- **Verificación:**
  - `npm run test`: **91/91 pruebas unitarias aprobadas (14 suites en verde)**.
  - `npm run build`: compilación de producción con Vite (`tsc -b && vite build`) limpia y exitosa (código 0).
