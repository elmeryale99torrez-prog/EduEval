# Importación de contenido estructurado en EduEval

Esta función se desarrolla sobre una rama local y todavía no está publicada. La versión de producción permanece en [EvaluEdu](https://evaluedu.elmer-yale99-torrez.chatgpt.site/).

## Flujo docente

```text
Mi contenido → Importar JSON → Validar → revisar compatibilidad → Propuestas → aprobar → crear sala
```

La IA externa solo prepara el JSON usando el prompt oficial. EduEval no genera contenido con IA: recibe el texto o archivo, valida el esquema, normaliza el contenido y lo convierte en una plantilla interna. Si el archivo es estructuralmente válido, se detectan los seis formatos compatibles actualmente; las actividades importadas quedan como propuestas (`pending`) hasta que el docente las aprueba.

El prompt se muestra dentro de la aplicación en un campo de solo lectura y se puede copiar, pero no se acepta como una regla de seguridad. El JSON recibido siempre se valida de forma independiente: se rechazan claves desconocidas, valores `null`, tipos incorrectos, versiones no compatibles y contenido fuera de los límites. El bloque pegado del docente se trata como datos, no como instrucciones para el generador externo.

Los cinco formatos adicionales solicitados todavía no forman parte de esta versión. Antes de incorporarlos hay que definir sus nombres y reglas de respuesta; cada formato requiere su editor, esquema de datos, interacción estudiantil, corrección y exportación.

El formulario manual de plantillas sigue disponible como respaldo.

## Contrato versionado

El esquema canónico está en [`src/lib/edueval-content-v1.schema.json`](../src/lib/edueval-content-v1.schema.json). El identificador es `edueval.content` y la versión actual es `1`.

La raíz debe contener únicamente:

```json
{
  "schema": "edueval.content",
  "version": 1,
  "content": {
    "title": "Título",
    "subject": "Asignatura",
    "description": "Descripción breve",
    "objective": "Objetivo de aprendizaje",
    "competency": "Competencia o capacidad",
    "difficulty": "Inicial",
    "concepts": [{ "name": "Concepto", "definition": "Definición", "example": "Ejemplo opcional" }],
    "situations": [{ "title": "Caso", "context": "Contexto", "decision": "Decisión", "consequence": "Consecuencia" }],
    "processSteps": ["Paso 1", "Paso 2"],
    "categories": ["Categoría 1", "Categoría 2"]
  }
}
```

El validador rechaza JSON inválido, versiones desconocidas, campos no permitidos, tipos incorrectos, campos obligatorios vacíos y listas o textos que superen los límites definidos. Cada error conserva su ruta, por ejemplo `content.concepts[0].definition`.

## Persistencia y seguridad

- Con Supabase configurado, la plantilla se guarda en `evaluation_templates.content` como JSONB y las propuestas en `activities`, usando las políticas RLS del propietario.
- La importación no necesita `service_role`, una tabla nueva ni una función Edge adicional.
- Si Supabase no está disponible, el flujo usa la copia local y la cola de sincronización existente.
- La interfaz no envía el contenido a ninguna IA externa.

El prompt reutilizable está definido en `src/lib/contentImport.ts` y se muestra desde el modal en solo lectura para copiarlo con facilidad.
