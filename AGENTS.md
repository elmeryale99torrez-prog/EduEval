# Instrucciones de trabajo para EduEval

Leer este archivo, `README.md` y `BITACORA.md` antes de modificar el proyecto. EduEval también puede aparecer como EvaluEdu en la interfaz. Es independiente de `APP DE JUEGO` y de Ecoliderazgo; no modificar esos proyectos.

## Fuente de verdad

`AGENTS.md` contiene las reglas operativas, `README.md` describe el comportamiento actual y `BITACORA.md` conserva la historia, las decisiones cerradas, las rectificaciones y los pendientes. Si una entrada antigua contradice una decisión posterior, prevalece la decisión más reciente. Toda implementación nueva debe indicar si está implementada, es demo local, está pendiente o está conectada realmente a Supabase.

## Decisiones que no deben perderse

- PWA responsive para Android y computadora, con React/Vite.
- Nombre provisional: EvaluEdu.
- Pantalla inicial con iconos para Administrador, Docente y Estudiante.
- La plantilla contiene contenido pedagógico estructurado, no actividades seleccionadas.
- La plantilla usa bloques repetibles, validación, borrador, progreso, vista previa y PDF de respaldo. El flujo principal importa el contrato JSON `edueval.content` v1 por archivo o pegado; el formulario manual puede mantenerse como vía alternativa mientras el flujo JSON se consolida.
- La aplicación analiza compatibilidad y deshabilita actividades cuando falta información, explicando el motivo.
- Las seis actividades iniciales son: escenario de decisiones, falso/verdadero, asociación, clasificación con arrastrar y soltar, ordenamiento con arrastrar y soltar y selección múltiple con una sola respuesta correcta.
- La IA que prepara el contenido es externa y elegida por el docente. EduEval no genera contenido con IA ni envía el contenido importado a servicios externos. La validación de EduEval es la autoridad final.
- El JSON válido se convierte en una plantilla interna y calcula la compatibilidad. Las actividades importadas quedan en estado `pending` hasta la revisión y aprobación explícita del docente; solo después pueden seleccionarse para una sala.
- Una sala permite hasta tres actividades diferentes, repetición, reordenamiento, puntaje configurable y tiempo general opcional.
- No existe pausa en la primera versión. Una sala iniciada no se modifica.
- Estados: Borrador → Lista para iniciar → En espera → En curso → Finalizada → Archivada.
- El estudiante recibe retroalimentación orientadora sin ver directamente la respuesta correcta y no ve su resultado final.
- No hay ranking ni decisión automática de aprobación o certificación.
- Los resultados son privados para el docente y el administrador, con exportación detallada a Excel/CSV.
- El administrador tiene un panel separado para resumen global, usuarios/permisos y auditoría; en demo local no modifica identidades reales.
- No existe un rol de revisor independiente en la primera versión; la revisión y aprobación de actividades importadas corresponde al docente.
- El estudiante debe ejecutar las actividades desde su estructura específica (`details`) y no desde un formulario genérico; respuestas y puntajes deben conservar el tipo de actividad.

## Flujo vigente de importación

```text
Contenido del docente → IA externa con el prompt oficial → JSON `edueval.content` v1
→ importación por archivo o pegado → validación estricta local
→ plantilla interna → compatibilidad → revisión docente → sala
```

- Solo se acepta el contrato JSON definido por el proyecto; no se debe interpretar automáticamente cualquier Word, PDF o texto sin estructura.
- El PDF es un respaldo exportable del contenido, no el formato principal de importación.
- El validador debe rechazar JSON inválido, versiones desconocidas, propiedades no permitidas, tipos incorrectos, campos vacíos, listas excesivas y textos fuera de los límites, mostrando rutas concretas.

## Criterio de preparación pedagógica y auditoría de actividades

El JSON puede representar correctamente el contenido de un tema sin ser todavía un material preparado para una prueba. La skill o prompt de conversión no debe inventar objetivos, competencias, relaciones, alternativas, respuestas ni consecuencias que el contenido fuente no proporcione. Debe distinguir entre:

- **validez estructural:** el JSON cumple el contrato;
- **completitud pedagógica:** existen objetivo, competencia u otros datos deseables para orientar la evaluación;
- **compatibilidad de actividad:** existe evidencia suficiente y relacionada para construir una actividad corregible.

Objetivo y competencia son importantes para una evaluación pedagógicamente estructurada, pero su ausencia no debe convertir automáticamente en inválido todo el contenido. Si faltan, el sistema debe señalar la carencia y limitar las actividades que pueden proponerse. Los datos opcionales vacíos no deben habilitar actividades que no puedan sostenerse ni bloquear actividades que sí tengan evidencia suficiente.

La compatibilidad no puede depender solo de que existan listas. Una categoría sin relación explícita con sus elementos no habilita clasificación; conceptos sin una afirmación verificable no bastan por sí solos para falso/verdadero; y un conjunto de nombres no constituye una pregunta de selección única. Las relaciones necesarias deben estar expresadas en el contrato o ser revisables por el docente sin que la aplicación las invente.

Antes de modificar la skill, el validador o el motor se debe auditar cada actividad completa: editor, estructura generada, vista del estudiante, comparación de respuestas, feedback, puntaje, persistencia y datos importados. El orden de trabajo vigente es: contrato de actividad → auditoría de las seis actividades → motor de generación y corrección → compatibilidad/validador → skill o prompt → pruebas de extremo a extremo. Cada fase requiere revisión detallada; no se considera resuelta por cambiar únicamente la interfaz.

## Orden de desarrollo

1. Selección de rol e identidad.
2. Modelo y constructor de plantilla.
3. Compatibilidad y validación.
4. Editores específicos de actividades.
5. Propuestas con revisión docente.
6. Salas y estados reales.
7. Supabase Auth, base de datos, RLS y Realtime.
8. Respuestas, reconexión, resultados y exportación.
9. Pruebas responsive y PWA instalable.

Para la etapa v1.2 de actividades se trabajará únicamente en las seis actividades actuales. Los formatos futuros se incorporarán después de definir sus reglas, sin ampliar ahora el contrato por anticipación.

## Seguridad y verificación

- Nunca colocar `service_role` en el frontend.
- No presentar datos demo como reales.
- Validar códigos y permisos en backend cuando Supabase esté conectado.
- Ejecutar TypeScript, build de producción y prueba visual después de cada etapa relevante.
- Actualizar `BITACORA.md` con los cambios y pendientes. Cuando `README.md` esté disponible para edición, mantenerlo sincronizado.
- No presentar datos demo como reales ni alterar la versión publicada sin autorización expresa.
- Ejecutar `npm run test` y `npm run build` después de una etapa relevante y registrar cualquier limitación de verificación.

## Alcance de este espacio v1.2

Esta carpeta es el espacio operativo separado para revisar y desarrollar las seis actividades actuales de EduEval. La documentación activa fue sincronizada desde la copia fuente.

Desde este punto, los comandos, análisis y cambios de esta etapa deben dirigirse explícitamente a esta carpeta. No publicar ni modificar la versión pública mientras no exista una autorización expresa. Los quince formatos futuros se documentarán cuando sus reglas estén definidas; no se deben inventar ahora.
