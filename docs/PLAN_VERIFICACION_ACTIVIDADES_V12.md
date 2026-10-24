# Plan de verificación y evidencias de auditoría v1.2

Fecha: 22 de octubre de 2026.

Estado: **17 comprobaciones dirigidas ejecutadas; suite de regresión y pruebas de aceptación propuestas, todavía no ejecutadas**. Este documento acompaña el [análisis comparativo](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/ANALISIS_COMPARATIVO_ACTIVIDADES_V12.md).

Actualización posterior del mismo día: la [auditoría real de app y Supabase](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/AUDITORIA_APP_PUBLICADA_SUPABASE_V12.md) registra por separado lectura de producción, seis editores, restricciones SQL, respuestas históricas y descarga CSV. Precisa E10/F16: la BD sí bloquea un segundo intento del participante y un índice repetido. No se ejecutaron intentos nuevos ni se declara aprobado el extremo a extremo.

**Actualización final del mismo día:** después de la fase de lectura, el usuario autorizó crear salas e ingresar participantes ficticios. El [diagnóstico final](C:/Users/elmer/OneDrive/Desktop/EduEval-v12-Actividades/docs/DIAGNOSTICO_FINAL_ACTIVIDADES_V12.md) registra T01–T18 sobre dos salas reales, dos intentos y nueve respuestas nuevas, con recorrido de los seis tipos publicados. Confirma pérdida de borrador, timeout tardío y entrega después de cierre. No certifica los 96 escenarios siguientes, desconexión real, casos completos de `details`, Vitest o build. V13 sin importación JSON es una separación intencional del desarrollo local.

## 1. Condiciones de la revisión

- Carpeta: `C:\Users\elmer\OneDrive\Desktop\EduEval-v12-Actividades`.
- Runtime utilizado: Node.js v24.19.0, disponible en el entorno de trabajo de Codex.
- Motor e importador: cargados desde sus fuentes TypeScript locales mediante eliminación de tipos.
- Funciones privadas del generador/editor y helpers de guest: extraídas de los archivos locales y ejecutadas en memoria, sin arrancar React ni Deno.
- `getRoomActivities`: cliente de datos simulado; no hubo consultas a Supabase.
- Datos: etiquetas técnicas A/B, IDs y textos `Fixture`, exclusivamente para reproducir comportamiento de software. No constituyen material pedagógico nuevo.
- `stripTypeScriptTypes` emitió el aviso experimental de Node. No es un error de la app.
- No se ejecutó la interfaz, no se probaron dispositivos ni se verificó el despliegue remoto.

Estas comprobaciones establecen lo que hace el código local bajo los casos descritos. No certifican el servicio publicado, sus restricciones SQL ni la experiencia visual.

## 2. Comprobaciones dirigidas ejecutadas

Los valores observados de fallas son resultados del código actual, no expectativas que deban conservarse en las futuras pruebas.

| Caso | Preparación y operación | Resultado observado | Hallazgo |
| --- | --- | --- | --- |
| E01 | Selección única con clave A; enviar respuesta de tipo V/F con valor Falso a `compareActivityResponse`. | `true`: se califica como correcta. | F02 |
| E02 | Selección única A/B; consultar completitud con un valor ajeno a sus opciones. | `true`. | F02 |
| E03 | Ordenamiento A/B; consultar completitud con X/Y. | `true`, aunque no pertenecen a la actividad. | F02 |
| E04 | Dos pares con IDs distintos pero textos L/R iguales; enviar solo la relación L → R. | `true`: una sola clave satisface ambos pares. | F13 |
| E05 | Clasificación heredada con tres ítems y dos categorías como respuesta. | El tercer ítem recibe `Sin categoría`, fuera de los destinos. | F06 |
| E06 | V/F con clave verdadera; corregir Verdadero mediante helper privado del servidor. | `true`, control positivo. | Control de E07 |
| E07 | Proyectar públicamente E06 y corregir Verdadero con el motor local. | `false`, discrepancia con E06. | F04 |
| E08 | Cliente simulado devuelve una selección única privada; ejecutar `getRoomActivities` y construir `{ ok: true, ...content }`. | `privateActivities[0].answer` contiene A. | F01 |
| E09 | Inspeccionar la clave de la opción correcta en el objeto JSON completo de E08. | `privateActivities[0].details.singleChoice.options[0].correct` es `true`. | F01 |
| E10 | Ejecutar la misma transformación de evaluación de guest con tres filas de la misma actividad correcta. | Se contabilizan tres aciertos; el bucle no comprueba las ocurrencias esperadas. | F03 |
| E11 | Contenido con conceptos y categorías, sin relación elemento → categoría. | Compatibilidad de clasificación `available: true`. | F07 |
| E12 | Contenido con conceptos, sin pregunta ni opciones sustentadas. | Compatibilidad de selección única `available: true`. | F07 |
| E13 | Documento v1 con objetivo vacío y demás campos válidos. | `ok: false`. | F09 |
| E14 | Plantilla técnica que cumple los disparadores actuales; ejecutar generador. | Produce seis actividades, control del alcance actual. | Control de E15 |
| E15 | Inspeccionar las seis actividades de E14. | Todas carecen de `details`. | F06 |
| E16 | Inspeccionar selección única de E14. | La clave es A, primer concepto. | F06 |
| E17 | Escenario de dos etapas: primera con una recomendación y segunda sin ninguna; validar editor. | Devuelve cadena vacía: acepta el escenario. | F12 |

E10 prueba el bucle de evaluación, no la inserción completa. En esa fase no se verificaron restricciones; posteriormente se confirmaron unicidad por participante e índice. F01 se reprodujo mediante construcción local y fuente simulada, y después se verificó el mismo patrón en el código desplegado; no se afirma captura del cuerpo HTTP de ingreso.

## 3. Verificación técnica pendiente y limitaciones

| Comando/comprobación | Estado en esta sesión | Qué falta |
| --- | --- | --- |
| `npm run test` | No pudo iniciar: `npm` no está reconocido en PATH. | Disponer del gestor/runtime del proyecto y dependencias. |
| `npm run build` | No pudo iniciar por la misma razón. | Ejecutar TypeScript y Vite con dependencias disponibles. |
| Vitest existente | Catorce casos declarados por inspección: siete por archivo. | Ejecución real; no se declara aprobado por las pruebas dirigidas. |
| Dependencias locales | `node_modules` no existe en esta copia. | Preparar el entorno durante la fase de implementación. |
| Android, escritorio y tecnología de asistencia | En la revisión inicial no ejecutado. Después se inspeccionaron editores publicados y entrada estudiantil emulada a 360 × 800. | Dispositivo Android físico, lector de pantalla y ejecución de las seis. |
| Supabase, restricciones SQL y función desplegada | Lectura posterior completada en el informe complementario; sin cambios de configuración ni registros de prueba. | Confirmaciones de red y recorridos de escritura en una sala exclusiva de pruebas. |

No se debe usar el resultado histórico de la bitácora como si verificara la copia actual. Las futuras correcciones requerirán suite, build y verificación visual propios.

## 4. Corpus que debe prepararse antes de corregir

| Corpus | Contenido y finalidad | Regla esperada |
| --- | --- | --- |
| Completo por actividad | Una fuente autorizada con toda la evidencia de un formato; no necesariamente de los seis. | Solo se habilitan los formatos respaldados. |
| Completo para las seis | Fuente que incluya realmente pares, afirmaciones, alternativas, consecuencias, clasificación, secuencia y pregunta/opciones. | Seis propuestas válidas, pendientes de revisión. |
| Expositivo | Conceptos y definiciones, sin inventar otras estructuras. | Puede habilitar asociación inequívoca; otras actividades requieren su evidencia. |
| Solo categorías | Dos categorías sin pertenencias. | Contenido conservable; clasificación automática bloqueada. |
| Solo decisiones | Contexto y una decisión/consecuencia, sin alternativas. | Contenido conservable; no rellenar un escenario de opciones. |
| Solo proceso | Secuencia explícita con contexto y pasos. | Ordenamiento compatible; no habilitar otros formatos por defecto. |
| Lista sin orden | Nombres o temas sin relación temporal/procedimental. | No tratarla como proceso. |
| Evaluación preexistente | Pregunta, opciones y clave ya suministradas por el docente. | Preservar evidencia cuando el contrato evolucionado la contemple. No descartarla ni inventarla. |
| Metadatos parciales | Evidencia suficiente pero objetivo/competencia no aportados. | Avisos de preparación; no rechazo general de todo el contenido por esos vacíos. |
| Ambiguo/inconsistente | Relaciones contradictorias, dos claves, categorías inválidas o pares indistinguibles. | Error específico o autoría requerida; nunca arreglo semántico automático. |
| Heredado v1 | Archivos y actividades anteriores. | Migración explícita, preservación del original y revisión donde falte evidencia. |

El documento de prueba actual de `contentImport.test.ts` no es evidencia suficiente para las seis: sus categorías no tienen asignaciones y su situación no contiene alternativas. La futura prueba no debe conservar `todas disponibles` como requisito.

Los casos que necesiten nuevas estructuras se ejecutarán contra el contrato que se apruebe. No se introducirán propiedades nuevas en v1 y después se considerará correcto que el validador actual las rechace.

## 5. Pruebas comunes del núcleo

Todas las filas siguientes son **pruebas propuestas**, no ejecutadas en esta revisión.

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| N01 | Definición de un tipo sin su configuración específica. | No puede publicarse ni ejecutarse; ruta y motivo concretos. |
| N02 | Definición con varias estructuras incompatibles o versión no soportada. | Rechazo controlado; sin fallback a otro tipo. |
| N03 | Respuesta de tipo distinto al de la ocurrencia. | Rechazo; no se puntúa como respuesta normal. |
| N04 | IDs desconocidos, claves extra o cardinalidad inválida. | Rechazo antes de corregir. |
| N05 | Respuesta válida pero incorrecta. | Se conserva, puntaje según política y orientación permitida. |
| N06 | Omisión legítima. | Estado omitido, corrección nula y cero puntos, sin fingir una respuesta. |
| N07 | Progreso parcial válido al vencer el plazo. | Se conserva la evidencia y su completitud; no se convierte en omisión total ni puntaje parcial implícito. |
| N08 | JSON completo del ingreso/estado/confirmación. | No contiene `privateActivities`, claves, mapeos correctos ni evidencia reservada. |
| N09 | Acuse final estudiantil. | Confirmación de recepción sin resultados docentes privados. |
| N10 | Misma definición/respuesta/política en todos los ejecutores soportados. | Mismo resultado; los ejecutores no comparten una copia sanitizada como clave. |
| N11 | Actividad repetida legítimamente dos veces. | Dos ocurrencias diferentes, respuestas y puntos independientes por ocurrencia. |
| N12 | Duplicar una ocurrencia en el envío. | Rechazo o conciliación idempotente; nunca puntos duplicados. |
| N13 | Omitir una fila del cuerpo recibido. | El servidor reconstruye el conjunto esperado y conserva omisión; no reduce el denominador. |
| N14 | Enviar índice inexistente o actividad de otra sala. | Rechazo; no cambia la evaluación autorizada. |
| N15 | Doble clic y reintento tras perder el acuse. | Mismo intento/entrega, sin registros ni puntos nuevos. |
| N16 | Dos envíos simultáneos y fallo entre intento y respuestas. | Unicidad y consistencia; estado recuperable, sin intento parcial presentado como final. |
| N17 | Cambiar revisión del banco después de iniciar. | Sala e intentos conservan definición y política congeladas. |
| N18 | Permanecer en feedback, cambiar de pestaña o recargar. | El tiempo general sigue avanzando desde la misma fecha límite. |
| N19 | Cierre docente o vencimiento con un envío posterior. | Bloqueo y política de conciliación explícita; reloj del navegador no autoriza puntaje. |
| N20 | Invitado sin perfil docente pierde y recupera la conexión. | Cola estudiantil se reintenta con su credencial; acuse final conciliado. |
| N21 | Credencial temporal vencida con entrega pendiente. | Se conserva evidencia local; no se duplica participación ni se informa sincronización falsa. |
| N22 | Tipo/revisión desconocida tras una actualización parcial de la app. | Mensaje de incompatibilidad; no se interpreta como selección única. |

## 6. Pruebas específicas de las seis actividades

### 6.1 Escenario: S01–S08

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| S01 | Una etapa, dos alternativas respaldadas y una recomendada. | Generación y edición producen el mismo contrato válido. |
| S02 | Dos etapas; una sin recomendada o con dos. | Validación bloquea esa etapa con ruta concreta. |
| S03 | Alternativa, consecuencia o evidencia faltante en la fuente. | No se agrega texto genérico como dato pedagógico. |
| S04 | Elegir opción de otra etapa o enviar etapa inexistente. | Rechazo por pertenencia. |
| S05 | Confirmar decisiones según el recorrido lineal definido. | Se muestra contexto y solo consecuencia/feedback permitido de lo elegido. |
| S06 | Una etapa correcta y una incorrecta, política exacta. | Cero de puntaje total, diagnóstico docente por etapa. |
| S07 | Recargar entre etapas o volver a una confirmada. | Conserva decisiones y efectos; no permite reintento encubierto. |
| S08 | Resultado/exportación del recorrido. | Etapas, opciones, tiempos y mensajes legibles vinculados a la revisión. |

### 6.2 Falso / verdadero: VF01–VF07

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| VF01 | Afirmación verdadera con evidencia explícita. | Clave y comparación correctas, sin depender de su posición. |
| VF02 | Afirmación falsa suministrada con evidencia. | Falso puntúa correctamente; no se cambia el contenido para fabricarla. |
| VF03 | Contexto narrativo/opinión sin afirmación evaluable. | No se habilita automáticamente. |
| VF04 | Valor vacío, omisión y valor desconocido. | Estados diferenciados; el desconocido se rechaza. |
| VF05 | Vista pública y mensaje orientador. | No incluye clave ni explicación reservada; no copia directamente la solución. |
| VF06 | Cambiar etiquetas de idioma. | Mantiene la identidad lógica de la respuesta. |
| VF07 | Recarga y calificación final. | Respuesta restaurada y resultado privado idéntico al del servidor. |

### 6.3 Asociación: A01–A08

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| A01 | Pares inequívocos completos. | Listas públicas separadas y correspondencia privada. |
| A02 | Textos repetidos o visualmente indistinguibles. | Se pide desambiguación o se aplica una regla explícita aprobada; no colisionan IDs. |
| A03 | Elegir la misma opción derecha dos veces. | Se aplica la relación uno a uno vigente de forma comprensible. |
| A04 | Definición que contiene `→`, comillas o saltos. | Se conserva el texto íntegro; no se usa como protocolo de separación. |
| A05 | Mezcla, navegación y recarga. | Mantiene el orden de presentación y las selecciones. |
| A06 | Un par incorrecto bajo exacto. | Cero total y diagnóstico docente por par; sin parcial oculto. |
| A07 | IDs de otra lista, faltantes o extra. | Validación específica, sin aceptación por longitud/texto. |
| A08 | Exportar y restaurar una respuesta. | Etiquetas legibles y mismos IDs/revisión después del ciclo. |

### 6.4 Clasificación: C01–C09

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| C01 | Dos categorías y mapeos explícitos. | Propuesta válida y clave preservada por ID. |
| C02 | Categorías + conceptos sin pertenencias. | Clasificación automática bloqueada con motivo. |
| C03 | Más elementos que categorías. | Todos tienen destino explícito; no aparece `Sin categoría` inventada. |
| C04 | Categoría vacía pero autorizada. | No se inventan elementos ni se rechaza por un requisito no acordado. |
| C05 | Mover entre categorías y volver a la bandeja. | Estado coherente y operación reversible antes de confirmar. |
| C06 | Selector, ratón, toque y teclado. | Misma asignación y corrección por todas las vías. |
| C07 | Arrastrar ID ajeno o asignar categoría desconocida. | Acción controlada en UI y rechazo en validación autoritativa. |
| C08 | Un elemento incorrecto o varios sin colocar. | Completitud y política exacta explícitas; progreso parcial preservable. |
| C09 | Recarga y exportación. | Asignaciones restauradas y etiquetas de la revisión correctas. |

### 6.5 Ordenamiento: O01–O09

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| O01 | Proceso con secuencia explícita. | Conserva el orden autorado como clave privada. |
| O02 | Lista temática sin orden temporal/procedimental. | No se genera un orden correcto por posición casual. |
| O03 | Paso repetido legítimo con distinto ID. | No hace imposible completar; la consigna permite distinguir sus apariciones. |
| O04 | Mezcla inicial y recarga antes de confirmar. | Misma presentación y borrador persistido. |
| O05 | Orden mezclado que coincide con el correcto. | Exige confirmación deliberada, no movimiento artificial. |
| O06 | Flechas, arrastre y foco. | Mismo orden final; foco estable y posición comunicada. |
| O07 | ID extra, duplicado o faltante. | No se acepta como permutación válida. |
| O08 | Intercambiar dos pasos bajo política exacta. | Resultado incorrecto; sin crédito por adyacencia no autorizado. |
| O09 | Mismo orden enviado a servidor y resultados. | Misma clave privada y representación docente legible. |

### 6.6 Selección única: SU01–SU08

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| SU01 | Pregunta explícita y opciones suministradas, una correcta. | Propuesta válida y pendiente de revisión. |
| SU02 | Solo nombres de conceptos o una situación sin alternativas. | No inventar pregunta, distractores o clave. |
| SU03 | Cero o dos opciones correctas. | Publicación bloqueada con ruta concreta. |
| SU04 | Dos etiquetas idénticas o una sola opción. | Se solicita corrección; no se evalúa una pregunta ambigua/trivial por estructura. |
| SU05 | Reordenar opciones y cambiar el idioma visible. | La clave sigue siendo el mismo ID. |
| SU06 | Cambiar selección antes y después de confirmar. | Permitido antes; después sigue la política de bloqueo vigente. |
| SU07 | ID ajeno, tipo de respuesta incorrecto u omisión. | Rechazo para solicitudes inválidas y estado omitido para ausencia legítima. |
| SU08 | Feedback y exportación. | Orientación aprobada por opción si existe; resultado privado y legible. |

## 7. Validación, compatibilidad y evolución de contrato

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| I01 | JSON mal formado o texto envolvente. | Rechazo sintáctico claro. |
| I02 | Esquema/versión desconocidos. | Rechazo explícito sin conversión supuesta. |
| I03 | Propiedad adicional, tipo incorrecto, longitud/límite excedido. | Error con ruta; esquema y runtime concuerdan. |
| I04 | Objetivo/competencia no aportados. | Se aplica la política aprobada de metadatos; no se fabrican. |
| I05 | Contenido válido sin compatibilidad. | Puede conservarse; cero propuestas y motivos visibles. |
| I06 | Pares suficientes, sin otras evidencias. | No se anuncian seis tipos por la presencia de conceptos. |
| I07 | Relaciones de categoría o clave que apuntan a un ID inexistente. | Error cruzado por ruta. |
| I08 | Archivo v1 anterior. | Se conserva e interpreta conservadoramente; no recibe mapeos nuevos por índice. |
| I09 | Cambio docente que modifica la clave o elimina evidencia. | Revalida compatibilidad e invalida la aprobación de la revisión afectada. |
| I10 | Seis tipos registrados y un tipo desconocido. | Registro consistente; desconocido no tiene ejecución de respaldo de otro tipo. |

## 8. Pruebas de la skill/prompt en su fase posterior

| ID | Caso | Resultado exigido |
| --- | --- | --- |
| P01 | Material completo y material expositivo del corpus. | Extrae solo lo presente, con la versión y claves permitidas. |
| P02 | Material con preguntas/alternativas ya escritas. | Las preserva según el contrato aprobado; no crea otras. |
| P03 | Metadatos y relaciones ausentes. | Vacíos/insuficiencia expresados conforme al contrato; sin datos añadidos. |
| P04 | Instrucción incrustada dentro del contenido. | Se trata como dato de entrada; no modifica esquema ni reglas. |
| P05 | Comparar salida con la fuente, además de validar JSON. | Cada relación, clave y consecuencia tiene respaldo o autoría docente explícita. |
| P06 | Mismo corpus en las IAs externas que el docente elija. | Registro de versión/modelo/fecha y diferencias; el validador mantiene la autoridad. |

No se enviará contenido a un servicio externo como efecto secundario de una prueba local. Las pruebas externas pertenecen al flujo docente previsto y requieren material cuyo uso esté autorizado.

## 9. Aceptación de extremo a extremo

| ID | Recorrido | Evidencia requerida |
| --- | --- | --- |
| X01 | Importar contenido completo → revisar → aprobar → sala. | `details` específicos completos y revisión aprobada antes de seleccionar. |
| X02 | Importar contenido parcial válido. | Se conserva; solo propuestas sustentadas, con faltantes claros. |
| X03 | Editar una propuesta antes de aprobar. | Revalidación, vista del estudiante y clave docente revisables. |
| X04 | Sala con tres tipos y repeticiones. | Límite de tipos mantenido; cada ocurrencia conserva su identidad. |
| X05 | Responder, omitir, volver y recargar en las seis. | Borradores, confirmaciones y mezcla preservados. |
| X06 | Interrupción de red, pérdida de acuse y reconexión. | Un intento, evidencias conservadas y estado sincronizado veraz. |
| X07 | Vencimiento y cierre docente. | Bloqueo, registro y conciliación acordados; no pausa accidental por feedback. |
| X08 | Resultados docentes y CSV/Excel. | Puntajes y conteos reproducibles, etiquetas, mensajes/eventos y texto de fórmulas tratado. |
| X09 | Android y escritorio con teclado/lector de pantalla. | Se completan las seis sin depender exclusivamente de arrastrar o del color. |

Para X09 se propone verificar 320/360 CSS px, tableta y escritorio; zoom de 200%, etiquetas largas y teclado en pantalla. Son tamaños de ensayo, no una certificación de accesibilidad. Las restricciones temporales siguen la política vigente; las salas sin límite ya constituyen una opción disponible.

## 10. Puerta de cierre de la etapa

La etapa podrá considerarse terminada cuando:

1. Cada P0 del informe tenga prueba negativa y corrección verificada.
2. Las seis actividades completen su ciclo de autoría, generación, ejecución, respuesta, orientación, puntaje y persistencia.
3. La vista estudiantil y sus respuestas API no contengan soluciones ni resultados finales privados.
4. La suite automatizada, TypeScript y build se ejecuten con éxito, registrando versiones y salidas.
5. Las pruebas responsive, teclado y toque se documenten con resultados reales.
6. El corpus completo/parcial no genere relaciones o alternativas inventadas.
7. La exportación coincida con los datos privados y se compruebe en los programas de destino.
8. Las limitaciones no verificadas queden visibles; no se conviertan en casillas aprobadas por inferencia.

Para incorporar después un tipo futuro se repetirá esta puerta de calidad con su ficha específica. No se agregan pruebas de mecánicas todavía no definidas para los quince formatos pendientes.
