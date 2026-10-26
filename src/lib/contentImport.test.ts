import { describe, expect, it } from 'vitest'
import {
  CONTENT_SCHEMA_ID,
  CONTENT_SCHEMA_VERSION_V1,
  CONTENT_SCHEMA_VERSION_V2,
  detectContentCompatibility,
  OFFICIAL_IMPORT_PROMPT,
  parseContentImport,
  validateContentDocument,
  type ContentImportDocumentV1,
} from './contentImport'

const validDocumentV1: ContentImportDocumentV1 = {
  schema: CONTENT_SCHEMA_ID,
  version: CONTENT_SCHEMA_VERSION_V1,
  content: {
    title: 'Cuidado del agua',
    subject: 'Ciencias naturales',
    description: 'Contenido sobre el uso responsable del agua.',
    objective: 'Explicar acciones para cuidar el agua.',
    competency: 'Analiza decisiones cotidianas y sus consecuencias.',
    difficulty: 'Inicial',
    concepts: [
      { name: 'Reutilización', definition: 'Volver a usar un recurso antes de desecharlo.', example: 'Usar un recipiente varias veces.' },
      { name: 'Consumo responsable', definition: 'Usar solo la cantidad necesaria de agua.', example: 'Cerrar el grifo al cepillarse.' },
    ],
    situations: [{ title: 'Grifo abierto', context: 'Un grifo queda abierto durante el recreo.', decision: 'Cerrar el grifo y avisar.', consequence: 'Se evita desperdiciar agua y se informa del problema.' }],
    processSteps: ['Observar el consumo', 'Identificar el desperdicio', 'Proponer una acción'],
    categories: ['Ahorro', 'Reutilización'],
  },
}

const validDocumentV2 = {
  schema: CONTENT_SCHEMA_ID,
  version: CONTENT_SCHEMA_VERSION_V2,
  topic: {
    title: 'Salud Ambiental, Agua y Nutrición',
    subject: 'Educación Ambiental',
    objective: 'Evaluar la comprensión de los conceptos y riesgos.',
    competency: 'Analiza problemas de salud ambiental y coordina prevención.',
    summary: 'La salud ambiental estudia el entorno y los riesgos sanitarios.',
  },
  activities: [
    {
      id: 'act-1',
      type: 'trueFalse',
      statement: 'La salud ambiental se limita a la limpieza personal.',
      correct: false,
      hint: 'Revisa los componentes de la higiene ambiental.',
    },
    {
      id: 'act-2',
      type: 'trueFalse',
      statement: 'El riesgo ambiental surge de peligro, exposición y vulnerabilidad.',
      correct: true,
      hint: 'Considera los tres componentes explicados.',
    },
    {
      id: 'act-3',
      type: 'singleChoice',
      prompt: '¿Cuál corresponde a una dimensión de la seguridad alimentaria?',
      options: [
        { id: 'opt-1', label: 'Estabilidad', correct: true },
        { id: 'opt-2', label: 'Radiación', correct: false },
        { id: 'opt-3', label: 'Urbanización', correct: false },
      ],
      hint: 'Recuerda las cuatro dimensiones.',
    },
    {
      id: 'act-4',
      type: 'matching',
      prompt: 'Relaciona cada concepto con su definición.',
      pairs: [
        { id: 'p-1', left: 'Peligro', right: 'Capacidad de causar daño.' },
        { id: 'p-2', left: 'Exposición', right: 'Contacto con el agente.' },
      ],
      hint: 'Diferencia peligro de exposición.',
    },
    {
      id: 'act-5',
      type: 'sorting',
      prompt: 'Clasifica según factor biótico o abiótico.',
      categories: ['Factor biótico', 'Factor abiótico'],
      items: [
        { id: 'it-1', label: 'Microorganismos', category: 'Factor biótico' },
        { id: 'it-2', label: 'Agua', category: 'Factor abiótico' },
      ],
      hint: 'Los bióticos son organismos vivos.',
    },
    {
      id: 'act-6',
      type: 'ordering',
      prompt: 'Ordena la secuencia de evaluación de riesgo.',
      steps: ['Identificar peligro', 'Analizar exposición', 'Caracterizar riesgo'],
      hint: 'Sigue la secuencia metodológica.',
    },
    {
      id: 'act-7',
      type: 'scenario',
      situation: 'En una comunidad hay agua de calidad incierta y aumento de vectores.',
      stages: [
        {
          id: 'stg-1',
          title: 'Decisión',
          prompt: '¿Cuál es la respuesta más coherente?',
          options: [
            { id: 'sc-1', text: 'Coordinar evaluación integral y prevención.', consequence: 'Aborda la causa.', feedback: 'Correcto', recommended: true },
            { id: 'sc-2', text: 'Esperar que aumenten los casos.', consequence: 'Retrasa la ayuda.', feedback: 'Inadecuado', recommended: false },
          ],
        },
      ],
      hint: 'Considera el enfoque integral preventivo.',
    },
  ],
}

describe('importación JSON de contenido (v1 y v2)', () => {
  describe('contrato v2 con banco de actividades', () => {
    it('valida con éxito un documento v2 completo y agrupa variantes por tipo', () => {
      const result = validateContentDocument(validDocumentV2)
      expect(result.ok).toBe(true)
      if (result.ok && result.version === 2) {
        expect(result.validActivities.length).toBe(7)
        expect(result.activitiesNeedingRepair.length).toBe(0)
        expect(result.variantsByType.trueFalse.valid.length).toBe(2)
        expect(result.variantsByType.singleChoice.valid.length).toBe(1)
        expect(result.variantsByType.matching.valid.length).toBe(1)
        expect(result.variantsByType.sorting.valid.length).toBe(1)
        expect(result.variantsByType.ordering.valid.length).toBe(1)
        expect(result.variantsByType.scenario.valid.length).toBe(1)
        expect(result.compatibility.trueFalse.available).toBe(true)
      }
    })

    it('aplica importación resiliente cuando una actividad tiene un error, permitiendo corregirla en el editor', () => {
      const docWithFlaw = {
        ...validDocumentV2,
        activities: [
          ...validDocumentV2.activities,
          {
            id: 'flawed-sc',
            type: 'singleChoice',
            prompt: 'Pregunta con dos respuestas correctas por error de la IA',
            options: [
              { id: 'f-1', label: 'Opción A', correct: true },
              { id: 'f-2', label: 'Opción B', correct: true }, // Error: dos correctas
              { id: 'f-3', label: 'Opción C', correct: false },
            ],
            hint: 'Pista válida',
          },
        ],
      }
      const result = validateContentDocument(docWithFlaw)
      expect(result.ok).toBe(true)
      if (result.ok && result.version === 2) {
        expect(result.validActivities.length).toBe(7)
        expect(result.activitiesNeedingRepair.length).toBe(1)
        const repaired = result.activitiesNeedingRepair[0]
        expect(repaired.type).toBe('singleChoice')
        expect(repaired.reason).toContain('exactamente 1 respuesta correcta')
        expect(repaired.reason).toContain('editor de actividades')
        expect(result.variantsByType.singleChoice.needsRepair.length).toBe(1)
      }
    })

    it('detecta error en clasificación cuando un ítem tiene una categoría no declarada', () => {
      const docWithSortingError = {
        ...validDocumentV2,
        activities: [
          {
            id: 'bad-sorting',
            type: 'sorting',
            prompt: 'Clasifica elementos',
            categories: ['Química', 'Física'],
            items: [
              { id: 'it-1', label: 'Átomo', category: 'Química' },
              { id: 'it-2', label: 'Célula', category: 'Biología' }, // Error: 'Biología' no está en categories
            ],
            hint: 'Revisa las categorías.',
          },
        ],
      }
      const result = validateContentDocument(docWithSortingError)
      expect(result.ok).toBe(true)
      if (result.ok && result.version === 2) {
        expect(result.validActivities.length).toBe(0)
        expect(result.activitiesNeedingRepair.length).toBe(1)
        expect(result.activitiesNeedingRepair[0].reason).toContain('Biología')
      }
    })

    it('rechaza si falta el objeto topic en v2', () => {
      const docWithoutTopic = {
        schema: CONTENT_SCHEMA_ID,
        version: CONTENT_SCHEMA_VERSION_V2,
        activities: [],
      }
      const result = validateContentDocument(docWithoutTopic)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.issues[0].path).toBe('topic')
      }
    })
  })

  describe('retrocompatibilidad v1 heredada', () => {
    it('acepta un documento v1 completo y detecta los seis formatos compatibles', () => {
      const result = validateContentDocument(validDocumentV1)
      expect(result.ok).toBe(true)
      if (result.ok && result.version === 1) {
        expect(Object.values(result.compatibility).every((item) => item.available)).toBe(true)
      }
    })

    it('asigna dificultad interna por defecto en v1 cuando no se envía en el JSON', () => {
      const { difficulty: _omitted, ...contentWithoutDifficulty } = validDocumentV1.content
      const result = validateContentDocument({ ...validDocumentV1, content: contentWithoutDifficulty })
      expect(result.ok).toBe(true)
      if (result.ok && result.version === 1) {
        expect(result.document.content.difficulty).toBe('Intermedio')
      }
    })

    it('calcula compatibilidad v1 a partir de contenido normalizado', () => {
      const compatibility = detectContentCompatibility(validDocumentV1.content)
      expect(compatibility.matching.available).toBe(true)
      expect(compatibility.ordering.available).toBe(true)
      expect(compatibility.sorting.available).toBe(true)
    })
  })

  describe('errores generales de sintaxis y esquema', () => {
    it('rechaza JSON inválido con un mensaje orientado al docente', () => {
      const result = parseContentImport('{ contenido roto')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues[0].message).toContain('JSON válido')
    })

    it('rechaza una versión o identificador de esquema no admitidos', () => {
      const result = validateContentDocument({ schema: 'otro.formato', version: 99 })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['schema']))
      }
    })
  })

  describe('prompt oficial v1.2', () => {
    it('contiene las directivas universitarias, de variantes y los 6 contratos', () => {
      expect(OFFICIAL_IMPORT_PROMPT).toContain('especialista en evaluación y pedagogía universitaria')
      expect(OFFICIAL_IMPORT_PROMPT).toContain('BANCO DE VARIANTES (OBJETIVO PRIORITARIO: 2 A 4 POR TIPO)')
      expect(OFFICIAL_IMPORT_PROMPT).toContain('CONFINAMIENTO DOCUMENTAL Y CERO INVENCIÓN')
      expect(OFFICIAL_IMPORT_PROMPT).toContain('"schema": "edueval.content"')
      expect(OFFICIAL_IMPORT_PROMPT).toContain('"version": 2')
      expect(OFFICIAL_IMPORT_PROMPT).not.toContain('"difficulty"')
    })
  })
})
