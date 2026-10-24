# Análisis comparativo y base funcional de actividades de EduEval

Fecha: 22 de octubre de 2026.

Estado: **análisis y propuesta de diseño; las correcciones descritas no están implementadas**. El análisis inicial corresponde a la copia local v1.2. La [auditoría posterior de la app publicada y Supabase](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/AUDITORIA_APP_PUBLICADA_SUPABASE_V12.md) identifica la versión 13 publicada, confirma las dos funciones estudiantiles y precisa las restricciones reales. No se modificó el backend ni se publicó código.

**Consolidación final:** el [diagnóstico final con pruebas estudiantiles](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/DIAGNOSTICO_FINAL_ACTIVIDADES_V12.md) incorpora dos salas y dos participantes ficticios autorizados, confirma cierre/plazo, borradores y feedback, y precisa qué sigue pendiente. La publicación v13 sin importación JSON es intencional; no se considera defecto ni se propone publicarla anticipadamente. Las pruebas posteriores sí crearon datos mediante la app, sin modificar código, funciones, esquema o políticas.

## 1. Conclusión que orienta el trabajo

Las seis actividades tienen una base aprovechable: editores específicos, respuestas tipadas, ejecución, salas y registro de resultados. La principal debilidad es que esos componentes no comparten todavía un contrato completo y verificable de principio a fin. La generación automática, la proyección estudiantil, la corrección y la persistencia interpretan los mismos datos de maneras diferentes.

La comparación con H5P, Moodle y Canvas permite definir comportamientos concretos. No proporciona una regla universal de puntaje ni sustituye las decisiones de EduEval. Deben adoptarse patrones de interacción y separación de responsabilidades, adaptar las políticas de feedback y descartar los comportamientos que contradigan los acuerdos del proyecto.

Los bloqueos más importantes encontrados en esta revisión son:

1. El ingreso estudiantil devuelve una propiedad `privateActivities` con las actividades privadas, además de las versiones sanitizadas. Esta colección contiene respuestas y claves de corrección. Se reprodujo localmente la construcción del objeto devuelto.
2. El motor decide cómo corregir por `response.type` sin exigir que coincida con `activity.type`. Se logró calificar como correcta una respuesta de verdadero/falso enviada a una actividad de selección única.
3. La función de envío construye el intento desde las filas recibidas del navegador. No contrasta la lista completa con las ocurrencias asignadas de la sala. El bucle local contabilizó tres veces la misma actividad. La auditoría posterior confirmó unicidad por participante e índice, que no sustituye la validación del conjunto de ocurrencias.
4. La generación automática sigue creando actividades sin `details`, agrega alternativas genéricas y asigna respuestas por posición. La revisión docente no dispone de un editor completo para corregir esas propuestas.
5. El contrato de contenido no puede representar varias evidencias mínimas exigidas para las seis actividades. Mejorar solamente el prompt no soluciona esa pérdida de información.

El objetivo de aproximadamente 21 actividades exige resolver estos problemas en el núcleo común. No exige definir ahora los quince formatos futuros, crear botones vacíos ni ampliar el JSON con estructuras hipotéticas.

## 2. Alcance, fuentes y nivel de certeza

### 2.1 Fuentes internas

Se leyeron `AGENTS.md`, `README.md`, `BITACORA.md` y la matriz de actividades. También se revisaron el motor, sus pruebas, importación, esquema, editores, generador, ejecución estudiantil, sincronización y las dos funciones estudiantiles guardadas en esta carpeta.

La matriz es una guía de requisitos y evidencia pedagógica. El análisis del funcionamiento se fundamenta además en código verificable, referencias externas y pruebas locales. Las decisiones más recientes de la bitácora prevalecen sobre las entradas históricas que publicaban automáticamente las actividades.

| Nivel | Qué significa en este informe |
| --- | --- |
| Reproducido localmente | Se ejecutó código o una función extraída del archivo local, con datos técnicos de prueba y sin red. |
| Comprobado por inspección | El comportamiento se observa directamente en el código, pero no se ejecutó la interfaz o el servicio completo. |
| Riesgo pendiente de verificación | Falta observar el entorno real, restricciones de base de datos o comportamiento de navegador/dispositivo. |
| Propuesta | Diseño recomendado para la fase siguiente; no describe una función ya implementada. |

### 2.2 Referencias externas seleccionadas

Se priorizaron documentación oficial de producto y especificaciones. Las páginas de demostración de H5P se revisaron como documentación; no se ejecutaron sesiones autenticadas en H5P, Moodle o Canvas. No se afirma haber certificado esas plataformas ni su accesibilidad.

| Referencia | Aporte para EduEval | Límite de uso |
| --- | --- | --- |
| H5P: escenario, V/F y arrastrar/soltar | Autoría específica e interacciones diferenciadas. | Un escenario ramificado no equivale a las etapas lineales vigentes de EduEval. |
| Moodle: tipos y comportamientos de pregunta | Separación entre definición, respuesta, intento, corrección y feedback. | Sus reintentos, penalizaciones y notas visibles no son reglas adoptadas por EduEval. |
| Canvas New Quizzes: asociación, clasificación y ordenamiento | Correspondencias explícitas y alternativas concretas de puntuación. | Sus opciones varían por tipo y versión; no deben copiarse como un único algoritmo. |
| 1EdTech QTI 3 | Referencia para separar interacción, respuesta, procesamiento y resultados. | Se toma como referencia de diseño; no se propone implementar ni declarar conformidad QTI ahora. |
| W3C WCAG 2.2 y APG | Interacción por teclado, alternativa al arrastre y control del foco. | Los ejemplos APG requieren adaptación y pruebas; no son componentes certificados para copiar. |
| OWASP | Riesgo verificable al exportar texto no confiable a hojas de cálculo. | La estrategia de exportación debe probarse con los programas realmente usados. |

Las afirmaciones específicas de cada plataforma se enlazan junto a su análisis. Se consultaron las fuentes el 22 de octubre de 2026; deben volver a verificarse al implementar una integración o API concreta.

### 2.3 Verificación realizada

Se ejecutaron 17 comprobaciones en memoria con Node.js v24.19.0: diez sobre motor/proyección/bucle del servidor y siete sobre contenido/generación/editor. Algunas verifican hechos de control, como la cantidad de actividades generadas; no representan diecisiete fallas independientes. Los resultados se detallan en el [plan de verificación](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/PLAN_VERIFICACION_ACTIVIDADES_V12.md).

La carpeta no contiene `node_modules` y `npm` no está disponible en el PATH de esta sesión. Las comprobaciones dirigidas no sustituyen Vitest, TypeScript, build ni pruebas visuales. No se instalaron dependencias para esta revisión.

## 3. Comparación externa: adoptar, adaptar o descartar

| Aspecto | Comportamiento de referencia documentado | Decisión propuesta para EduEval |
| --- | --- | --- |
| Escenario | H5P permite árboles, finales y puntajes por final o recorrido. | **Adaptar:** contexto, opciones y consecuencias explícitas. Conservar etapas lineales; no incorporar ramificación. |
| V/F | Moodle configura una respuesta esperada y feedback para cada elección. | **Adoptar:** valor esperado explícito y separación del mensaje orientador y la justificación privada. |
| Asociación | Moodle pondera los pares y admite ciertas respuestas repetidas; Canvas ofrece parcial o exacto. | **Adaptar:** conservar la relación uno a uno acordada y declarar la política de puntuación. |
| Clasificación | H5P admite varias cardinalidades; Canvas define categorías y pertenencias. | **Adaptar:** una categoría por elemento en el formato actual; ninguna pertenencia inferida. |
| Ordenamiento | Moodle usa una secuencia autorada; Canvas mezcla las opciones y exige el orden completo. | **Adoptar:** orden correcto privado, mezcla persistida e IDs estables. Conservar flechas como alternativa al arrastre. |
| Selección única | Moodle distingue elección única de respuesta múltiple. | **Adoptar:** controles de elección única y exactamente una respuesta respaldada. |
| Reintentos | Moodle distingue comportamiento inmediato, diferido e interactivo. | **Adaptar:** una confirmación por ocurrencia y un intento por sala; volver atrás no equivale a reintentar. |
| Feedback | Las plataformas permiten revelar soluciones según su configuración. | **Adaptar:** orientación después de confirmar, sin solución directa ni resultado final para el estudiante. |
| Corrección en navegador | El modelo de seguridad publicado por H5P describe evaluación en cliente. | **Descartar para el modo conectado de EduEval:** la clave privada y el resultado autoritativo permanecen en servidor. |
| Extensibilidad | Moodle separa responsabilidades por tipo; H5P declara estructuras por biblioteca. | **Adoptar como patrón:** módulos completos por actividad y servicios comunes de sesión/resultados. |

Fuentes de la comparación: [H5P Branching Scenario](https://h5p.org/branching-scenario), [Moodle True/False](https://docs.moodle.org/503/en/True/False_question_type), [Moodle Matching](https://docs.moodle.org/503/en/Matching_question_type), [Canvas Matching](https://community.instructure.com/en/kb/articles/661057-unknown), [H5P Drag and Drop](https://h5p.org/drag-and-drop), [Canvas Categorization](https://community.instructure.com/en/kb/articles/661051-unknown), [Canvas Ordering](https://community.instructure.com/en/kb/articles/661061-unknown), [Moodle Multiple Choice](https://docs.moodle.org/503/en/Multiple_Choice_question_type), [Moodle Question behaviours](https://docs.moodle.org/503/en/Question_behaviours), [modelo de seguridad documentado de H5P](https://h5p.org/documentation/installation/security).

No se seleccionó Kahoot o Wayground/Quizizz como patrón principal para puntaje y resultados: las reglas ya acordadas de EduEval no necesitan competencia por velocidad ni ranking. Esta selección no es una afirmación sobre todas las capacidades actuales de esos productos.

## 4. Mapa del código auditado

Las líneas corresponden al estado local revisado; pueden cambiar en una implementación posterior.

| Archivo | Responsabilidad y puntos de revisión |
| --- | --- |
| [activityEngine.ts](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/activityEngine.ts:1) | Tipos, `details` opcional, normalización heredada, completitud, comparación, serialización y puntaje. |
| [App.tsx: modelos](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:20) | Plantilla, sala, intento y respuestas locales; mezcla de responsabilidades en un archivo de 1.924 líneas. |
| [App.tsx: importación](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:854) | Conversión del JSON a plantilla y propuestas pendientes. |
| [App.tsx: sincronización e intento](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:1023) | Envío, cola, cálculo de respaldo local y finalización. |
| [App.tsx: generador](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:1547) | Genera las seis actividades; actualmente no produce `details`. |
| [App.tsx: editores](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:1661) | Prellenado, validación, serialización y formularios por tipo. |
| [App.tsx: revisión](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:1819) | Tarjetas de propuestas y acciones aprobar/devolver. |
| [App.tsx: estudiante](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/App.tsx:1901) | Borrador de respuesta, cronómetro, confirmación y seis presentaciones específicas. |
| [contentImport.ts](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/contentImport.ts:126) | Validador, compatibilidad y prompt integrado. |
| [Esquema v1](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/edueval-content-v1.schema.json:1) | Contrato de entrada estricto, con expresividad insuficiente para algunas evidencias. |
| [student-room-guest](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/supabase/functions/student-room-guest/index.ts:53) | Motor duplicado, proyección pública, ingreso y guardado autoritativo. Solo se leyó y reprodujo código local. |
| [student-room-sync](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/supabase/functions/student-room-sync/index.ts:1) | Ruta anterior autenticada; conserva otra copia de lógica y respuestas de ingreso similares. |
| [sync.ts](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/sync.ts:1) | Cola local; la decisión de reintentar ocurre en App. |
| [activityEngine.test.ts](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/activityEngine.test.ts:1) y [contentImport.test.ts](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/src/lib/contentImport.test.ts:1) | Siete casos declarados por archivo: catorce en total por inspección, no suite ejecutada en esta sesión. |

## 5. Hallazgos y prioridad revisada

**P0:** puede invalidar la confidencialidad, la corrección o la integridad de la evaluación. Debe resolverse antes de considerar confiable el flujo completo.

**P1:** afecta autoría, interacción, recuperación o trazabilidad. Debe cerrarse antes de aprobar la etapa funcional.

**P2:** claridad y mantenimiento. No reemplaza el cierre de P0/P1.

| ID | Prioridad | Hallazgo y evidencia | Corrección propuesta |
| --- | --- | --- | --- |
| F01 | P0 | `getRoomActivities` devuelve `privateActivities` y `join` expande `...content`, líneas 129, 167 y 182 de guest. Reproducido localmente y confirmado en las fuentes desplegadas guest v1 y sync v2; no se capturó un ingreso nuevo por red. | Construir la respuesta pública por lista explícita de campos; nunca expandir objetos que contienen datos privados. Probar el JSON completo de salida. |
| F02 | P0 | Completitud y comparación se guían por el tipo de respuesta. No comprueban igualdad con el tipo de actividad ni todas las pertenencias. Reproducido: V/F en selección única obtuvo acierto. | Validación runtime de tipo, estructura, IDs permitidos, cardinalidad y claves extra; rechazar solicitudes inválidas antes de calificar. |
| F03 | P0 | guest:196 evalúa las filas enviadas; no reconstruye el conjunto esperado. La base real impide índices duplicados en un intento, pero no demuestra pertenencia de cada índice ni impide repetir la actividad con índices distintos. | Lista autoritativa de ocurrencias y evaluación de todas las asignadas; conservar la unicidad SQL existente y registrar ausencias legítimas como omisión. |
| F04 | P0 | `activityRuntime` y dos copias servidor interpretan versiones distintas. La copia pública elimina `correct` o rota datos, y el cierre local vuelve a calificarla. Reproducida divergencia V/F. | Motor puro compartido y contratos públicos/privados distintos. El respaldo conectado conserva respuestas y estado pendiente, no inventa una nota autoritativa. |
| F05 | P0 | PlayView detiene el intervalo al confirmar una pregunta; guest no valida plazo/estado al enviar. Confirmado después en T08/T09/T14: timeout aproximadamente 51 s tarde y entrega B aproximadamente 28 s después del cierre docente. | Fecha límite común y autoritativa; bloqueo real al cerrar; política explícita para envíos tardíos y recuperación. |
| F06 | P0 | El generador produce seis actividades sin `details`; escenarios/selección agregan opciones y clasificación usa posiciones. Reproducido y observado en App:1556. | Generador específico que use exclusivamente evidencia respaldada y valide su salida. |
| F07 | P0 | Compatibilidad por presencia de listas: categorías + concepto habilitan clasificación y conceptos habilitan selección única. Reproducido. | Requisitos semánticos por actividad con rutas de evidencia y motivos de bloqueo. |
| F08 | P0 | El contrato v1 carece de asignaciones de categoría, alternativas por decisión y una estructura para preservar pregunta/opciones/clave ya presentes en la fuente. Inspección. | Resolver primero el modelo de evidencia para las seis; planificar una evolución versionada sin reinterpretar silenciosamente v1. |
| F09 | P1 | Runtime rechaza objetivo, competencia y descripción vacíos; el esquema permite vacíos en competencia/descripción y la guía permite también objetivo vacío. | Alinear obligatoriedad de presencia, vacío permitido y avisos pedagógicos. |
| F10 | P1 | La UI deshabilita aceptar un JSON válido sin actividades compatibles, App:1540. | Permitir conservar el contenido válido, indicando que no genera propuestas todavía. |
| F11 | P0/P1 | La salida pública incluye explicación V/F y consecuencias/feedback de opciones antes de responder. Después se muestra solo feedback general; V/F copia explicación a ese campo. | Reservar evidencia/clave al servidor y docente. Entregar únicamente feedback permitido, asociado a la respuesta confirmada. |
| F12 | P0 | La validación de escenario exige alguna recomendación en alguna etapa, pero el motor requiere acertar todas. Se aceptó una segunda etapa sin recomendación. | Exactamente una recomendación por etapa del escenario actual, con justificación docente. |
| F13 | P0/P1 | Asociación, selección y ordenamiento identifican parte de sus respuestas por texto. Etiquetas duplicadas colisionan; se reprodujo la aceptación de dos pares con una sola clave. | IDs técnicos estables, validación de ambigüedad visual y respuestas por ID. |
| F14 | P1 | Asociación usa el orden de las definiciones como menú, permite reutilizarlas y no verifica relación uno a uno. En local el orden coincide con el de los pares. | Separar listas públicas, mezclar la derecha una vez y aplicar la cardinalidad acordada. |
| F15 | P1 | En clasificación, los elementos colocados dejan de ser arrastrables; sí existe un selector alternativo visible. Ordenamiento solo usa flechas. | Permitir reasignación por todas las vías, añadir arrastre al ordenamiento y conservar selectores/flechas. |
| F16 | P1 | La BD real sí exige un único intento por participante. guest no recupera el acuse previo como sync, por lo que un reintento puede dar error de unicidad. El bloqueo de cola por `authProfile` sigue identificado en el código local; no se reprodujo ese recorrido en producción. | Conservar la unicidad existente; completar idempotencia, guardado consistente y cola estudiantil con credencial propia. |
| F17 | P0 para expansión | La sala enlaza actividades por ID/posición; el servidor vuelve a leer su definición actual. No hay revisión/snapshot de definición en este flujo. | Congelar ocurrencias, revisiones, presentación y política al iniciar. No recalificar historia contra una definición nueva. |
| F18 | P1 | Las propuestas muestran consigna y aprobar/devolver, sin editar ni previsualizar la solución completa. La ruta manual publica desde una plantilla aceptada. | Revisión específica con evidencia, clave, vista del estudiante y validación antes de aprobar; edición invalida aprobación anterior. |
| F19 | P1 | SessionStorage conserva respuestas confirmadas; el borrador de PlayView es local al componente. T05 confirmó pérdida de un par al recargar; T09 terminó con borrador parcial descartado y tiempo cero en esa ocurrencia. | Separar borrador persistido y confirmación; preservar progreso, mezcla, tiempo y foco lógico por ocurrencia sin adoptar puntaje parcial implícito. |
| F20 | P1 | CSV no incluye feedback ni todos los eventos; algunas respuestas muestran IDs sin etiquetas. Escapar comillas no neutraliza fórmulas de hoja de cálculo. | Exportación legible y trazable, con política para texto que inicia fórmulas y pruebas Excel/LibreOffice. |
| F21 | P0 para cierre | Las pruebas actuales no cubren proyección pública ni envío; una prueba exige seis compatibilidades de un documento sin las evidencias mínimas. | Rediseñar expectativas con negativos y verificar paridad cliente/servidor, privacidad y ciclo completo. |
| F22 | P2 | Nombre visible de selección múltiple para una única respuesta, mensajes heredados y porcentaje de plantilla basado en llenar bloques. | Nombrar con precisión y separar progreso de autoría, evidencia disponible y aprobación. |

F01–F05 afectan a las seis actividades. Por ello, que asociación u ordenamiento tengan menos fallas específicas no permite considerarlas listas mientras el núcleo común siga abierto.

No se comprobó explotación del sitio publicado. Las referencias a funciones de servidor describen los archivos locales y su lógica, no el estado remoto de despliegue.

## 6. Análisis integral de cada actividad

### 6.1 Escenario de decisiones

**Referencia útil.** H5P vincula decisiones con rutas y consecuencias autoradas, y permite diferentes finales. Esto ayuda a separar una opción de su consecuencia, pero no obliga a convertir EduEval en un árbol. El alcance vigente de EduEval sigue siendo un escenario de etapas lineales. [Referencia oficial](https://h5p.org/branching-scenario).

**Contrato actual.** `scenario.situation` y `stages[]`; cada etapa tiene ID, título, consigna y opciones con ID, texto, consecuencia, feedback y `recommended`. La respuesta almacena textos elegidos por ID de etapa. No existe evidencia de procedencia por opción.

**Editor y generación.** El editor permite varias etapas. Su validación usa `some` para la recomendación del escenario completo; una etapa sin opción recomendada queda admitida aunque no pueda obtener acierto. El prellenado y el generador agregan alternativas y consecuencias genéricas. La situación importada solo guarda una decisión/consecuencia: no alcanza para reconstruir dos alternativas reales.

**Vista estudiantil.** Se muestran todas las etapas juntas. No se presentan el contexto específico `situation`, las consecuencias seleccionadas ni el feedback por opción como una secuencia de decisión y efecto. Una consigna general puede contener el contexto, pero el campo específico no se aprovecha de manera garantizada. No conviene anunciar un recorrido por etapas mientras todo permanece simultáneamente editable.

**Motor y puntaje.** Actualmente la actividad obtiene todo el puntaje solo si todas las etapas eligen una opción recomendada. Es una regla determinista válida si se declara; no es equivalente a puntuar cada decisión por separado. La clave se busca por texto y el motor no verifica rigurosamente los IDs enviados.

**Contrato funcional propuesto para este formato:**

- Contexto visible; etapas lineales con orden explícito, IDs estables y consignas claras.
- Al menos dos opciones reales por etapa; exactamente una recomendada en este formato.
- Consecuencia por opción respaldada y orientación revisada por el docente; no exigir diferencias artificiales cuando la fuente indique efectos equivalentes.
- Respuesta `etapaId → opcionId`, con etapas y opciones pertenecientes a la revisión congelada.
- Confirmación por etapa si se decide mostrar consecuencias durante el recorrido; ese punto requiere concretar el diseño antes de modificar el motor. Mostrar consecuencias no autoriza a revelar etapas futuras ni la recomendación.
- Conservar la puntuación exacta actual durante la primera reparación. Puntaje parcial por etapa es una alternativa pedagógica posterior, no una corrección automática.
- Persistir decisiones confirmadas, momentos y mensajes entregados; el historial no se reconstruye desde el texto actual de la actividad.

**Compatibilidad/importación.** Una decisión sola puede conservarse como contenido, pero no habilita automáticamente una actividad de opciones. Se necesita conservar las alternativas ya proporcionadas o que el docente complete las faltantes explícitamente. Un JSON válido con una sola decisión no debe rellenarse con alternativas genéricas.

**Criterio de cierre.** Dos etapas con dos opciones cada una; una opción recomendada por etapa; errores de estructura bloqueados; elecciones y consecuencias correctas restauradas tras recarga; resultados privados reproducibles. Casos S01–S08 del plan.

### 6.2 Falso / verdadero

**Referencia útil.** Moodle permite definir la clave y el feedback de cada elección; una explicación general es una pieza distinta. Se adopta esa distinción, adaptando la visibilidad a la regla de orientación de EduEval. [Referencia oficial](https://docs.moodle.org/503/en/True/False_question_type).

**Contrato actual.** Afirmación, `correct: boolean` y explicación. La respuesta usa las cadenas visibles `Verdadero`/`Falso`, por lo que mezcla identidad lógica y traducción.

**Editor y generación.** El editor deja elegir la clave; el generador arma la primera definición y marca siempre verdadero, o utiliza un contexto de situación como afirmación verdadera. Una definición explícita y verificable puede respaldar una proposición verdadera; la existencia de cualquier concepto o contexto no garantiza esa condición. No se deben producir afirmaciones falsas cambiando negaciones por iniciativa del sistema.

**Vista y feedback.** La afirmación específica sí se usa. El serializador del editor copia la explicación a `feedback`, y esa explicación se incorpora al JSON público. Se puede revelar la evidencia antes de confirmar y mostrar una explicación que enuncia directamente la respuesta. La exposición no se resuelve ocultando visualmente un elemento.

**Motor.** Booleano privado y cadenas públicas se comparan de forma exacta. Si la actividad sanitizada no contiene `correct`, el motor local la interpreta como falsa; se reprodujo que una respuesta verdadera correcta en servidor resulta incorrecta localmente.

**Diseño recomendado:**

- Identidad de respuesta independiente del idioma: booleano o valores canónicos internos, con etiquetas traducibles.
- Clave y evidencia privadas; mensaje orientador separado y aprobado para cada elección o criterio.
- No exigir una cuota artificial de verdaderas y falsas si la fuente solo respalda uno de los valores. El docente puede añadir material explícito.
- Confirmación deliberada, una respuesta por ocurrencia y posibilidad de revisar lo enviado sin cambiarlo.
- Acierto binario y cero por omisión; un valor ajeno a las dos opciones es solicitud inválida, no una tercera respuesta incorrecta admisible.
- Propuesta automática solo ante una afirmación y evidencia que puedan preservarse sin cambiar su significado. Los casos interpretativos quedan para autoría docente.

**Criterio de cierre.** Casos con clave verdadera y falsa, omisión, valor inválido, cambio de idioma, datos públicos sin clave y orientación que no copie la solución. Casos VF01–VF07.

### 6.3 Asociación

**Referencia útil.** Moodle permite relaciones repetidas y puntúa por subpregunta; Canvas ofrece exacto o parcial. Esto demuestra que la cardinalidad y la puntuación son decisiones del producto. EduEval ha definido pares inequívocos uno a uno para el formato actual. [Moodle](https://docs.moodle.org/503/en/Matching_question_type), [Canvas](https://community.instructure.com/en/kb/articles/661057-unknown).

**Contrato actual.** `pairs[]` guarda juntos el término y la definición. La respuesta usa `textoIzquierdo → textoDerecho`. Dos términos iguales colisionan en el objeto de respuesta; dos etiquetas derechas iguales pueden resultar indistinguibles para el estudiante.

**Editor/generación.** Se exige un mínimo de pares completos, pero no unicidad, correspondencia inequívoca ni IDs de respuesta. El fallback separa cadenas por `→`; una definición que contiene ese símbolo puede perder información. El prellenado usa solo los primeros seis conceptos, sin explicar el recorte al docente.

**Vista.** Los menús son una alternativa válida y accesible al arrastre. Actualmente la lista derecha mantiene el orden de las relaciones en local y permite reutilizar una elección. En servidor se rotan las definiciones dentro de los pares para ocultar la clave; eso fabrica relaciones falsas en un objeto con la misma estructura que una definición privada.

**Diseño recomendado:**

- Definición privada con dos conjuntos de IDs y una correspondencia explícita.
- Vista pública con listas independientes; no enviar pares correctos ni pares falsificados.
- Mezclar la lista derecha una vez por ocurrencia y conservar esa presentación durante la sesión.
- Aplicar uno a uno: al reutilizar una opción, impedir la acción o moverla con una interacción clara; permitir deshacer antes de confirmar.
- Rechazar duplicados ambiguos o pedir al docente que distinga las etiquetas. No deducir equivalencia de textos parecidos.
- Usar IDs para corregir; etiquetas solo para mostrar/exportar. Renombrar una etiqueta antes de la publicación no debe cambiar la identidad de una relación.
- Mantener exacto en la reparación inicial. El motor puede registrar qué pares fallan para el docente, aunque no otorgue puntaje parcial.
- No añadir respuestas sobrantes automáticamente. Si se incorporaran como variante futura, necesitarían contenido respaldado y reglas propias.

**Importación.** Los pares concepto/definición explícitos son una fuente aprovechable cuando no resultan ambiguos. No requieren inventar una pregunta de selección única ni una categoría.

**Criterio de cierre.** Dos o más pares, mezcla estable, no reutilización, corrección por ID, símbolos `→` preservados y detección de duplicados. Casos A01–A08.

### 6.4 Clasificación

**Referencia útil.** Canvas define explícitamente categorías y respuestas clasificables. Su guía actual contempla exacto y puntaje parcial por decisiones, incluso distractores sin clasificar. H5P ofrece cardinalidades más amplias. EduEval debe conservar por ahora la variante de una categoría por elemento, sin importar distractores o cardinalidades adicionales. [Canvas Categorization](https://community.instructure.com/en/kb/articles/661051-unknown), [H5P Drag and Drop](https://h5p.org/drag-and-drop).

**Contrato actual.** Categorías como textos e ítems con ID, etiqueta y categoría como texto. La respuesta guarda `itemId → nombreCategoria`; la pertenencia forma parte de la definición privada.

**Editor/generación.** El editor preasigna categorías por índice. El generador pasa la lista de categorías como si fuera la respuesta correspondiente a cada concepto. Con tres conceptos y dos categorías, el fallback crea un tercer ítem en `Sin categoría`, que no figura como destino disponible. Este caso se reprodujo.

**Vista.** El arrastre está implementado con eventos nativos; el selector alternativo también está visible. Al colocar un elemento pasa a un `span` sin arrastre, de modo que la reasignación depende del selector. Eso es una inconsistencia, no una imposibilidad total de corregir. El destino no valida por sí mismo que el identificador arrastrado corresponda a un ítem permitido.

**Diseño recomendado:**

- Categorías con ID y etiqueta; ítems con ID y etiqueta; asignaciones correctas privadas por ID.
- Al menos dos categorías distintas y elementos con pertenencia explícita. Una categoría puede permanecer vacía si el docente lo definió así; no fabricar elementos para llenarla.
- Evitar categorías visualmente indistinguibles. Cada ítem tiene una categoría correcta en esta variante.
- Bandeja inicial sin asignar, movimiento entre categorías y devolución a la bandeja antes de confirmar.
- Selector y arrastre escriben el mismo estado; ambos permiten corregir y funcionan en escritorio/móvil.
- Validar origen, destino y pertenencia de IDs; rechazar elementos externos y categorías desconocidas.
- Comparación exacta actual y diagnóstico por elemento para el docente. Parcial por elemento requiere una política explícita y persistida.
- No inferir asociaciones por proximidad en el texto, posición de listas o semejanza lingüística.

**Importación.** Dos listas independientes de conceptos y categorías no conservan las pertenencias. El contrato debe representarlas de forma explícita para estas seis actividades, en una evolución acordada. Hasta entonces la actividad automática debe permanecer bloqueada o requerir que el docente complete las relaciones.

**Criterio de cierre.** Mapeos reales, más elementos que categorías, categoría válida sin elementos, reasignación, destinar por selector o arrastre, recarga y solicitud con IDs ajenos. Casos C01–C09.

### 6.5 Ordenamiento

**Referencia útil.** Moodle define la secuencia correcta durante la autoría; Canvas documenta mezcla estudiantil y puntuación exacta. Los controles de mover arriba/abajo tienen un valor accesible propio. No corresponde eliminarlos para cumplir el requisito visual de arrastre. [Moodle Ordering](https://docs.moodle.org/503/en/Ordering_question_type), [Canvas Ordering](https://community.instructure.com/en/kb/articles/661061-unknown), [ejemplo W3C de opciones reordenables](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/).

**Contrato actual.** `steps: string[]` representa tanto identidad como texto y orden correcto. La respuesta guarda otra lista de textos. El criterio de completitud exige textos únicos; dos pasos con la misma etiqueta hacen que una secuencia legítima no se pueda completar.

**Generación/editor.** Se aceptan dos líneas como pasos, sin constancia de que pertenezcan a un proceso ordenado. El editor conserva el orden escrito. Las primeras doce líneas se usan en el prellenado; un proceso más largo puede quedar recortado sin una decisión pedagógica explícita.

**Vista/motor.** La mezcla inicial usa `Math.random`, no se guarda como presentación si el estudiante todavía no confirmó y puede regenerarse al regresar. La lista ya aparece completa antes de interactuar; por sí sola no demuestra respuesta deliberada. El servidor rota el orden correcto para publicarlo, mientras el evaluador local interpreta ese orden rotado como clave.

**Diseño recomendado:**

- Pasos con ID y texto; orden correcto privado como secuencia de IDs. Repetir una acción legítima no equivale a duplicar su identidad.
- Contexto del proceso y dirección de la secuencia explícitos: primero/último, anterior/posterior u otra consigna autorada.
- Mezcla pública persistida por ocurrencia, independiente de la clave; no usar una rotación fija como mecanismo para ocultar soluciones.
- Permitir confirmación explícita incluso si el orden mezclado coincide casualmente con el correcto. No exigir movimientos artificiales ni marcar como respondido solo por mostrar la lista.
- Arrastre por puntero y controles arriba/abajo equivalentes, con foco conservado y anuncios de posición.
- Respuesta como permutación exacta del conjunto permitido: sin faltantes, duplicados ni IDs ajenos.
- Mantener comparación de orden completo. Orden relativo, adyacencias, empates o varias secuencias válidas son variantes que no deben inferirse del texto.

**Importación.** Una lista de nombres o temas no es un proceso. Se necesita una secuencia ordenada en la fuente. Si la fuente admite etapas paralelas y el formato actual exige un único orden, el docente debe precisar la regla o dejarlo incompatible.

**Criterio de cierre.** Mezcla estable, confirmación explícita, conservación al omitir/volver/recargar, textos repetidos distinguibles por ID, y mismo puntaje en servidor. Casos O01–O09.

### 6.6 Selección única

**Referencia útil.** Moodle distingue una sola respuesta de varias respuestas y utiliza controles diferentes. EduEval debe nombrar la actividad y su interacción sin ambigüedad: selección única. [Referencia oficial](https://docs.moodle.org/503/en/Multiple_Choice_question_type).

**Contrato actual.** La pregunta vive en `activity.prompt`; `singleChoice.options[]` almacena ID, etiqueta y `correct`. La respuesta se compara por etiqueta. El editor valida exactamente una correcta, pero no distingue dos opciones de texto idéntico ni exige evidencia de su clave.

**Generación.** Se crea una consigna genérica, se usan nombres de conceptos y se agrega `Ninguna de las anteriores`; el primer concepto es la clave. Si solo hay una situación puede generarse una única opción. La revisión pendiente no convierte esa estructura en una pregunta respaldada.

**Vista/feedback.** Se elige una etiqueta con botones que muestran el estado visual; conviene emplear semántica de radio nativa o equivalente correctamente probada. La mezcla de preguntas de la sala no mezcla las opciones de esta actividad. El feedback general es idéntico para cualquier respuesta.

**Diseño recomendado:**

- Pregunta explícita, al menos dos alternativas distinguibles, una clave privada y evidencia de por qué esa opción responde a esa pregunta.
- Distractores ya presentes en el material o incorporados por el docente; no tratar otros conceptos del tema como distractores automáticamente.
- Clave por ID. El orden de presentación no decide ni cambia la respuesta correcta.
- Si se mezcla, persistir la permutación por ocurrencia. Evitar mezcla cuando el texto depende de posiciones o requiere un orden autorado.
- Una opción seleccionada, posibilidad de cambiarla antes de confirmar y bloqueo posterior según el comportamiento vigente.
- Orientación ligada al error cuando exista contenido aprobado para ello; no fabricar una explicación para cada distractor.
- Puntaje binario, omisión diferenciada e IDs desconocidos rechazados.

**Importación.** El prompt actual prohíbe generar preguntas, lo cual respeta el alcance. Pero también debe permitir preservar evidencia evaluativa ya existente en la fuente cuando el contrato la contemple. Extraer una pregunta y sus alternativas suministradas no equivale a inventarlas. Esa distinción debe resolverse en el modelo antes de reescribir la skill.

**Criterio de cierre.** La clave sigue siendo correcta al cambiar el orden; se rechazan cero/dos correctas, alternativas iguales y selección ajena; no se crean distractores por defecto. Casos SU01–SU08.

## 7. Reglas comunes de funcionamiento

### 7.1 Definición, presentación y solución son objetos diferentes

La solución no debe viajar al estudiante ni siquiera con campos ocultos. Tampoco conviene conservar una forma privada y rellenarla con valores falsos para publicar: `correct: false` o un par deliberadamente rotado confunden al motor y a futuros desarrolladores.

La definición privada contiene configuración, evidencia y clave. La presentación pública contiene solo los estímulos y controles necesarios. La respuesta contiene elecciones del estudiante. La evaluación combina respuesta y solución en el servidor. El resultado docente y el acuse estudiantil tienen visibilidad diferente.

La API de Canvas distingue `interaction_data`, `scoring_data` y `scoring_algorithm`; es una referencia útil de separación, no un formato que EduEval deba importar. [API oficial](https://developerdocs.instructure.com/services/canvas/resources/new_quiz_items).

### 7.2 Validar no equivale a calificar

El proceso recomendado es:

1. Validar el sobre de solicitud y la credencial.
2. Resolver sala, participante, revisión y ocurrencia autorizada.
3. Validar la respuesta contra el esquema de ese tipo.
4. Comprobar IDs, cardinalidad y política de confirmación.
5. Registrar omisión o progreso parcial cuando corresponda legítimamente.
6. Calificar con clave privada y política congelada.
7. Guardar una única vez y devolver un acuse permitido.

Una respuesta incorrecta pero válida debe registrarse y recibir orientación. Una solicitud de otro tipo o con IDs ajenos debe rechazarse: no debe obtener cero y parecer un intento normal. Al agotarse el tiempo, el progreso parcial válido debe conservarse como evidencia; eso no exige otorgar puntaje parcial.

### 7.3 Política de puntaje

Hoy el motor aplica exacto: puntaje completo o cero. La reparación inicial debe conservar ese comportamiento y hacerlo explícito en las seis actividades. La referencia externa no autoriza cambiar los resultados pedagógicos automáticamente.

Se propone que el resultado técnico contenga proporción de acierto, máximo aplicable, puntos obtenidos, estado de completitud y diagnóstico por componente. Para la política exacta la proporción puntuable sigue siendo 0 o 1. Si después se aprueba parcial para pares, elementos o etapas, debe tener algoritmo, versión y pruebas propios.

Con igual puntaje por actividad, una selección de dos opciones y una asociación de doce pares tienen el mismo máximo pero distinta carga de trabajo. Esa es una decisión de diseño de evaluación que el docente debe poder revisar; no debe compensarse con multiplicadores ocultos. La UI actual tiene un `scorePerQuestion` común por sala, no ponderación individual por componente.

### 7.4 Feedback, confirmación y navegación

Moodle documenta que feedback inmediato y múltiples reintentos son comportamientos distintos. Para EduEval se recomienda conservar una confirmación por ocurrencia, orientación inmediata y navegación retrospectiva de solo lectura para lo confirmado. [Referencia](https://docs.moodle.org/503/en/Question_behaviours).

La orientación debe estar redactada o aprobada por el docente. El sistema puede comprobar campos y momentos de entrega, pero no garantizar por sí solo que un texto libre jamás sugiera la solución. La revisión debe mostrar exactamente qué mensaje recibirá el estudiante.

El flujo conectado necesita entregar el feedback permitido al confirmar la respuesta si depende de la clave. Actualmente solo existe envío final del intento; por tanto, habrá que diseñar una operación de confirmación por ocurrencia o limitar el feedback inmediato a mensajes seguros e independientes de la clave. No se implementó ninguna de esas opciones en este análisis.

No se devuelve `score`/`maxScore` final en el acuse estudiantil de la propuesta. El endpoint local actual sí los devuelve, aunque la pantalla no los muestre. El docente conserva el acceso completo y privado.

### 7.5 Arrastre accesible y Android

WCAG 2.2, criterio 2.5.7, pide una alternativa de puntero que no requiera arrastrar. La equivalencia por teclado es además una necesidad separada. Por eso selectores y flechas son parte de la solución. [W3C: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements).

En EduEval se debe verificar que ratón, toque y teclado actualicen el mismo estado; que pueda deshacerse un movimiento; que el foco no desaparezca al mover el elemento; y que el lector de pantalla comunique destino y posición. El arrastre nativo HTML no basta como evidencia de funcionamiento táctil.

Para tamaño de controles se propone diseñar objetivos cómodos de unos 44 CSS px en móvil. Esto es un objetivo de diseño del proyecto; no debe confundirse con el mínimo de 24 CSS px y sus excepciones del criterio AA 2.5.8. [W3C: Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

El ejemplo APG de listas reordenables ayuda con foco y anuncios, pero advierte que su código es ilustrativo y requiere pruebas con tecnología de asistencia. [APG oficial](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/).

### 7.6 Tiempo y cierre

El tiempo general debe continuar durante la lectura del feedback, navegación y reconexión. El intervalo visual se calcula a partir de una fecha límite; no se usa como autoridad para aceptar respuestas.

Al cerrar la sala, la app debe bloquear nuevas confirmaciones y finalizar o conciliar el intento según la política definida. Es necesario distinguir el momento de recepción del servidor, los datos de progreso conservados y un envío que llega tarde por desconexión. Un timestamp editable del navegador no demuestra que una respuesta se emitió dentro del plazo.

La política de recuperación tardía debe concretarse antes de implementarla. Puede conservar evidencia tardía para revisión docente sin otorgarle automáticamente validez temporal. No se incorpora una pausa: sigue fuera de la primera versión.

### 7.7 Persistencia y reintentos

El protocolo necesita un identificador de intento y de confirmación/entrega que sobreviva a reintentos. Una misma entrega devuelve el mismo acuse; no suma otra fila ni otros puntos. Un cuerpo diferente con el mismo identificador no sobrescribe silenciosamente una confirmación cerrada.

La base de datos real respalda la unicidad mediante `UNIQUE(participant_id)` y `UNIQUE(attempt_id, question_index)`, verificadas en la auditoría posterior. Esto evita duplicados, pero el protocolo todavía debe recuperar el acuse de una entrega ya guardada y preservar el guardado consistente. Un `select` previo por sí solo no resuelve dos envíos simultáneos. Las migraciones locales no contienen toda la historia de creación remota.

La cola estudiantil debe reintentarse con su credencial temporal aunque no exista perfil docente. El fallo de red no se presenta como sincronización confirmada. La copia local conserva respuestas y acuses pendientes; la cifra calculada con una vista sanitizada no es nota autoritativa.

### 7.8 Resultados y exportación

Se necesita conservar respuesta estructurada, texto legible asociado a la revisión, política de puntaje, mensajes entregados, omisiones y eventos. No basta exportar IDs ni recalcular etiquetas consultando una actividad modificada.

La exportación actual escapa comillas, pero conserva valores de entrada que una hoja de cálculo podría interpretar como fórmula. Debe elegirse y probarse una estrategia explícita para CSV destinado a Excel/LibreOffice; no hay una neutralización universal para todos los consumidores. [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).

## 8. Arquitectura para crecer hacia aproximadamente 21 actividades

### 8.1 Diferenciar tres cantidades

- **Catálogo:** aproximadamente 21 tipos futuros en total.
- **Sala:** máximo de tres tipos distintos, según la decisión vigente.
- **Ocurrencias:** preguntas o repeticiones concretas dentro de una sala; una actividad puede aparecer varias veces.

Ampliar el catálogo no cambia automáticamente las otras dos cantidades. Tampoco hace que el JSON de contenido tenga que contener veintiún bloques de actividades.

### 8.2 Núcleo compartido y módulos específicos

Moodle documenta que un tipo de pregunta aporta editor, estructura esperada de respuesta, restauración del intento, corrección y presentación. Se propone adoptar esa separación en TypeScript, ajustada a React/Vite y al servidor actual. [Documentación de plugins de preguntas](https://moodledev.io/docs/5.0/apis/plugintypes/qtype).

Cada módulo de EduEval debería declarar:

| Responsabilidad | Contrato de módulo propuesto |
| --- | --- |
| Identidad | ID técnico estable, nombre visible y versión de estructura. |
| Evidencia | Requisitos de contenido y motivos concretos de incompatibilidad. |
| Definición | Validación sintáctica y reglas cruzadas de ese tipo. |
| Generación | Propuesta determinista desde evidencia preservada; puede negarse con motivos. |
| Autoría | Editor específico y vista de revisión docente. |
| Proyección | Conversión explícita a una presentación estudiantil sin solución. |
| Respuesta | Esquema, pertenencia de IDs y completitud. |
| Corrección | Función pura que usa clave privada y política versionada. |
| Presentación | Componente estudiantil específico con alternativas accesibles. |
| Persistencia | Serialización de respuestas y migración de versiones que corresponda. |
| Resultados | Lectura legible para docente y exportación específica. |
| Pruebas | Casos positivos, negativos, privacidad, restauración y límites. |

Un registro estático reúne los seis módulos actuales. No se propone descargar código de terceros, ejecutar código importado ni crear un sistema público de plugins. Los servicios de sala, cronómetro, navegación, credenciales, sincronización y exportación común pertenecen al núcleo.

H5P utiliza una definición de semántica por biblioteca para describir y validar sus parámetros. La idea aprovechable es que cada tipo declare su estructura; no que todas las actividades compartan un formulario genérico. [Semantics Definition](https://h5p.org/node/42225).

### 8.3 Modelo discriminado y separación de paquetes

`ActivityDetails` permite actualmente cero, una o varias estructuras opcionales a la vez. Se propone una unión discriminada por tipo: una actividad `sorting` debe tener la estructura de clasificación y no puede pasar como una bolsa arbitraria de campos. El control runtime sigue siendo obligatorio porque los datos vienen de JSON, almacenamiento o red.

La versión de contenido, la revisión de actividad y la versión del algoritmo son conceptos diferentes. El sobre común puede identificar tipo, versión y revisión; la solución permanece privada. Los nombres exactos y el esquema final se resolverán durante la fase de contrato de las seis.

El código de corrección puro puede compartirse entre pruebas y servidor. El paquete de presentación estudiantil no necesita incluir soluciones. Compartir algoritmos no implica compartir datos privados ni permitir calificar en línea con una clave en el navegador.

La separación conceptual entre interacción, respuesta, procesamiento y resultado también aparece en QTI 3. Se usa como referencia, sin incorporar su XML ni prometer compatibilidad. [QTI 3, procesamiento de respuestas](https://www.imsglobal.org/spec/qti/v3p0/impl).

### 8.4 Ocurrencias, revisiones y snapshots

Un ID de actividad identifica el recurso del banco. Un ID de ocurrencia identifica su aparición dentro de una evaluación. Un índice es una posición, no una identidad permanente.

Al iniciar una sala se propone congelar:

1. Lista de ocurrencias y sus IDs.
2. Revisión privada de cada definición y su clave.
3. Puntaje máximo y política de corrección.
4. Opciones de navegación, confirmación y feedback.
5. Orden de preguntas y permutaciones de opciones/pasos pertinentes.
6. Inicio y vencimiento autoritativos.

El estudiante recibe solo la proyección de las ocurrencias autorizadas. La mezcla se restaura; una recarga no crea una evaluación distinta. Una corrección posterior del banco crea otra revisión y no altera los intentos históricos.

La repetición seguirá permitida, pero el docente debe advertir que repetir exactamente una pregunta después de dar feedback no constituye una evidencia independiente del mismo valor. Se registrará la ocurrencia para interpretar el resultado, sin prohibir la función acordada.

### 8.5 Escalabilidad proporcional

Veintiún tipos justifican separar el monolito de App en módulos, usar carga diferida de presentaciones y probar el registro completo. No justifican por sí solos microservicios, veintiuna tablas de intentos ni un motor universal de reglas ejecutables.

La configuración específica puede seguir siendo JSON validado y versionado; identidad, autorización, estados, relaciones y restricciones operativas requieren su propio control. El esquema definitivo de persistencia se revisará en una etapa autorizada de backend, con el esquema real disponible.

Un tipo futuro desconocido no se representa mediante selección única por defecto. Debe quedar identificado como no soportado, conservando los datos para que una versión compatible los gestione. La misma regla aplica a una revisión que el cliente todavía no comprende.

### 8.6 Puerta de entrada para cada formato futuro

No se define su contenido ahora. Para incorporar cualquier nuevo tipo deberá existir una ficha aprobada con propósito, evidencia mínima, definición privada, vista pública, respuesta, reglas de corrección, límites, accesibilidad, persistencia, exportación y pruebas.

El tipo solo se habilita cuando todo su ciclo funciona. Tener un editor o un botón no significa tener una actividad implementada. Los módulos de las seis actuales servirán como ejemplos completos para esa ampliación.

## 9. Compatibilidad, contrato y skill

### 9.1 Evaluaciones independientes

Se deben guardar dimensiones separadas, no un solo estado excluyente:

| Dimensión | Pregunta que responde | Ejemplos |
| --- | --- | --- |
| Estructura | ¿Cumple el contrato y versión? | válido / inválido |
| Preparación | ¿Qué metadatos pedagógicos faltan? | objetivo no aportado; competencia no aportada |
| Evidencia por tipo | ¿Qué actividad puede sostener este contenido? | compatible / requiere autoría / incompatible |
| Revisión | ¿El docente aprobó esta revisión concreta? | borrador / pendiente / aprobada |
| Disponibilidad | ¿Puede seleccionarse para esta sala? | tipo soportado, revisión válida y aprobada |

Un contenido puede ser válido, carecer de objetivo y permitir asociación. Otro puede tener objetivo y competencia completos pero no permitir ninguna actividad corregible. La ausencia de metadatos no debe convertirse en bloqueo general de actividades con evidencia suficiente.

`Requiere autoría` es una propuesta para distinguir potencial de generación segura: no se anunciará como compatible para generación automática ni se usará en sala hasta completar y validar los datos.

### 9.2 Evolución limitada a las seis

Antes de modificar el JSON se debe fijar qué evidencia debe preservarse para cada actividad actual. El esquema v1 tiene categorías sin asignaciones, situaciones con una sola decisión y ninguna estructura para preguntas/opciones aportadas. Además, no registra procedencia.

Una evolución debe ser explícita y versionada. Los archivos v1 pueden continuar importándose como contenido conservador; no se les atribuirán relaciones inexistentes. Un adaptador puede trasladar datos sin pérdida demostrada y marcar lo que necesita revisión. El fallback no debe convertirse en una reparación semántica automática.

No se propone permitir propiedades arbitrarias ni agregar campos para los quince tipos desconocidos. El momento de asignar número de versión y publicar el contrato será la fase correspondiente, después de resolver los motores actuales.

### 9.3 Procedencia y autoría docente

Cada relación, clave o alternativa utilizada debe tener respaldo en una unidad de contenido o una incorporación explícita del docente. Se propone conservar referencia de fuente y origen de la edición; su forma exacta pertenece al diseño del contrato.

El validador puede comprobar referencias y consistencia, pero no certificar automáticamente la verdad pedagógica ni detectar toda invención dentro de un texto válido. La revisión docente sigue siendo necesaria. La fidelidad de la conversión se prueba comparando entrada y salida, no solo validando JSON.

### 9.4 Skill/prompt posterior

La skill debe estructurar lo aportado, preservar las preguntas o relaciones que ya existan cuando el contrato lo permita y declarar vacíos o insuficiencia según ese contrato. No debe producir una evaluación completa a partir de una exposición que no la respalda.

También debe diferenciar metadatos no suministrados de valores por defecto de configuración. Por ejemplo, usar `Inicial` por obligación del enum no prueba que la fuente haya declarado ese nivel; el diseño debe hacer explícita esa situación.

El prompt integrado y la guía documental deben provenir de una misma versión controlada. Las pruebas con distintas IAs se realizarán después y con material autorizado por el docente; esta revisión no envió contenido a una IA externa ni ejecutó esas pruebas.

## 10. Secuencia recomendada y condiciones de avance

| Fase | Trabajo concreto | Condición de salida |
| --- | --- | --- |
| A. Contratos de las seis | Cerrar invariantes de datos, respuesta, privacidad y puntaje; documentar las alternativas que exigen decisión. | Ejemplos válidos/invalidos revisables y reglas sin inferencias por posición. |
| B. Auditoría y reproducción | Usar este informe y ampliar pruebas locales contra cada hallazgo. | Cada P0 tiene caso reproducible y criterio de cierre. |
| C. Motor y pruebas | Validar tipo/IDs; generar `details`; compartir corrección; proyectar datos seguros; asegurar ocurrencias, tiempo y entregas. | Casos negativos, privacidad y paridad aprobados; sin pérdida de respuestas válidas. |
| D. Editor y ejecución | Revisión editable, interacción móvil/teclado, feedback y restauración coherentes con los contratos. | Las seis completan su ciclo específico. |
| E. Compatibilidad/validador | Evidencia mínima, evolución versionada de las seis, metadatos opcionales y aceptación de contenido conservable. | Esquema, runtime y mensajes coinciden en corpus positivo y negativo. |
| F. Skill/prompt | Una versión oficial y pruebas de fidelidad con material completo y parcial. | Sin datos añadidos; salida parseable y compatible con el validador final. |
| G. Extremo a extremo | Autoría/importación → revisión → sala → ejecución → reconexión → resultados/exportación. | Criterios del plan satisfechos y límites de verificación registrados. |

La auditoría integral precede a la corrección. Dentro de la fase de corrección, editor, ejecución y persistencia deben acompañar al motor; no son una autorización para cambiar primero la skill o sustituir pruebas por arreglos visuales.

La reparación de las funciones locales puede prepararse como parte del motor cuando se autorice implementar. Desplegar funciones, aplicar migraciones o tocar la versión pública sigue siendo una acción separada y fuera de este análisis.

## 11. Decisiones propuestas que requieren quedar registradas antes de implementarse

Las siguientes son recomendaciones concretas, no cambios ya aprobados de producto:

1. Mantener puntaje exacto en la reparación inicial; evaluar el parcial posteriormente por tipo.
2. Confirmar una vez por ocurrencia; navegación retrospectiva sin editar lo confirmado.
3. Conservar etapas lineales de escenario y precisar cuándo se confirma cada decisión y se muestra su consecuencia.
4. Aceptar contenido estructuralmente válido aunque no genere actividades y distinguir potencial de autoría de compatibilidad automática.
5. Congelar revisiones/ocurrencias al iniciar y devolver acuses estudiantiles sin nota final.
6. Diseñar recuperación tardía con evidencia y decisión docente cuando no haya prueba autoritativa de recepción dentro del plazo.

No hace falta autorización adicional para estudiar y documentar estas opciones. Su implementación posterior deberá respetar el alcance y las reglas vigentes; una alternativa que cambie una decisión cerrada se resolverá con el usuario antes de aplicarse.

## 12. Qué queda establecido como base

El desarrollo continuará sobre seis módulos completos y un núcleo común confiable. Las referencias externas aportan reglas observables y alternativas; el contrato y las decisiones de EduEval fijan cuáles se adoptan. El crecimiento hacia aproximadamente 21 actividades se prepara mediante versiones, identidades, pruebas y responsabilidades separadas, sin adelantar las reglas de los formatos pendientes.

Este informe no sustituye el plan de pruebas: debe usarse junto al [plan de verificación y evidencias locales](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/PLAN_VERIFICACION_ACTIVIDADES_V12.md).
