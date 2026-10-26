import type { ActivityType, Activity, ActivityDetails, ChoiceOption, MatchingPair, SortingItem, ScenarioStage, ScenarioOption } from './activityEngine'

export const CONTENT_SCHEMA_ID = 'edueval.content' as const
export const CONTENT_SCHEMA_VERSION_V1 = 1 as const
export const CONTENT_SCHEMA_VERSION_V2 = 2 as const
export const CONTENT_SCHEMA_VERSION = 2 as const

// --- Contrato heredado v1 ---
export type ImportedDifficulty = 'Inicial' | 'Intermedio' | 'Avanzado'

export type ImportedConcept = {
  name: string
  definition: string
  example?: string
}

export type ImportedSituation = {
  title: string
  context: string
  decision: string
  consequence: string
}

export type ImportedContent = {
  title: string
  subject: string
  description: string
  objective: string
  competency: string
  difficulty: ImportedDifficulty
  concepts: ImportedConcept[]
  situations: ImportedSituation[]
  processSteps: string[]
  categories: string[]
}

export type ContentImportDocumentV1 = {
  schema: typeof CONTENT_SCHEMA_ID
  version: typeof CONTENT_SCHEMA_VERSION_V1
  content: ImportedContent
}

// --- Contrato v2 con banco de actividades ---
export type ImportedTopicV2 = {
  title: string
  subject: string
  objective: string
  competency: string
  summary: string
}

export type ImportedTrueFalseV2 = {
  id?: string
  type: 'trueFalse'
  statement: string
  correct: boolean
  hint: string
  explanation?: string
}

export type ImportedSingleChoiceV2 = {
  id?: string
  type: 'singleChoice'
  prompt: string
  options: Array<{ id?: string; label: string; correct: boolean }>
  hint: string
  explanation?: string
}

export type ImportedMatchingV2 = {
  id?: string
  type: 'matching'
  prompt: string
  pairs: Array<{ id?: string; left: string; right: string }>
  hint: string
  explanation?: string
}

export type ImportedSortingV2 = {
  id?: string
  type: 'sorting'
  prompt: string
  categories: string[]
  items: Array<{ id?: string; label: string; category: string }>
  hint: string
  explanation?: string
}

export type ImportedOrderingV2 = {
  id?: string
  type: 'ordering'
  prompt: string
  steps: string[]
  hint: string
  explanation?: string
}

export type ImportedScenarioOptionV2 = {
  id?: string
  text: string
  consequence: string
  feedback: string
  recommended: boolean
}

export type ImportedScenarioStageV2 = {
  id?: string
  title: string
  prompt: string
  options: ImportedScenarioOptionV2[]
}

export type ImportedScenarioV2 = {
  id?: string
  type: 'scenario'
  situation: string
  stages: ImportedScenarioStageV2[]
  hint: string
  explanation?: string
}

export type ImportedActivityV2 =
  | ImportedTrueFalseV2
  | ImportedSingleChoiceV2
  | ImportedMatchingV2
  | ImportedSortingV2
  | ImportedOrderingV2
  | ImportedScenarioV2

export type ContentImportDocumentV2 = {
  schema: typeof CONTENT_SCHEMA_ID
  version: typeof CONTENT_SCHEMA_VERSION_V2
  topic: ImportedTopicV2
  activities: ImportedActivityV2[]
}

export type ContentImportDocument = ContentImportDocumentV1 | ContentImportDocumentV2

export type ContentImportIssue = { path: string; message: string }

export type ContentCompatibility = Record<ActivityType, { available: boolean; reason: string }>

/** Actividad que requiere reparación manual en el editor antes de poder ser publicada */
export type ActivityNeedingRepair = {
  raw: Record<string, unknown>
  type: ActivityType
  title: string
  prompt: string
  reason: string
  partialActivity?: Partial<Activity>
}

/** Estructura agrupada para renderizar en la vista de tarjetas móviles y de escritorio */
export type VariantsGrouped = Record<ActivityType, {
  label: string
  valid: Activity[]
  needsRepair: ActivityNeedingRepair[]
}>

export type ContentImportResultV2 = {
  ok: true
  version: 2
  topic: ImportedTopicV2
  validActivities: Activity[]
  activitiesNeedingRepair: ActivityNeedingRepair[]
  variantsByType: VariantsGrouped
  compatibility: ContentCompatibility
}

export type ContentImportResultV1 = {
  ok: true
  version: 1
  document: ContentImportDocumentV1
  compatibility: ContentCompatibility
}

export type ContentImportResult =
  | ContentImportResultV2
  | ContentImportResultV1
  | { ok: false; issues: ContentImportIssue[] }

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  trueFalse: 'Falso y Verdadero',
  singleChoice: 'Selección Única',
  matching: 'Asociación de Conceptos',
  sorting: 'Clasificación',
  ordering: 'Ordenamiento de Procesos',
  scenario: 'Escenarios de Decisión',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function extraKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: ContentImportIssue[]) {
  Object.keys(value).filter((key) => !allowed.has(key)).forEach((key) => issues.push({ path: `${path}.${key}`, message: 'Campo no permitido para este esquema.' }))
}

function readString(value: unknown, path: string, issues: ContentImportIssue[], options: { required?: boolean; max?: number } = {}): string {
  if (typeof value !== 'string') {
    issues.push({ path, message: options.required ? 'Este campo es obligatorio y debe ser texto.' : 'Este campo debe ser texto.' })
    return ''
  }
  const normalized = value.trim()
  if (options.required && !normalized) issues.push({ path, message: 'Este campo no puede estar vacío.' })
  if (options.max && normalized.length > options.max) issues.push({ path, message: `No puede superar ${options.max} caracteres.` })
  return normalized
}

function readStringList(value: unknown, path: string, issues: ContentImportIssue[], maxItems: number): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de textos.' })
    return []
  }
  if (value.length > maxItems) issues.push({ path, message: `No puede contener más de ${maxItems} elementos.` })
  return value.map((item, index) => readString(item, `${path}[${index}]`, issues, { required: true, max: 500 })).filter(Boolean)
}

// ==========================================
// VALIDACIÓN QUIRÚRGICA DE ACTIVIDADES V2
// ==========================================

function validateTrueFalseActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const statement = typeof raw.statement === 'string' ? raw.statement.trim() : ''
  if (!statement) return { ok: false, reason: 'El enunciado (statement) no puede estar vacío.' }
  if (statement.length > 500) return { ok: false, reason: 'El enunciado no puede superar 500 caracteres.' }
  if (typeof raw.correct !== 'boolean') return { ok: false, reason: 'La clave "correct" debe ser exactamente true o false.' }
  
  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `tf-${Date.now()}-${index}`
  const title = `${topic.title} · Comprueba`
  const answer = raw.correct ? 'Verdadero' : 'Falso'
  const options = ['Verdadero', 'Falso']

  const activity: Activity = {
    id,
    title,
    type: 'trueFalse',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt: statement,
    options,
    answer,
    feedback: hint,
    status: 'pending',
    details: {
      trueFalse: {
        statement,
        correct: raw.correct,
        explanation: explanation || hint,
        hint,
      },
    },
  }
  return { ok: true, activity }
}

function validateSingleChoiceActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return { ok: false, reason: 'La pregunta (prompt) no puede estar vacía.' }
  if (prompt.length > 600) return { ok: false, reason: 'La pregunta no puede superar 600 caracteres.' }
  
  if (!Array.isArray(raw.options) || raw.options.length < 3 || raw.options.length > 5) {
    return { ok: false, reason: 'Debe contener entre 3 y 5 opciones de respuesta.' }
  }

  const options: ChoiceOption[] = []
  let correctCount = 0

  for (let i = 0; i < raw.options.length; i++) {
    const opt = raw.options[i]
    if (!isRecord(opt)) return { ok: false, reason: `La opción [${i}] debe ser un objeto.` }
    const label = typeof opt.label === 'string' ? opt.label.trim() : ''
    if (!label) return { ok: false, reason: `El texto de la opción [${i}] no puede estar vacío.` }
    const correct = Boolean(opt.correct)
    if (correct) correctCount++
    options.push({
      id: typeof opt.id === 'string' && opt.id ? opt.id : `opt-${index}-${i}`,
      label,
      correct,
    })
  }

  if (correctCount !== 1) {
    return { ok: false, reason: `Debe tener exactamente 1 respuesta correcta; se encontraron ${correctCount}.` }
  }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const correctOption = options.find((opt) => opt.correct)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `sc-${Date.now()}-${index}`
  const title = `${topic.title} · Elige`

  const activity: Activity = {
    id,
    title,
    type: 'singleChoice',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt,
    options: options.map((opt) => opt.label),
    answer: correctOption ? correctOption.label : '',
    feedback: hint,
    status: 'pending',
    details: {
      singleChoice: {
        options,
        hint,
        explanation: explanation || hint,
      },
    },
  }
  return { ok: true, activity }
}

function validateMatchingActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return { ok: false, reason: 'La instrucción (prompt) no puede estar vacía.' }
  if (prompt.length > 600) return { ok: false, reason: 'La instrucción no puede superar 600 caracteres.' }

  if (!Array.isArray(raw.pairs) || raw.pairs.length < 2 || raw.pairs.length > 6) {
    return { ok: false, reason: 'Debe contener entre 2 y 6 pares de asociación.' }
  }

  const pairs: MatchingPair[] = []
  for (let i = 0; i < raw.pairs.length; i++) {
    const pair = raw.pairs[i]
    if (!isRecord(pair)) return { ok: false, reason: `El par [${i}] debe ser un objeto.` }
    const left = typeof pair.left === 'string' ? pair.left.trim() : ''
    const right = typeof pair.right === 'string' ? pair.right.trim() : ''
    if (!left || !right) return { ok: false, reason: `El par [${i}] tiene campos vacíos (requiere left y right).` }
    pairs.push({
      id: typeof pair.id === 'string' && pair.id ? pair.id : `p-${index}-${i}`,
      left,
      right,
    })
  }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const definitions = pairs.map((p) => `${p.left} → ${p.right}`)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `match-${Date.now()}-${index}`
  const title = `${topic.title} · Relaciona`

  const activity: Activity = {
    id,
    title,
    type: 'matching',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt,
    options: definitions,
    answer: definitions,
    feedback: hint,
    status: 'pending',
    details: {
      matching: {
        pairs,
        hint,
        explanation: explanation || hint,
      },
    },
  }
  return { ok: true, activity }
}

function validateSortingActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return { ok: false, reason: 'La instrucción (prompt) no puede estar vacía.' }

  if (!Array.isArray(raw.categories) || raw.categories.length < 2 || raw.categories.length > 5) {
    return { ok: false, reason: 'Debe contener entre 2 y 5 categorías.' }
  }

  const categories = raw.categories.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
  if (categories.length < 2) return { ok: false, reason: 'Requiere al menos 2 nombres de categoría válidos.' }
  const categorySet = new Set(categories)

  if (!Array.isArray(raw.items) || raw.items.length < 2 || raw.items.length > 12) {
    return { ok: false, reason: 'Debe contener entre 2 y 12 elementos para clasificar.' }
  }

  const items: SortingItem[] = []
  for (let i = 0; i < raw.items.length; i++) {
    const item = raw.items[i]
    if (!isRecord(item)) return { ok: false, reason: `El elemento [${i}] debe ser un objeto.` }
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    const category = typeof item.category === 'string' ? item.category.trim() : ''
    if (!label) return { ok: false, reason: `El elemento [${i}] tiene etiqueta vacía.` }
    if (!categorySet.has(category)) {
      return { ok: false, reason: `El elemento "${label}" tiene la categoría "${category}", que no está en la lista de categorías declaradas.` }
    }
    items.push({
      id: typeof item.id === 'string' && item.id ? item.id : `it-${index}-${i}`,
      label,
      category,
    })
  }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `sort-${Date.now()}-${index}`
  const title = `${topic.title} · Clasifica`

  const activity: Activity = {
    id,
    title,
    type: 'sorting',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt,
    options: items.map((it) => it.label),
    answer: items.map((it) => it.category),
    feedback: hint,
    status: 'pending',
    details: {
      sorting: {
        categories,
        items,
        hint,
        explanation: explanation || hint,
      },
    },
  }
  return { ok: true, activity }
}

function validateOrderingActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return { ok: false, reason: 'La instrucción (prompt) no puede estar vacía.' }

  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > 8) {
    return { ok: false, reason: 'Debe contener entre 2 y 8 pasos ordenados.' }
  }

  const steps = raw.steps.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
  if (steps.length < 2) return { ok: false, reason: 'Requiere al menos 2 pasos de proceso válidos.' }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `ord-${Date.now()}-${index}`
  const title = `${topic.title} · Ordena`

  const activity: Activity = {
    id,
    title,
    type: 'ordering',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt,
    options: steps,
    answer: steps,
    feedback: hint,
    status: 'pending',
    details: {
      ordering: {
        steps,
        hint,
        explanation: explanation || hint,
      },
    },
  }
  return { ok: true, activity }
}

function validateScenarioActivity(
  raw: Record<string, unknown>,
  path: string,
  index: number,
  topic: ImportedTopicV2
): { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> } {
  const situation = typeof raw.situation === 'string' ? raw.situation.trim() : ''
  if (!situation) return { ok: false, reason: 'La situación contextualizada no puede estar vacía.' }

  if (!Array.isArray(raw.stages) || raw.stages.length < 1) {
    return { ok: false, reason: 'Debe contener al menos 1 etapa de decisión ("stages").' }
  }

  const stages: ScenarioStage[] = []
  for (let s = 0; s < raw.stages.length; s++) {
    const stage = raw.stages[s]
    if (!isRecord(stage)) return { ok: false, reason: `La etapa [${s}] debe ser un objeto.` }
    const stageTitle = typeof stage.title === 'string' ? stage.title.trim() : `Etapa ${s + 1}`
    const stagePrompt = typeof stage.prompt === 'string' ? stage.prompt.trim() : situation
    if (!Array.isArray(stage.options) || stage.options.length < 2) {
      return { ok: false, reason: `La etapa [${s}] debe contener al menos 2 opciones de decisión.` }
    }

    const options: ScenarioOption[] = []
    let recommendedCount = 0

    for (let o = 0; o < stage.options.length; o++) {
      const opt = stage.options[o]
      if (!isRecord(opt)) return { ok: false, reason: `La opción [${o}] de la etapa [${s}] debe ser un objeto.` }
      const text = typeof opt.text === 'string' ? opt.text.trim() : ''
      if (!text) return { ok: false, reason: `La opción [${o}] de la etapa [${s}] tiene texto vacío.` }
      const consequence = typeof opt.consequence === 'string' ? opt.consequence.trim() : ''
      const feedback = typeof opt.feedback === 'string' ? opt.feedback.trim() : consequence
      const recommended = Boolean(opt.recommended)
      if (recommended) recommendedCount++
      options.push({
        id: typeof opt.id === 'string' && opt.id ? opt.id : `sc-opt-${index}-${s}-${o}`,
        text,
        consequence,
        feedback,
        recommended,
      })
    }

    if (recommendedCount !== 1) {
      return { ok: false, reason: `La etapa [${s}] debe tener exactamente 1 opción recomendada; tiene ${recommendedCount}.` }
    }

    stages.push({
      id: typeof stage.id === 'string' && stage.id ? stage.id : `stg-${index}-${s}`,
      title: stageTitle,
      prompt: stagePrompt,
      options,
    })
  }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim() : ''
  if (!hint) return { ok: false, reason: 'Debe incluir una pista pedagógica (hint) para el estudiante.' }
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : ''

  const firstStage = stages[0]
  const firstRecommended = firstStage.options.find((o) => o.recommended)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `scen-${Date.now()}-${index}`
  const title = `${topic.title} · Decisión`

  const activity: Activity = {
    id,
    title,
    type: 'scenario',
    topic: topic.subject,
    difficulty: 'Intermedio',
    prompt: situation,
    options: firstStage.options.map((o) => o.text),
    answer: firstRecommended ? firstRecommended.text : '',
    feedback: firstRecommended ? firstRecommended.consequence : hint,
    status: 'pending',
    details: {
      scenario: {
        situation,
        stages,
        hint,
        explanation: explanation || hint,
      },
    },
  }
  return { ok: true, activity }
}

// ==========================================
// VALIDACIÓN DEL DOCUMENTO V2 RESILIENTE
// ==========================================

export function validateV2Document(value: Record<string, unknown>): ContentImportResultV2 | { ok: false; issues: ContentImportIssue[] } {
  const issues: ContentImportIssue[] = []
  if (!isRecord(value.topic)) {
    issues.push({ path: 'topic', message: 'Debe existir un objeto topic con los metadatos del tema.' })
    return { ok: false, issues }
  }

  const topicRaw = value.topic
  const topic: ImportedTopicV2 = {
    title: readString(topicRaw.title, 'topic.title', issues, { required: true, max: 180 }),
    subject: readString(topicRaw.subject, 'topic.subject', issues, { required: true, max: 120 }),
    objective: readString(topicRaw.objective, 'topic.objective', issues, { required: true, max: 1200 }),
    competency: readString(topicRaw.competency, 'topic.competency', issues, { required: true, max: 1200 }),
    summary: readString(topicRaw.summary, 'topic.summary', issues, { required: true, max: 2000 }),
  }

  if (issues.length) return { ok: false, issues }

  if (!Array.isArray(value.activities)) {
    issues.push({ path: 'activities', message: 'Debe existir una lista "activities" con el banco de actividades.' })
    return { ok: false, issues }
  }

  const validActivities: Activity[] = []
  const activitiesNeedingRepair: ActivityNeedingRepair[] = []

  const variantsByType: VariantsGrouped = {
    trueFalse: { label: ACTIVITY_LABELS.trueFalse, valid: [], needsRepair: [] },
    singleChoice: { label: ACTIVITY_LABELS.singleChoice, valid: [], needsRepair: [] },
    matching: { label: ACTIVITY_LABELS.matching, valid: [], needsRepair: [] },
    sorting: { label: ACTIVITY_LABELS.sorting, valid: [], needsRepair: [] },
    ordering: { label: ACTIVITY_LABELS.ordering, valid: [], needsRepair: [] },
    scenario: { label: ACTIVITY_LABELS.scenario, valid: [], needsRepair: [] },
  }

  value.activities.forEach((actRaw, index) => {
    const actPath = `activities[${index}]`
    if (!isRecord(actRaw)) {
      activitiesNeedingRepair.push({
        raw: {},
        type: 'singleChoice',
        title: `Actividad ${index + 1}`,
        prompt: '',
        reason: `${actPath}: La actividad no es un objeto JSON válido.`,
      })
      return
    }

    const type = typeof actRaw.type === 'string' ? actRaw.type : ''
    const validTypes: ActivityType[] = ['trueFalse', 'singleChoice', 'matching', 'sorting', 'ordering', 'scenario']
    if (!validTypes.includes(type as ActivityType)) {
      activitiesNeedingRepair.push({
        raw: actRaw,
        type: 'singleChoice',
        title: (typeof actRaw.prompt === 'string' ? actRaw.prompt : '') || `Actividad ${index + 1}`,
        prompt: '',
        reason: `${actPath}.type: Tipo de actividad desconocido "${type}". Debe ser uno de los 6 formatos admitidos.`,
      })
      return
    }

    const actType = type as ActivityType
    let result: { ok: true; activity: Activity } | { ok: false; reason: string; partial?: Partial<Activity> }

    switch (actType) {
      case 'trueFalse':
        result = validateTrueFalseActivity(actRaw, actPath, index, topic)
        break
      case 'singleChoice':
        result = validateSingleChoiceActivity(actRaw, actPath, index, topic)
        break
      case 'matching':
        result = validateMatchingActivity(actRaw, actPath, index, topic)
        break
      case 'sorting':
        result = validateSortingActivity(actRaw, actPath, index, topic)
        break
      case 'ordering':
        result = validateOrderingActivity(actRaw, actPath, index, topic)
        break
      case 'scenario':
        result = validateScenarioActivity(actRaw, actPath, index, topic)
        break
    }

    if (result.ok) {
      validActivities.push(result.activity)
      variantsByType[actType].valid.push(result.activity)
    } else {
      const promptText = typeof actRaw.prompt === 'string' ? actRaw.prompt : typeof actRaw.statement === 'string' ? actRaw.statement : typeof actRaw.situation === 'string' ? actRaw.situation : ''
      const itemNeedingRepair: ActivityNeedingRepair = {
        raw: actRaw,
        type: actType,
        title: `${ACTIVITY_LABELS[actType]} ${variantsByType[actType].needsRepair.length + 1}`,
        prompt: promptText,
        reason: `${actPath}: ${result.reason} Puedes corregirla en el editor de actividades o descartarla.`,
        partialActivity: result.partial,
      }
      activitiesNeedingRepair.push(itemNeedingRepair)
      variantsByType[actType].needsRepair.push(itemNeedingRepair)
    }
  })

  const compatibility: ContentCompatibility = {
    trueFalse: {
      available: variantsByType.trueFalse.valid.length > 0,
      reason: variantsByType.trueFalse.valid.length > 0 ? `${variantsByType.trueFalse.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
    singleChoice: {
      available: variantsByType.singleChoice.valid.length > 0,
      reason: variantsByType.singleChoice.valid.length > 0 ? `${variantsByType.singleChoice.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
    matching: {
      available: variantsByType.matching.valid.length > 0,
      reason: variantsByType.matching.valid.length > 0 ? `${variantsByType.matching.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
    sorting: {
      available: variantsByType.sorting.valid.length > 0,
      reason: variantsByType.sorting.valid.length > 0 ? `${variantsByType.sorting.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
    ordering: {
      available: variantsByType.ordering.valid.length > 0,
      reason: variantsByType.ordering.valid.length > 0 ? `${variantsByType.ordering.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
    scenario: {
      available: variantsByType.scenario.valid.length > 0,
      reason: variantsByType.scenario.valid.length > 0 ? `${variantsByType.scenario.valid.length} variantes listas` : 'No se incluyeron variantes válidas de este formato.',
    },
  }

  return {
    ok: true,
    version: 2,
    topic,
    validActivities,
    activitiesNeedingRepair,
    variantsByType,
    compatibility,
  }
}

// ==========================================
// VALIDACIÓN V1 HEREDADA (RETROCOMPATIBILIDAD)
// ==========================================

const rootKeysV1 = new Set(['schema', 'version', 'content'])
const contentKeysV1 = new Set(['title', 'subject', 'description', 'objective', 'competency', 'difficulty', 'concepts', 'situations', 'processSteps', 'categories'])
const conceptKeysV1 = new Set(['name', 'definition', 'example'])
const situationKeysV1 = new Set(['title', 'context', 'decision', 'consequence'])

function readConceptsV1(value: unknown, issues: ContentImportIssue[]): ImportedConcept[] {
  const path = 'content.concepts'
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de conceptos.' })
    return []
  }
  if (value.length > 50) issues.push({ path, message: 'No puede contener más de 50 conceptos.' })
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'Cada concepto debe ser un objeto.' })
      return { name: '', definition: '' }
    }
    extraKeys(item, conceptKeysV1, itemPath, issues)
    return {
      name: readString(item.name, `${itemPath}.name`, issues, { required: true, max: 180 }),
      definition: readString(item.definition, `${itemPath}.definition`, issues, { required: true, max: 1200 }),
      example: item.example === undefined ? undefined : readString(item.example, `${itemPath}.example`, issues, { max: 600 }),
    }
  })
}

function readSituationsV1(value: unknown, issues: ContentImportIssue[]): ImportedSituation[] {
  const path = 'content.situations'
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Debe ser una lista de situaciones.' })
    return []
  }
  if (value.length > 50) issues.push({ path, message: 'No puede contener más de 50 situaciones.' })
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'Cada situación debe ser un objeto.' })
      return { title: '', context: '', decision: '', consequence: '' }
    }
    extraKeys(item, situationKeysV1, itemPath, issues)
    return {
      title: readString(item.title, `${itemPath}.title`, issues, { required: true, max: 180 }),
      context: readString(item.context, `${itemPath}.context`, issues, { required: true, max: 1500 }),
      decision: readString(item.decision, `${itemPath}.decision`, issues, { required: true, max: 500 }),
      consequence: readString(item.consequence, `${itemPath}.consequence`, issues, { required: true, max: 1000 }),
    }
  })
}

export function validateV1Document(value: Record<string, unknown>): ContentImportResultV1 | { ok: false; issues: ContentImportIssue[] } {
  const issues: ContentImportIssue[] = []
  extraKeys(value, rootKeysV1, '$', issues)
  if (!isRecord(value.content)) {
    issues.push({ path: 'content', message: 'Debe existir un objeto content con el contenido pedagógico.' })
    return { ok: false, issues }
  }
  const content = value.content
  extraKeys(content, contentKeysV1, 'content', issues)
  const rawDifficulty = typeof content.difficulty === 'string' ? content.difficulty.trim() : ''
  const difficulty: ImportedDifficulty = rawDifficulty === 'Inicial' || rawDifficulty === 'Intermedio' || rawDifficulty === 'Avanzado'
    ? rawDifficulty
    : 'Intermedio'
  if (content.difficulty !== undefined && rawDifficulty !== '' && rawDifficulty !== 'Inicial' && rawDifficulty !== 'Intermedio' && rawDifficulty !== 'Avanzado') {
    issues.push({ path: 'content.difficulty', message: 'Si se incluye, debe ser Inicial, Intermedio o Avanzado.' })
  }
  const normalized: ImportedContent = {
    title: readString(content.title, 'content.title', issues, { required: true, max: 180 }),
    subject: readString(content.subject, 'content.subject', issues, { required: true, max: 120 }),
    description: readString(content.description, 'content.description', issues, { required: true, max: 1500 }),
    objective: readString(content.objective, 'content.objective', issues, { required: true, max: 1200 }),
    competency: readString(content.competency, 'content.competency', issues, { required: true, max: 1200 }),
    difficulty,
    concepts: readConceptsV1(content.concepts, issues),
    situations: readSituationsV1(content.situations, issues),
    processSteps: readStringList(content.processSteps, 'content.processSteps', issues, 50),
    categories: readStringList(content.categories, 'content.categories', issues, 50),
  }
  if (issues.length) return { ok: false, issues }
  const document: ContentImportDocumentV1 = { schema: CONTENT_SCHEMA_ID, version: CONTENT_SCHEMA_VERSION_V1, content: normalized }
  return { ok: true, version: 1, document, compatibility: detectContentCompatibility(normalized) }
}

export function validateContentDocument(value: unknown): ContentImportResult {
  const issues: ContentImportIssue[] = []
  if (!isRecord(value)) return { ok: false, issues: [{ path: '$', message: 'El documento debe ser un objeto JSON.' }] }
  
  if (value.schema !== CONTENT_SCHEMA_ID) {
    issues.push({ path: 'schema', message: `Debe ser exactamente "${CONTENT_SCHEMA_ID}".` })
    return { ok: false, issues }
  }

  if (value.version === CONTENT_SCHEMA_VERSION_V2) {
    return validateV2Document(value)
  }

  if (value.version === CONTENT_SCHEMA_VERSION_V1) {
    return validateV1Document(value)
  }

  issues.push({ path: 'version', message: `Versión no compatible (${value.version}). Se esperaba ${CONTENT_SCHEMA_VERSION_V2} o ${CONTENT_SCHEMA_VERSION_V1}.` })
  return { ok: false, issues }
}

export function parseContentImport(raw: string): ContentImportResult {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, issues: [{ path: '$', message: 'El archivo no contiene JSON válido. Copia solo el objeto JSON, sin markdown ni texto adicional.' }] }
  }
  return validateContentDocument(value)
}

export function detectContentCompatibility(content: ImportedContent): ContentCompatibility {
  const concepts = content.concepts.filter((item) => item.name && item.definition)
  const situations = content.situations.filter((item) => item.title && item.context && item.decision && item.consequence)
  const hasConcepts = concepts.length > 0
  const hasSituations = situations.length > 0
  const hasSteps = content.processSteps.length >= 2
  const hasCategories = content.categories.length >= 2
  return {
    trueFalse: { available: hasConcepts || hasSituations, reason: 'Agrega un concepto con definición o una situación completa.' },
    singleChoice: { available: hasConcepts || hasSituations, reason: 'Agrega conceptos o una situación completa.' },
    matching: { available: concepts.length >= 2, reason: 'Agrega al menos dos conceptos con definición.' },
    sorting: { available: hasCategories && hasConcepts, reason: 'Agrega al menos dos categorías y un concepto con definición.' },
    ordering: { available: hasSteps, reason: 'Agrega al menos dos pasos de proceso.' },
    scenario: { available: hasSituations, reason: 'Agrega una situación con contexto, decisión y consecuencia.' },
  }
}

// ==========================================
// PROMPT OFICIAL V1.2 (PROBADO EN AULA)
// ==========================================

export const OFFICIAL_IMPORT_PROMPT = `Actúa como un especialista en evaluación y pedagogía universitaria. Tu tarea es analizar el material académico adjunto (documento, informe o diapositivas PPTX) y transformarlo en un BANCO DE ACTIVIDADES EVALUABLES estructuradas en formato JSON estricto para la plataforma EvaluEdu.

REGLAS CRÍTICAS DE CALIDAD, VARIEDAD Y CONTENIDO:
1. CONFINAMIENTO DOCUMENTAL Y CERO INVENCIÓN: Basa todas las actividades única y exclusivamente en los conceptos, hechos, procedimientos, normativas y casos explícitamente explicados en el cuerpo del material. No inventes datos ni consultes enlaces web o referencias bibliográficas citadas.
2. BANCO DE VARIANTES (OBJETIVO PRIORITARIO: 2 A 4 POR TIPO): No te limites a 1 sola actividad por formato. Explota los distintos conceptos y temas del material para generar un banco variado con MÚLTIPLES ACTIVIDADES de cada tipo compatible (idealmente entre 2 y 4 variantes por tipo). Por ejemplo: 3 o 4 afirmaciones distintas de Falso/Verdadero sobre varios temas, 3 o 4 preguntas de Selección Única, etc. En total, tu banco debería contener entre 8 y 16 actividades si el material lo permite.
3. FLEXIBILIDAD EN MATERIALES BREVES (DIAPOSITIVAS): Si el material es sintético o en diapositivas y un formato solo da para 1 o 2 variantes sólidas, genera solo esas. Si NO hay contenido suficiente para sostener un formato con rigor (por ejemplo, si no hay secuencias para Ordenamiento o situaciones para Escenarios), OMITE por completo ese formato. Jamás fuerces una actividad sin respaldo claro en el texto.
4. PISTA PEDAGÓGICA (hint): Debe ser una orientación conceptual breve y reflexiva para el estudiante que NO revele directa ni indirectamente la respuesta.
5. PROHIBICIÓN EN SELECCIÓN: Prohibido usar opciones como "Todas las anteriores", "Ninguna de las anteriores" o similares. Los distractores deben ser opciones plausibles extraídas del tema.
6. FORMATO DE SALIDA: Devuelve ÚNICAMENTE el bloque JSON válido, sin textos introductorios, saludos ni explicaciones fuera del JSON.

ESPECIFICACIÓN DE LOS 6 FORMATOS:
- trueFalse: Enunciado verificable ("statement"), clave ("correct": true/false) y pista ("hint").
- singleChoice: Pregunta ("prompt"), 3 o 4 "options" con id, label y correct (exactamente una true) y pista ("hint").
- matching: Instrucción ("prompt"), 2 a 5 "pairs" con id, left y right y pista ("hint").
- sorting: Instrucción ("prompt"), 2 a 4 "categories" y 3 a 8 "items" con id, label y category (cada ítem asignado a su categoría exacta) y pista ("hint").
- ordering: Instrucción ("prompt"), 3 a 6 "steps" ordenados en secuencia exacta según el material y pista ("hint").
- scenario: Situación contextualizada ("situation"), pista ("hint") y una etapa ("stages") con pregunta y 2 a 4 opciones de decisión ("options") con id, text, consequence, feedback y recommended (una true).

ESTRUCTURA DEL JSON A DEVOLVER (Observa que los tipos se repiten para formar el banco):
{
  "schema": "edueval.content",
  "version": 2,
  "topic": {
    "title": "Título del tema",
    "subject": "Nombre de la asignatura",
    "objective": "Objetivo pedagógico de la evaluación",
    "competency": "Competencia universitaria evaluada",
    "summary": "Resumen conceptual de 1 o 2 párrafos"
  },
  "activities": [
    {
      "id": "act-1",
      "type": "trueFalse",
      "statement": "Afirmación 1...",
      "correct": true,
      "hint": "..."
    },
    {
      "id": "act-2",
      "type": "trueFalse",
      "statement": "Afirmación 2 sobre otro aspecto del tema...",
      "correct": false,
      "hint": "..."
    },
    {
      "id": "act-3",
      "type": "singleChoice",
      "prompt": "Pregunta 1...",
      "options": [
        { "id": "opt-1", "label": "...", "correct": true },
        { "id": "opt-2", "label": "...", "correct": false },
        { "id": "opt-3", "label": "...", "correct": false }
      ],
      "hint": "..."
    },
    {
      "id": "act-4",
      "type": "singleChoice",
      "prompt": "Pregunta 2 sobre otro concepto...",
      "options": [
        { "id": "opt-4", "label": "...", "correct": true },
        { "id": "opt-5", "label": "...", "correct": false },
        { "id": "opt-6", "label": "...", "correct": false }
      ],
      "hint": "..."
    },
    {
      "id": "act-5",
      "type": "matching",
      "prompt": "Relaciona los conceptos...",
      "pairs": [
        { "id": "p-1", "left": "...", "right": "..." },
        { "id": "p-2", "left": "...", "right": "..." }
      ],
      "hint": "..."
    },
    {
      "id": "act-6",
      "type": "sorting",
      "prompt": "Clasifica según el criterio...",
      "categories": ["Cat A", "Cat B"],
      "items": [
        { "id": "it-1", "label": "...", "category": "Cat A" },
        { "id": "it-2", "label": "...", "category": "Cat B" }
      ],
      "hint": "..."
    },
    {
      "id": "act-7",
      "type": "ordering",
      "prompt": "Ordena la secuencia...",
      "steps": ["Paso 1", "Paso 2", "Paso 3"],
      "hint": "..."
    },
    {
      "id": "act-8",
      "type": "scenario",
      "situation": "Caso práctico...",
      "stages": [
        {
          "id": "stg-1",
          "title": "Decisión",
          "prompt": "...",
          "options": [
            { "id": "sc-1", "text": "...", "consequence": "...", "feedback": "...", "recommended": true },
            { "id": "sc-2", "text": "...", "consequence": "...", "feedback": "...", "recommended": false }
          ]
        }
      ],
      "hint": "..."
    }
  ]
}

[ADJUNTA TU ARCHIVO PPTX O DOCUMENTO AQUÍ]`
