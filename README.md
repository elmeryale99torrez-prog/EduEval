# EduEval MVP

PWA responsive para crear, revisar y ejecutar actividades de evaluación activa.

## Arranque

```powershell
npm install
npm run dev
```

## Publicación actual

La primera versión PWA está publicada en [evaluedu.chatgpt.site](https://evaluedu.elmer-yale99-torrez.chatgpt.site). El sitio es público para que los estudiantes puedan abrirlo mediante el enlace; el acceso a los paneles docente y administrativo continúa protegido por Supabase Auth y la verificación del rol en `profiles`.

**Separación vigente de versiones, confirmada por el usuario el 22/10/2026:** la publicación v13 es la referencia pública esperada. La importación JSON es una prueba de desarrollo local; su ausencia en v13 no es un defecto. Las mejoras se preparan y prueban primero en esta carpeta y se publicarán en una etapa posterior autorizada. Las capacidades descritas a continuación incluyen desarrollo local y no deben leerse como una certificación de la publicación.

El MVP mantiene un respaldo local, pero ya puede conectarse a Supabase para sesión, perfiles, plantillas, actividades, salas e intentos del propietario. Para preparar el entorno, copia `.env.example` como `.env.local` y completa las variables públicas del proyecto. El ingreso estudiantil temporal usa código de sala y un token de invitado de corta duración mediante la Edge Function `student-room-guest`; no requiere crear cuentas Supabase.

Cuando existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (o la clave heredada `VITE_SUPABASE_ANON_KEY`), la aplicación activa la pantalla de acceso para docente y administrador y conserva la sesión con Supabase Auth. El estudiante continúa entrando con código de sala. El rol de docente o administrador se verifica contra `profiles` antes de habilitar el panel; elegir un icono nunca concede permisos. El proyecto Supabase de desarrollo ya fue creado en `sa-east-1`; sus credenciales locales viven en `.env.local`, que no se versiona.

## Flujo vigente del contenido

El flujo principal de la primera versión es:

```text
Contenido del docente → IA externa con el prompt oficial → JSON `edueval.content` v1
→ archivo JSON o pegado en la app → validación estricta
→ plantilla interna → actividades compatibles en estado pendiente
→ revisión y aprobación docente → selección para una sala
```

La IA externa solo ayuda al docente a convertir su contenido en el formato estructurado. EduEval no genera contenido con IA ni envía el contenido importado a servicios externos. La autoridad final es el esquema y el validador local de EduEval.

La aplicación acepta el contrato JSON definido por el proyecto mediante archivo o pegado. No interpreta automáticamente documentos Word, PDF o texto libre. El PDF disponible en el constructor sirve como respaldo exportable. El formulario manual puede mantenerse como vía alternativa mientras el flujo JSON se consolida.

## Criterio de preparación pedagógica

Un contenido expositivo y un material preparado para evaluación no son equivalentes. Por ejemplo, un JSON puede incluir título, descripción y conceptos válidos, pero no tener todavía situaciones, pasos ordenados, afirmaciones verificables o relaciones de clasificación. La importación debe conservar lo que el docente proporcionó, informar lo que falta y limitar las propuestas sin fabricar información.

La validación se interpreta en tres niveles:

1. **Contrato:** JSON parseable, versión correcta, tipos, límites y propiedades permitidas.
2. **Preparación pedagógica:** objetivo, competencia, criterios y contexto suficientes para orientar una evaluación. Son datos valiosos; su ausencia debe advertirse, pero no invalida automáticamente todo el contenido.
3. **Compatibilidad:** evidencia específica para construir y corregir cada actividad. Solo esta evidencia habilita el tipo correspondiente.

La aceptación del archivo no significa que todas las actividades estén disponibles. Las propuestas compatibles permanecen pendientes de revisión docente y el validador sigue siendo la autoridad final.

## Auditoría preliminar de las seis actividades

Antes de corregir el prompt se debe fijar qué necesita realmente cada formato:

| Actividad | Evidencia mínima confiable |
| --- | --- |
| Escenario de decisiones | contexto, decisión, alternativas reales y consecuencia o feedback asociado a cada alternativa |
| Falso/verdadero | afirmación verificable, valor esperado y explicación o evidencia de por qué |
| Asociación | al menos dos pares inequívocos entre elementos y relaciones/definiciones |
| Clasificación | al menos dos categorías y relación explícita elemento → categoría |
| Ordenamiento | pasos distintos de un proceso y orden correcto explícito |
| Selección única | pregunta, opciones plausibles y exactamente una opción respaldada por el contenido |

Riesgos identificados que deben revisarse en el código antes de cerrar la skill:

- La detección de clasificación puede habilitarse por la mera coexistencia de categorías y conceptos, aunque no exista relación elemento → categoría.
- El generador de escenarios puede inventar alternativas genéricas en lugar de usar decisiones y consecuencias proporcionadas por el docente.
- El generador de falso/verdadero puede marcar siempre como verdadera la primera definición y no producir una afirmación falsa sustentable.
- El generador de selección única puede usar nombres de conceptos como opciones y elegir la primera por posición, sin construir una pregunta ni justificar una única respuesta.
- El generador debe aprovechar `details` y las relaciones explícitas de la plantilla; no basta con copiar listas superficiales.
- Debe compararse el comportamiento del editor, el motor, la vista del estudiante, el puntaje, el feedback y la persistencia, porque una actividad puede verse correcta y fallar al corregirse o guardarse.

La siguiente fase documental es la matriz de requisitos de las seis actividades. Después se corregirán en secuencia el modelo, el generador/motor, la compatibilidad, el validador y finalmente la skill oficial de conversión.

## Alcance implementado

- Roles simulados de administrador, docente y estudiante.
- Menú lateral docente con biblioteca, propuestas, salas y resultados.
- Constructor inicial de plantillas pedagógicas con conceptos, situaciones, procesos, categorías y compatibilidad en tiempo real.
- Editores específicos para los seis formatos, conectados a la plantilla aceptada y con validación propia por tipo.
- Seis tipos iniciales, con clasificación y ordenamiento mediante arrastrar y soltar.
- Importación de contenido JSON versionado con validación estricta, errores por ruta y cálculo automático de compatibilidad.
- Las actividades derivadas de una importación quedan pendientes de revisión docente; solo las aprobadas pueden seleccionarse para una sala.
- `Nueva actividad` exige elegir una plantilla aceptada y solo muestra los tipos compatibles con su contenido.
- Salas con hasta tres actividades, código de ingreso, estado, límite de estudiantes y selector de tiempo opcional.
- Configurador docente de evaluación con nombre, instrucciones, límite de estudiantes, cantidad de preguntas, puntaje por pregunta, tiempo total, mezcla, navegación y selección del banco de actividades.
- Ciclo local de sala: lista para iniciar, abierta/en espera, en curso, finalizada, archivada y duplicación con código nuevo.
- Salas conectadas a Supabase para docentes autenticados: configuración, código, estados y relación ordenada con actividades mediante `room_activities`; si falta una actividad cloud, conserva la sala local como respaldo.
- Ingreso estudiantil validado por código: el estudiante queda esperando hasta que el docente inicia la sala.
- Flujo estudiantil demo: espera de sala, inicio cuando el docente la activa, navegación anterior/siguiente, omisión de preguntas, mezcla opcional, retroalimentación inmediata y cierre del intento.
- Control de un intento por sala y pantalla final sin mostrar el resultado al estudiante; los intentos cloud son la fuente principal y la copia local se conserva como respaldo temporal.
- Participantes e intentos cloud se leen para el propietario con RLS, incluyendo respuestas, puntajes y eventos de navegación; el esquema de intentos conserva `events` en JSONB.
- Ingreso remoto estudiantil: valida código y nombre en `student-room-guest`, guarda únicamente el hash de un token temporal, devuelve solo la estructura segura y recalcula las respuestas en servidor antes de guardar el intento.
- Panel docente de resultados demo: filtros por sala, resumen de participación/aciertos/puntaje, detalle por estudiante y actividad, omisiones, tiempos, eventos y exportación CSV por actividad para Excel.
- Panel administrador separado: resumen global, directorio de usuarios/permisos, salas globales y auditoría local. La invitación real de docentes ya usa una Edge Function protegida; el listado completo, suspensión y permisos avanzados siguen pendientes.
- Primera capa de Supabase preparada: cliente browser con sesión persistente, auto-refresh y pantalla de inicio/registro para docente y administrador; no contiene claves secretas.
- Perfiles y roles conectados: el primer ingreso docente crea un perfil limitado a `teacher`; el panel administrativo requiere un perfil `admin` existente en Supabase y no se habilita por selección visual.
- Verificación de roles: se valida que el perfil pertenezca al usuario autenticado, que el rol sea válido y que coincida con el panel elegido; si la consulta falla, ningún panel protegido se habilita.
- Protección de paneles: las vistas permitidas se limitan por rol, una ruta interna incompatible vuelve al resumen y las operaciones administrativas vuelven a comprobar el rol antes de invocar la función protegida.
- Plantillas y actividades conectadas: el contenido propio se carga y guarda en Supabase con RLS; si la red o el backend no están disponibles, la interfaz conserva la copia local temporal.
- El registro público fue retirado de la interfaz para evitar que estudiantes creen cuentas de docente; el alta deberá hacerse mediante invitación o administración.
- El panel administrativo incluye `Agregar usuario`: solicita nombre y correo, valida que quien llama sea administrador y envía una invitación de Supabase con perfil `teacher`. No se envían contraseñas permanentes.
- Motor de ejecución estructurada demo: escenario por etapas, verdadero/falso, asociación por pares, clasificación con categorías configuradas, ordenamiento con flechas y selección única; todos conservan respuestas tipadas para calificación.
- Motor de respuestas extraído a `src/lib/activityEngine.ts`: normalización de actividades antiguas, validación, comparación, serialización y evaluación uniforme de respuestas.
- Pruebas automatizadas con Vitest para los seis formatos y los estados omitida, correcta e incorrecta.
- Editor de escenario con etapas, opciones, consecuencias, feedback y opción recomendada.
- Editor de falso/verdadero con afirmación, respuesta esperada y explicación.
- Editores de asociación, clasificación, ordenamiento y selección única con estructuras repetibles y validación antes de publicar.
- Constructor de plantillas con progreso por criterios, recuperación de borrador local, vista previa y opción de imprimir/guardar el respaldo como PDF.
- Retroalimentación inmediata sin mostrar la respuesta correcta.
- Resultados privados de docente y descarga CSV compatible con Excel; los registros se leen desde Supabase con respaldo local y reconciliación para evitar duplicados.
- PWA instalable con manifest completo, iconos adaptables, service worker y caché segura de la interfaz; los datos privados de Supabase no se almacenan en la caché.
- Realtime conectado a `rooms`: el panel docente escucha cambios de sus salas; el estudiante con token temporal consulta el estado cada 2,5 segundos sin exponer lecturas públicas de la tabla.
- El cronómetro estudiantil se calcula desde `started_at` del servidor, por lo que una recarga o reconexión no reinicia el tiempo disponible.
- La persistencia usa una cola local de sincronización: si una escritura cloud falla o no hay conexión, el cambio queda en `localStorage`, se muestra como pendiente y se reintenta al recuperar la conexión. Las operaciones de plantillas, actividades, salas, estados e intentos son idempotentes durante el reintento.
- En producción se registra `/sw.js`, que permite abrir la carcasa de EvaluEdu sin conexión después de la primera visita; la instalación depende de servir la aplicación mediante HTTPS o `localhost`.
- La preparación de despliegue, variables y verificación móvil está documentada en [docs/PUBLICACION_PWA.md](docs/PUBLICACION_PWA.md); el contenido listo para publicar queda en `dist/`.

## Bitácora maestra y decisiones cerradas

Las decisiones funcionales detalladas se conservan en `BITACORA.md`. Actualmente están cerradas para la primera versión: flujo en línea con Supabase, roles de administrador/docente/estudiante, importación mediante JSON validado, revisión docente de actividades pendientes, seis formatos iniciales, máximo de tres tipos por sala, tiempo general opcional, retroalimentación sin revelar directamente la respuesta correcta, resultados privados y exportación detallada para el docente. Las funciones adicionales deben respetar estas decisiones o registrarse como una nueva decisión antes de implementarse.

## Verificación técnica

```powershell
npm run test
npm run build
```

Las pruebas cubren el motor puro de actividades y la verificación se apoya en Supabase Auth + `profiles`; salas, participantes e intentos tienen persistencia cloud con respaldo local. Realtime está activo para el panel docente y el acceso estudiantil usa tokens temporales; la persistencia local continúa como respaldo temporal.

### Avance de esta etapa

- Se añadió una pantalla inicial de selección por iconos para Docente, Estudiante y Administrador.
- Se adoptó **EvaluEdu** como identidad provisional visible en la aplicación, el título del navegador y el manifest PWA.
- Se verificó TypeScript y el build de producción después del cambio.
- Se añadió el modelo persistente de `EvaluationTemplate` en `localStorage`.
- Se añadió el constructor de plantilla con borrador, aceptación, campos esenciales y bloques repetibles de conceptos y situaciones.
- Se añadió una vista de compatibilidad que explica qué formatos están disponibles y qué información falta en los demás.
- Se dejó explícito que el contenido importado se valida, calcula su compatibilidad y deja las actividades pendientes de revisión docente antes de usarlas.
- Se conectó `Nueva actividad` con la plantilla: el selector de tipo recibe el contenido fuente y el editor prellena tema, objetivo y elementos compatibles.
- Verificación completada: TypeScript sin errores y build Vite de producción exitoso.

### Flujo administrativo y verificación de cuenta

- Se desplegó la Edge Function `admin-invite-teacher` con `verify_jwt = true`.
- La función verifica la sesión y el rol `admin` en `profiles` antes de usar el cliente privilegiado del servidor.
- El administrador puede invitar docentes desde Usuarios y permisos; el perfil se crea con rol `teacher` y el enlace de acceso se envía al correo indicado.
- `service_role` solo existe en el entorno de la función y nunca en el navegador.
- La cuenta administradora se asocia manualmente a un correo exacto de Auth; no se habilita Admin solo por seleccionar el icono.
- Falta desactivar `Allow new users to sign up` en Authentication > Providers para cerrar también el endpoint público de registro.
- El aviso “¿Aún no tienes acceso?” es informativo; no es un enlace ni envía correos. La invitación se inicia desde el panel administrativo.
- La cuenta inicial `elmeryaletorrez@gmail.com` ya está vinculada como `admin` en `profiles`.
- La protección de Supabase contra contraseñas filtradas permanece desactivada porque el proyecto actual no tiene un plan Pro o superior; no es un fallo de EvaluEdu ni bloquea el acceso.
- El registro público de usuarios quedó desactivado en Supabase; los docentes deben ser invitados desde el panel administrativo.

Este proyecto es independiente de `APP DE JUEGO` y de Ecoliderazgo. No modificar esos proyectos para resolver tareas de EduEval.

### Identidad y acceso

- Nombre provisional: **EvaluEdu**.
- La pantalla inicial debe permitir elegir mediante iconos grandes: Administrador, Docente y Estudiante.
- El docente será un usuario autorizado con autenticación real cuando Supabase esté configurado.
- El estudiante ingresará mediante código de sala, nombre y los datos mínimos necesarios.
- Cada estudiante tendrá un solo intento por sala.

### Plantilla de contenido

La plantilla no selecciona actividades. Contiene contenido pedagógico estructurado y reutilizable. Debe admitir bloques repetibles para:

- Datos de materia, título, descripción y objetivo.
- Competencia o desempeño esperado.
- Conceptos, definiciones, características, autores y teorías.
- Ejemplos, situaciones, casos y contextos.
- Relaciones entre conceptos.
- Categorías y elementos.
- Procesos y pasos.
- Decisiones y consecuencias.
- Comparaciones y errores frecuentes.
- Criterios de aprendizaje y retroalimentación.
- Nivel de dificultad.

El formulario manual debe tener campos obligatorios, validación, indicador de progreso, guardado automático de borradores, vista previa, aceptación final y descarga de PDF de respaldo. La importación principal se realiza mediante JSON estructurado; no se aceptan documentos arbitrarios como fuente automática.

La aplicación analizará el contenido validado, calculará las actividades compatibles y dejará las propuestas pendientes de revisión docente. Las no compatibles aparecerán deshabilitadas, en tono oscuro, explicando qué información falta.

### Actividades iniciales

1. Escenario de decisiones con consecuencias diferentes por opción y etapas lineales.
2. Falso/verdadero con afirmación, respuesta esperada, explicación, feedback y puntaje.
3. Asociación de ideas con pares y relaciones correctas.
4. Clasificación con categorías, elementos y arrastrar y soltar.
5. Ordenamiento con pasos libres, orden correcto y arrastrar y soltar.
6. Selección múltiple con varias opciones y una sola respuesta correcta.

Cada actividad tendrá su propio editor, esquema y validación. No se debe usar un formulario genérico para todas.

### Generación y revisión de actividades

El JSON válido se convierte en una plantilla interna y permite calcular las actividades compatibles. Las actividades derivadas quedan en estado pendiente para que el docente revise y apruebe cada propuesta antes de poder usarlas en una sala. La creación manual de una actividad adicional permanece disponible. La IA externa no genera actividades para publicar en EduEval; solo prepara el contenido estructurado.

```text
Contenido estructurado → validación JSON → compatibilidad → revisión docente → aprobación → sala
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

### Próximos focos (Orden de Fases vigente)

Actualmente las **Fases 1 a 4 de la etapa v1.2** (contratos modulares de las 6 actividades, motor central, validador JSON v2, rediseño Día/Noche, creador de salas e impresión en tamaño Carta de Examen en Blanco y Comprobante del Estudiante) están **100 % completadas**. El desarrollo se encuentra situado al inicio de la **Fase 5**:

1. **📍 Fase 5 v1.2 (Fase actual — Nivelación de Servidor Supabase y Concurrencia):**
   - Actualizar las Edge Functions [`student-room-guest`](supabase/functions/student-room-guest/index.ts) y [`student-room-sync`](supabase/functions/student-room-sync/index.ts) al motor v1.2: retirar `privateActivities` de la respuesta de `join`, validar en servidor que la sala siga `active` y dentro del tiempo antes de aceptar entregas, y calificar con los 6 contratos v1.2.
   - Implementar guardado transaccional atómico ("todo o nada") e idempotente para `attempts` y `attempt_answers`.
   - Incorporar límite de peticiones (*Rate Limiting*) en el ingreso público por código de sala e índice compuesto en `attempt_answers`.
   - Ejecutar pruebas de extremo a extremo y de concurrencia (40–50 estudiantes simultáneos en una sala).
2. **Fase 6 (Panel Administrativo y Auditoría Inmutable):**
   - Registrar eventos administrativos en `audit_events` asegurando su inmutabilidad mediante políticas RLS (prohibir `DELETE` y `UPDATE`).
   - Completar la gestión administrativa real de usuarios, permisos y suspensión/reactivación.
   - Configurar definitivamente `Site URL` y Redirect URLs en Supabase Auth y verificar descargas CSV/PDF en dispositivos Android físicos.
3. **Fase 7 (Expansión v1.3+ a 21 Actividades y Alistamiento Pre-Comercial):**
   - Incorporar progresivamente los 15 formatos futuros definidos en [docs/PROPUESTA_CATALOGO_21_ACTIVIDADES.md](docs/PROPUESTA_CATALOGO_21_ACTIVIDADES.md) manteniendo sincronizados el contrato JSON, el validador y la interfaz.
   - Alistamiento comercial: Política de Privacidad estudiantil, Términos de Servicio, política de retención de datos y verificación de copias de seguridad (*Backups*).

El formulario manual se conserva como alternativa de respaldo; el flujo JSON validado es el camino principal para preparar contenido nuevo.

## Espacio de trabajo v1.2

Este directorio es la copia de trabajo separada para la auditoría y evolución de las seis actividades actuales. La matriz de requisitos está en [docs/MATRIZ_ACTIVIDADES_V12.md](docs/MATRIZ_ACTIVIDADES_V12.md). Primero se revisará el contrato y el comportamiento integral de las actividades; después el motor, la compatibilidad, el validador y finalmente la skill de conversión. Esta carpeta no se publica automáticamente.

### Base de análisis comparativo · 2026-10-22

El [análisis comparativo de las seis actividades](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/ANALISIS_COMPARATIVO_ACTIVIDADES_V12.md) contrasta el código local con documentación oficial de H5P, Moodle, Canvas, QTI y W3C. Incluye 22 hallazgos priorizados, el funcionamiento propuesto por actividad y una arquitectura para crecer hacia aproximadamente 21 tipos sin definir anticipadamente los formatos futuros.

El [plan de verificación](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/PLAN_VERIFICACION_ACTIVIDADES_V12.md) registra 17 comprobaciones dirigidas ejecutadas localmente y los escenarios de aceptación pendientes. Entre los bloqueos confirmados están la inclusión de actividades privadas en la respuesta de ingreso construida por el código local, la aceptación de respuestas de otro tipo y diferencias de corrección entre datos privados y sanitizados. El contraste remoto posterior se documenta por separado.

Estado: análisis documentado; las correcciones de motor, contrato, validador y skill siguen pendientes. `npm run test` y `npm run build` no pudieron iniciar porque `npm` no está en PATH y esta copia carece de `node_modules`. Las comprobaciones dirigidas no sustituyen esas verificaciones. Esta etapa solo modificó documentación.

### Contraste con la app publicada y Supabase · 2026-10-22

La [auditoría del sistema real](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/AUDITORIA_APP_PUBLICADA_SUPABASE_V12.md) identifica la publicación de Sites v13 y el proyecto `hjcspzgglchnksnrcwmd`. Las fuentes desplegadas de guest v1 y sync v2 coinciden con las copias locales, y las doce actividades cloud están publicadas con `details` vacío. La biblioteca docente mezcla esas doce con seis actividades demo.

La base sí impide dos intentos del mismo participante e índices repetidos en un intento; el hallazgo se precisa como falta de recuperación idempotente y validación del conjunto de ocurrencias. Se revisaron los seis editores sin guardar y se verificó la descarga de un CSV de nueve filas, sin feedback ni eventos. No se crearon salas/participantes/intentos ni se modificaron políticas o funciones.

La biblioteca publicada observada no muestra el control de importación JSON presente en esta copia de desarrollo. Esa diferencia es intencional, según aclaración posterior del usuario. En la auditoría de lectura todavía no se habían ejecutado nuevas participaciones; el recorrido posterior se registra a continuación.

### Diagnóstico final y prueba estudiantil autorizada · 2026-10-22

El [diagnóstico final de las seis actividades](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/DIAGNOSTICO_FINAL_ACTIVIDADES_V12.md) consolida el código, las referencias externas, Supabase y dieciocho comprobaciones de flujo real. Define archivos, prioridades, secuencia de corrección y criterios de aceptación para comenzar las mejoras locales.

Se crearon desde la interfaz dos salas de auditoría, `EDU-360` y `EDU-322`, con dos participantes ficticios y actividades existentes. Se guardaron dos intentos y nueve respuestas: A30/60 por tiempo agotado; B30/30. Se confirmaron pérdida de borrador al recargar, feedback de escenario incoherente, cierre docente que no bloquea entrega posterior y finalización aproximadamente 51 segundos después del plazo. La selección exclusiva, asociación, arrastre básico de clasificación, flechas de ordenamiento y persistencia funcionaron en los casos descritos.

Ambas salas están finalizadas en Supabase y conservan sus evidencias. Su archivado fue rechazado por el control automático de aprobación y queda pendiente de autorización específica; no se borró nada. Las pruebas modificaron únicamente los datos y estados de esas salas mediante la app, además de respaldos locales de la propia aplicación. No se publicaron cambios de código ni se modificaron contratos, motor, validador, skill, funciones o políticas.

El diagnóstico está listo como base de mejoras, no como certificación de publicación. Desconexión real, dispositivo limpio/Android físico, concurrencia, suite/build y casos completos de `details` siguen como puertas de aceptación explícitas.

## Mapa Arquitectónico Interactivo (HTML)

El diagrama interactivo completo de la arquitectura de EvaluEdu v1.2 se encuentra en [docs/arquitectura-interactiva-evaluedu.html](docs/arquitectura-interactiva-evaluedu.html). Puede abrirse directamente en cualquier navegador y documenta en 6 circuitos interactivos (con explicaciones sencillas y técnicas):
1. El ecosistema global y las conexiones con Supabase, GitHub Pages PWA e IA externa desacoplada.
2. Los programas e instalaciones requeridos (`Node.js LTS v24.22.1`, `npm 11.19.1`, `MinGit v2.56.0.3`, `React 19`, `TypeScript 6`, `Vite 8`, `Vitest 5`, `.env.local`).
3. La tubería del sistema JSON (`edueval.content` v1 y v2) y sus 3 niveles de validación.
4. Los 6 contratos modulares de actividades (`src/lib/activities/*.ts`) y su separación entre definición privada y proyección pública.
5. El ciclo de vida de salas en vivo, tokens temporales de estudiantes e impresión en tamaño Carta en `iframe` aislado (PDF/HTML/CSV).
6. El mapa relacional de las 9 tablas PostgreSQL con RLS en Supabase.

> **Mantenimiento vivo:** Cada vez que se modifique la aplicación, debe actualizarse el bloque `ARCHITECTURE_REGISTRY` de `docs/arquitectura-interactiva-evaluedu.html` junto con `BITACORA.md` y `README.md`.

