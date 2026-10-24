# Auditoría de la app publicada y Supabase · contraste v1.2

Fecha: 22 de octubre de 2026.

Estado: **auditoría de lectura del sistema real, con inspección de los seis editores y descarga CSV verificadas**. No se implementaron correcciones, no se desplegó una versión y no se crearon participantes, salas ni intentos.

**Alcance histórico de este documento:** describe la fase de lectura. Posteriormente el usuario confirmó que v13 es la publicación esperada y que el importador es una prueba local; la diferencia no es una falla. También autorizó crear y usar salas para la prueba estudiantil. Ese recorrido, los datos creados y el estado final se consolidan en el [diagnóstico final](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/DIAGNOSTICO_FINAL_ACTIVIDADES_V12.md). Las menciones a pruebas no realizadas en este documento corresponden al momento de esa fase anterior.

Este documento amplía y precisa el [análisis comparativo inicial](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/ANALISIS_COMPARATIVO_ACTIVIDADES_V12.md). Cuando un hallazgo local tenía pendiente una comprobación remota, esta auditoría aporta el resultado observado. No representa una prueba estudiantil nueva de extremo a extremo.

## 1. Sistema identificado

| Componente | Evidencia obtenida |
| --- | --- |
| App | [EvaluEdu publicada](https://evaluedu.elmer-yale99-torrez.chatgpt.site), abierta con sesión administrativa y acceso docente. |
| Hosting | Site `appgprj_6ad8683d635c8191a2bf9ee339da4dca`; versión 13, despliegue `publish` con estado `succeeded`. |
| Procedencia de v13 | Commit informado por Sites: `c9ecae6817970d887c661ab1facd7ca2a960714b`; publicación actualizada el 22/10/2026 a las 15:35:19 UTC. |
| Recurso servido | El navegador observó `/assets/index-DwAW5EsQ.js`. No se afirma una comparación completa de ese bundle con el código fuente local. |
| Copia local | No tiene un commit HEAD disponible y sus archivos aparecen sin seguimiento; no puede demostrarse identidad del frontend mediante Git. |
| Supabase | Proyecto [EvaluEdu](https://supabase.com/dashboard/project/hjcspzgglchnksnrcwmd), referencia `hjcspzgglchnksnrcwmd`, API `https://hjcspzgglchnksnrcwmd.supabase.co`. |
| Estado de proyecto | `ACTIVE_HEALTHY`, región `sa-east-1`, PostgreSQL 17.11. |
| Backend estudiantil | `student-room-guest` v1 y `student-room-sync` v2, activas. Sus fuentes desplegadas coinciden con los archivos locales normalizando saltos de línea y espacios finales. |

La versión 13 de Sites no es la versión del contrato JSON ni el número v1.2 de esta etapa de trabajo. Tampoco coincide con el texto visible `MVP · v0.1`, que no sirve por sí solo para identificar el despliegue.

## 2. Qué se hizo y qué quedó fuera

Se inspeccionaron metadatos, tablas, restricciones, índices, políticas RLS, migraciones, avisos del asesor y fuentes de funciones mediante el conector. Se navegaron biblioteca, salas, resultados y los seis editores publicados sin pulsar guardar/publicar. Se ejecutó una consulta SELECT desde el editor temporal del Dashboard para contrastar las nueve respuestas existentes.

Varias consultas SQL del conector fallaron con un error interno. La consulta equivalente de respuestas funcionó desde el Dashboard; no se interpretaron esos errores como ausencia de datos. El Dashboard también mostraba un aviso general de incidencia técnica de Supabase; el proyecto respondía y figuraba saludable. No se atribuye el fallo del conector a una causa no demostrada.

Se verificaron la descarga y el parseo de un CSV existente, y se inspeccionó la entrada estudiantil con un viewport de 360 × 800. El tamaño original se restauró. Esto no equivale a probar Android físico, lector de pantalla ni los seis ejercicios en móvil.

No se ingresó un participante nuevo ni se inició la sala que estaba en espera. No se enviaron respuestas falsas al servicio, no se repitieron intentos contra producción y no se probaron modificaciones con identidades ajenas. El análisis de esas rutas se basa en el código desplegado y las restricciones consultadas.

Al finalizar se repitió el inventario: los conteos informados de las nueve tablas permanecieron iguales. También se compararon los hashes de los 25 archivos locales de aplicación, funciones y recursos auditados: no cambiaron. Estos controles acompañan el registro de acciones; no equivalen a una prueba de inmutabilidad de cada fila ni de todo el servicio.

## 3. Inventario real y diferencias con la interfaz

| Entidad | Registros informados al consultar |
| --- | ---: |
| Perfiles | 3 |
| Plantillas | 3 |
| Actividades | 12 |
| Salas | 4 |
| Relaciones sala–actividad | 12 |
| Participantes | 3 |
| Intentos | 3 |
| Respuestas | 9 |
| Eventos administrativos en `audit_events` | 0 |

Las doce actividades están publicadas, dos por cada uno de los seis tipos. Todas tienen `details = {}`. Por tanto, la ejecución de esos registros depende actualmente del fallback heredado, aunque los editores nuevos sí permitan construir estructuras específicas.

El panel docente mostró dieciocho actividades y cinco salas: a los registros cloud se suman seis actividades y una sala demo conservadas en el navegador. El panel administrativo mostró doce actividades y cuatro salas. La interfaz docente no distingue suficientemente ambos orígenes y muestra las actividades demo como publicadas. Esto confirma una diferencia de inventario visible, no doce actividades cloud adicionales.

También permaneció visible `1 pendiente` en el panel docente. No se forzó el botón de sincronización, porque podía ejecutar una operación previamente encolada por el usuario. Se registra como síntoma observado, sin atribuirlo automáticamente a un intento estudiantil o a una causa específica.

## 4. Protecciones comprobadas que precisan el análisis anterior

### 4.1 Unicidad de intentos y respuestas

Existen estas restricciones reales:

| Restricción | Qué protege | Qué no garantiza |
| --- | --- | --- |
| `attempts_participant_id_key`: `UNIQUE(participant_id)` | Evita dos filas de intento para el mismo participante. | No devuelve automáticamente un acuse idempotente ni valida el contenido del intento. |
| `attempt_answers_attempt_id_question_index_key`: `UNIQUE(attempt_id, question_index)` | Evita repetir el mismo índice dentro del intento. | No prueba que el índice exista en la sala ni que la actividad corresponda a esa ocurrencia. |
| `room_activities_room_id_position_key` | Evita dos relaciones en la misma posición de una sala. | No congela la definición ni limita por sí sola la sala a tres tipos. |
| `room_participants_room_id_name_normalized_key` | Evita repetir el nombre normalizado dentro de la sala. | No identifica de forma permanente a una persona ni reemplaza la credencial temporal. |
| Índice parcial `(room_id, auth_user_id)` | Evita duplicar esa identidad autenticada cuando no es nula. | No aplica del mismo modo a invitados sin `auth_user_id`. |

**Rectificación de F16:** no corresponde afirmar que el mismo participante puede crear libremente dos intentos. La base lo bloquea. El problema que persiste es que guest no trata el reintento como entrega ya guardada: intenta insertar de nuevo y puede responder con error de unicidad en lugar de recuperar el acuse. La variante sync sí contiene una consulta de intento previo. No se ejecutó esa colisión en producción.

**Precisión de F03:** los índices repetidos también están bloqueados. Sigue faltando comparar las filas recibidas con el conjunto esperado de ocurrencias: índices distintos o una lista abreviada no quedan validados por esas restricciones. No se intentó alterar una nota real.

### 4.2 RLS y avisos del asesor

Las nueve tablas públicas tienen RLS habilitado. Se observaron políticas de propietario y una política `*_permanent_users_only` **RESTRICTIVE** en cada tabla. No se debe interpretar esa segunda política como un permiso global para cualquier usuario permanente: las restrictivas se combinan con las permisivas mediante AND. [Semántica oficial de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

El asesor devolvió nueve avisos `Anonymous Access Policies` sobre las políticas de acceso y un aviso de protección de contraseñas filtradas desactivada. Los nueve avisos deben revisarse junto a las políticas restrictivas existentes; no demuestran por sí solos que un invitado pueda leer directamente las tablas. No se realizó una prueba con una segunda identidad ni se certificó toda la autorización. [Referencia de RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Referencias de remediación devueltas por el asesor: [Anonymous Access Policies](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins) y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Son avisos de revisión, no cambios aplicados ni una autorización para cambiar el plan de la cuenta.

RLS no corrige la exposición causada por una función que utiliza el cliente privilegiado y construye una respuesta con datos privados. Esa frontera se debe verificar en la salida de la función.

## 5. Hallazgos confirmados en el backend desplegado

### 5.1 La colección privada sigue incluida en el código de ingreso · P0

Se obtuvo la fuente de `student-room-guest` v1. Su `getRoomActivities` devuelve `activities` sanitizadas y `privateActivities` con las definiciones privadas. Los dos caminos de ingreso expanden `...content` en el cuerpo de respuesta. La ruta sync desplegada conserva el mismo patrón.

Esto confirma F01 en el **código que está desplegado**, no solamente en una copia de desarrollo. No se capturó un paquete nuevo de ingreso estudiantil porque habría requerido registrar o revalidar un participante. La comprobación local previa reproduce exactamente la construcción de ese objeto con una fuente simulada.

La corrección propuesta mantiene prioridad P0: devolver únicamente los campos públicos explícitos y probar el objeto JSON completo. No basta revisar que `activities` esté sanitizado si otra propiedad transporta las claves.

### 5.2 Tipo de respuesta, denominador y tiempo · P0

El motor desplegado conserva la selección de algoritmo mediante `response.type` sin exigir igualdad con el tipo de actividad. F02 sigue presente en la fuente real. La reproducción dirigida previa aplica a esa misma lógica; no se envió una respuesta manipulada al servicio.

El envío final sigue evaluando `responses.map(...)` y calcula `total_questions`/`max_score` desde las filas evaluadas, en lugar de reconstruir una lista completa e inmutable de ocurrencias. Las restricciones de unicidad no sustituyen esa validación.

La validación de estado abierto y límite de tiempo no se repite en el camino `submit_attempt` observado. El servidor también acepta fechas de inicio/finalización del cuerpo y devuelve `score`/`maxScore` en el acuse. Estas observaciones se refieren al código desplegado; no se probaron envíos fuera de plazo ni notas visibles en una sesión estudiantil nueva.

### 5.3 No hay una capa SQL adicional que reconstruya el contrato

La consulta de triggers no internos sobre el esquema `public` devolvió cero filas; la consulta de funciones en `public` también devolvió cero. Las restricciones de `activities` controlan tipo, dificultad y estado, pero no validan la estructura JSON de `details`.

No se observó en esas capas un bloqueo de cambios por estado activo, un snapshot de revisiones ni una validación de pertenencia por ocurrencia. No se realizó ninguna actualización para intentar eludir la UI.

La migración remota registra siete entradas. En la carpeta está presente únicamente la migración `restrict_anonymous_access`; esa copia no basta para reconstruir por sí sola todo el esquema real. Debe recuperarse su procedencia al preparar un entorno de pruebas, sin ejecutar una migración durante esta auditoría.

## 6. Resultado del recorrido de los seis editores publicados

Se abrió `Nueva actividad`, se eligió la plantilla existente `El Ciclo del Agua` y se recorrieron los seis tipos mediante el selector. Después se canceló el formulario.

| Actividad | Observación real | Implicación |
| --- | --- | --- |
| Escenario | Contexto real y una decisión suministrada; las otras opciones son `Analizar otra alternativa antes de decidir` e `Ignorar las consecuencias`, con efectos genéricos. | Confirma prellenado sin respaldo de alternativas/consecuencias. |
| V/F | Se prellena la definición de evaporación, la clave Verdadero y un ejemplo como explicación. | La definición puede ser aprovechable, pero la clave inicial y la explicación requieren revisión explícita; el aviso dice que se usará como feedback. |
| Asociación | Tres pares concepto/definición visibles y editables. | Base aprovechable; la inspección del formulario no demuestra unicidad, mezcla ni corrección de la interacción estudiantil. |
| Clasificación | Categorías Ciencias Naturales, Ecología y Ciclos Biogeoquímicos; se preasignan Evaporación→Ciencias Naturales, Condensación→Ecología y Precipitación→Ciencias Naturales. | Prellenado por posición sin relación explícita. La tercera categoría no se usa en esas asignaciones iniciales. |
| Ordenamiento | Evaporación, Condensación, Precipitación y Colección en secuencia de autoría. | La fuente contiene una secuencia aprovechable; aún falta probar el recorrido estudiantil real, mezcla, arrastre y restauración. |
| Selección única | Consigna general tomada del objetivo; opciones Evaporación, Condensación y Precipitación, con la primera marcada como correcta. | No existe una pregunta específica que justifique esa clave por la sola presencia de los conceptos. |

Hay además una diferencia concreta entre el editor y el registro guardado de clasificación del ciclo del agua: el registro asocia su tercer elemento a Ciclos Biogeoquímicos por posición, mientras el editor lo prellena en Ciencias Naturales al alternar las dos primeras categorías. Ninguno de esos mecanismos demuestra una clasificación pedagógica válida.

En biblioteca se observó `Nueva plantilla` y `Nueva actividad`, pero no el control de importación JSON presente en esta carpeta. Los hallazgos del importador y la skill siguen siendo de desarrollo local; no deben presentarse como una prueba del importador publicado.

La vista previa de clasificación mostró los elementos y un aviso `Lista para reutilizar`, sin permitir revisar allí el mapeo completo de categorías ni ejecutar la actividad. Ese aviso no certifica la evidencia de corrección.

## 7. Evidencias en los intentos ya guardados

La consulta SELECT del Dashboard devolvió nueve respuestas: siete respondidas/correctas y dos omitidas. Coincide con los tres intentos mostrados en resultados: dos de 30/30 y uno de 10/30, acumulado de 70/90.

Estos datos prueban persistencia y coherencia básica de conteos para esos ejemplos. No prueban calidad pedagógica ni corrección bajo entradas inválidas.

Ejemplos determinantes:

- **Escenario:** la opción registrada como correcta es la propia pregunta `¿Qué debería hacer el estudiante que observa la situación?`. Se guardó en `choices.fallback-stage` y obtuvo 10 puntos. La estructura convirtió una pregunta en alternativa, no una decisión que responda al caso.
- **Clasificación:** la actividad de agua/residuos tiene como elementos `Consumo responsable de agua` y `Separación de residuos`, y como respuesta heredada la lista `Orgánico`, `Reciclable`, `No reciclable`. La respuesta persistida asigna los dos elementos a las dos primeras categorías y recibe 10 puntos. No hay un mapeo explícito aportado que sostenga esa corrección.
- **Selección única:** se registra `Consumo responsable de agua` como correcta para una consigna genérica sobre el contenido aprendido. La coincidencia con la clave existe; la pregunta no establece por sí sola una única alternativa respaldada.
- **Asociación y ordenamiento:** las respuestas guardadas sí conservan relaciones y secuencia en JSON, pero utilizan textos/fallbacks, no el modelo de IDs/revisiones propuesto.

Las actividades de ambas plantillas tienen `details` vacío. Estos resultados demuestran que una nota perfecta no equivale a haber ejecutado el contrato específico exigido para v1.2.

## 8. Exportación y comprobación visual

Se pulsó exportar desde resultados y se descargó [edueval-resultados (3).csv](<C:/Users/elmer/Downloads/edueval-resultados (3).csv>). El archivo contiene:

- Nueve filas de respuesta y veinte columnas.
- BOM UTF-8 y separador punto y coma; el parseo preservó los acentos.
- Puntaje, respuesta, omisiones y tiempos exportados.
- Una fila con `fallback-stage` como parte de la respuesta legible.
- Ninguna columna de feedback ni de eventos.

Se verificó la descarga y lectura del CSV. No se abrió Excel/LibreOffice, no se comprobó la importación de fórmulas y no se alteró contenido para ejecutar una prueba de inyección. F20 queda parcialmente confirmado; la prueba completa de los programas de destino sigue pendiente.

La entrada estudiantil se observó a 360 × 800: campos y botón visibles, ancho de contenido igual a 360, sin desbordamiento horizontal de página. No se envió el formulario. El viewport se devolvió a 1265 de ancho al terminar la prueba temporal.

La consulta de errores/advertencias de consola capturados durante la sesión docente devolvió una lista vacía. Esto describe esa sesión de observación y no equivale a ausencia de errores históricos en el sistema.

## 9. Revisión de prioridades y próximos criterios

| Prioridad | Acción de la fase de implementación posterior |
| --- | --- |
| P0 | Proyección segura del ingreso: eliminar la colección privada de toda salida estudiantil. |
| P0 | Validar tipo y respuesta por ocurrencia; reconstruir denominador/puntaje desde la sala congelada. |
| P0 | Exigir contratos específicos y claves sustentadas; retirar los generadores por posición. |
| P0 | Aplicar estado/plazo en servidor y separar acuse estudiantil de resultados privados. |
| P1 | Conservar la unicidad SQL existente y completar idempotencia/recuperación; no sustituir restricciones útiles. |
| P1 | Separar datos demo y cloud en inventario, selección de salas y mensajes de publicación. |
| P1 | Revisar/editar propuestas con evidencia completa, mejorar serialización y completar exportación. |
| P1 | Alinear documentación de versión publicada, copia local y migraciones reproducibles. |

Para ampliar hacia aproximadamente 21 actividades hay otro dato concreto: `activities_type_check` permite exactamente los seis IDs actuales. Cada tipo futuro aprobado necesitará una evolución explícita de ese catálogo en backend, además de su módulo frontend/corrector. No se modificó esa restricción ni se definieron los quince formatos pendientes.

La siguiente verificación funcional necesita una sala exclusiva de pruebas para recorrer al estudiante, confirmar respuestas, provocar desconexión y observar la entrega de red. Esas operaciones generan datos y no se realizaron en esta auditoría de lectura. No se considera aprobado el extremo a extremo por haber inspeccionado editores o consultado intentos históricos.

## 10. Registro de comprobaciones reales

| ID | Comprobación | Resultado |
| --- | --- | --- |
| R01 | Proyecto correcto y acceso del conector | Identificado y leído. |
| R02 | Versión de hosting y despliegue | v13, publicación exitosa. |
| R03 | Paridad guest local/desplegada | Coincidencia textual normalizada, v1. |
| R04 | Paridad sync local/desplegada | Coincidencia textual normalizada, v2. |
| R05 | Tablas y RLS | Nueve tablas con RLS; políticas revisadas. |
| R06 | Unicidad | Intento por participante e índice por intento protegidos. |
| R07 | Inventario de actividades | Doce cloud, todas sin `details` específicos. |
| R08 | Biblioteca docente | Dieciocho visibles; seis demo mezcladas con cloud. |
| R09 | Seis editores | Recorridos sin guardar; prellenados observados. |
| R10 | Importación publicada | Control JSON no observado en la biblioteca; no se prueba el flujo local como si fuera publicado. |
| R11 | Intentos y respuestas | Tres intentos/nueve respuestas existentes; 70/90 acumulado. |
| R12 | CSV | Descarga y parseo exitosos, feedback/eventos ausentes. |
| R13 | Entrada a 360 × 800 | Visible sin desbordamiento; no se ingresó a una sala. |
| R14 | Avisos de seguridad | Diez advertencias leídas y contextualizadas; no se cambiaron políticas. |
| R15 | SQL ante fallo del conector | SELECT funcionó en el editor temporal del Dashboard; se cerró sin guardar snippet. |

Las 17 comprobaciones dirigidas del informe inicial, las 15 observaciones de esta tabla y los 96 escenarios propuestos son conjuntos distintos. No se suman ni se presentan como una suite automatizada aprobada.
