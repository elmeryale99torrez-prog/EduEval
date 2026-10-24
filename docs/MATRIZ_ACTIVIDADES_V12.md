# Matriz de requisitos de actividades v1.2

Documento de análisis previo a cualquier modificación del motor, la compatibilidad, el validador o la skill de importación.

## Principio

El contenido importado puede ser válido como representación del tema y, al mismo tiempo, insuficiente para una actividad concreta. La aplicación debe informar la diferencia y habilitar solo actividades que puedan generarse y corregirse con evidencia relacionada.

## Requisitos por formato

| Tipo | Datos de contenido requeridos | Debe producir | No debe hacer |
| --- | --- | --- | --- |
| `scenario` | contexto, decisión, alternativas y consecuencias | opciones reales, recomendación justificable y feedback por consecuencia | inventar alternativas o consecuencias |
| `trueFalse` | afirmación verificable y evidencia | afirmación, valor esperado y explicación | marcar siempre verdadero o alterar la afirmación |
| `matching` | dos o más pares inequívocos | elementos, relaciones y respuesta uno a uno | crear pares ambiguos |
| `sorting` | categorías y asignaciones elemento → categoría | elementos clasificables y categorías | asignar por posición o inferencia débil |
| `ordering` | pasos distintos con orden | lista mezclable y orden correcto | ordenar una lista sin proceso identificado |
| `singleChoice` | pregunta, respuesta respaldada y distractores | una opción correcta y distractores plausibles | usar el primer concepto como respuesta por defecto |

## Estados que deben distinguirse

- `valid`: cumple el contrato JSON.
- `incomplete`: faltan datos pedagógicos recomendables, como objetivo o competencia.
- `compatible`: hay evidencia mínima para un tipo de actividad.
- `not_compatible`: el contenido no permite construir una actividad corregible.
- `pending_review`: la propuesta existe, pero todavía requiere aprobación docente.

Estos estados no deben confundirse: un JSON incompleto puede ser válido; una actividad incompatible no debe mostrarse como disponible; una actividad compatible todavía no está aprobada para una sala.

## Caso de referencia

Un contenido con conceptos y definiciones puede habilitar asociación si existen pares inequívocos, y puede permitir falso/verdadero solo si hay afirmaciones verificables. Si contiene categorías pero no asignaciones elemento → categoría, no debe habilitar clasificación. Si no contiene situaciones o pasos, no debe habilitar escenario u ordenamiento.

## Orden de implementación posterior

1. Revisar el contrato interno y los `details` de las seis actividades.
2. Auditar generación, edición, ejecución, comparación, feedback, puntaje y persistencia.
3. Corregir el motor y sus pruebas.
4. Corregir compatibilidad y validador con mensajes por ruta y motivo.
5. Diseñar y probar la skill oficial de conversión.
6. Ejecutar pruebas de contenido completo, contenido parcial y modificaciones intencionales del docente.
