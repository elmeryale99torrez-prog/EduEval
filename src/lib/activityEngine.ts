export type ActivityType = 'trueFalse' | 'singleChoice' | 'matching' | 'sorting' | 'ordering' | 'scenario'

export type ScenarioOption = { id: string; text: string; consequence: string; feedback: string; recommended: boolean }
export type ScenarioStage = { id: string; title: string; prompt: string; options: ScenarioOption[] }
export type MatchingPair = { id: string; left: string; right: string }
export type SortingItem = { id: string; label: string; category: string }
export type ChoiceOption = { id: string; label: string; correct: boolean }
export type ActivityDetails = {
  // context y hint pertenecen al contrato v1.2 (src/lib/activities/trueFalse.ts); son opcionales para actividades heredadas.
  trueFalse?: { statement: string; correct: boolean; explanation: string; context?: string; hint?: string }
  // context, hint y explanation pertenecen al contrato v1.2 (src/lib/activities/singleChoice.ts); son opcionales para actividades heredadas.
  singleChoice?: { options: ChoiceOption[]; context?: string; hint?: string; explanation?: string }
  // context, hint y explanation pertenecen al contrato v1.2 (src/lib/activities/matching.ts); son opcionales para actividades heredadas.
  matching?: { pairs: MatchingPair[]; context?: string; hint?: string; explanation?: string }
  // context, hint y explanation pertenecen al contrato v1.2 (src/lib/activities/sorting.ts); son opcionales para actividades heredadas.
  sorting?: { categories: string[]; items: SortingItem[]; context?: string; hint?: string; explanation?: string }
  // context, hint y explanation pertenecen al contrato v1.2 (src/lib/activities/ordering.ts); son opcionales para actividades heredadas.
  ordering?: { steps: string[]; context?: string; hint?: string; explanation?: string }
  // hint y explanation pertenecen al contrato v1.2 (src/lib/activities/scenario.ts); son opcionales para actividades heredadas.
  scenario?: { situation: string; stages: ScenarioStage[]; hint?: string; explanation?: string }
}

export type Activity = {
  id: string
  templateId?: string
  title: string
  type: ActivityType
  topic: string
  difficulty: 'Inicial' | 'Intermedio' | 'Avanzado'
  prompt: string
  options: string[]
  answer: string | string[]
  feedback: string
  details?: ActivityDetails
  status: 'published' | 'draft' | 'pending'
  needsRepair?: boolean
  repairReason?: string
  rawImport?: Record<string, unknown>
}

export type ActivityResponse =
  | { type: 'scenario'; choices: Record<string, string> }
  | { type: 'trueFalse'; value: string }
  | { type: 'singleChoice'; value: string }
  | { type: 'matching'; pairs: Record<string, string> }
  | { type: 'sorting'; assignments: Record<string, string> }
  | { type: 'ordering'; order: string[] }

export type RuntimeActivity = {
  scenario: NonNullable<ActivityDetails['scenario']>
  trueFalse: NonNullable<ActivityDetails['trueFalse']>
  matching: NonNullable<ActivityDetails['matching']>
  sorting: NonNullable<ActivityDetails['sorting']>
  ordering: NonNullable<ActivityDetails['ordering']>
  singleChoice: NonNullable<ActivityDetails['singleChoice']>
}

export type EvaluatedResponse = {
  response: string
  status: 'answered' | 'omitted'
  correct: boolean | null
  score: number
}

export function activityRuntime(activity: Activity): RuntimeActivity {
  const details = activity.details ?? {}
  const scenarioOptions = activity.options.map((text, index) => ({ id: `fallback-option-${index}`, text, consequence: activity.feedback, feedback: activity.feedback, recommended: text === activity.answer }))
  const matchingPairs = activity.options.map((option, index) => { const [left, right] = option.split('→').map((part) => part.trim()); return { id: `fallback-pair-${index}`, left: left || option, right: right || option } })
  const sortingAnswer = Array.isArray(activity.answer) ? activity.answer : []
  const sortingItems = activity.options.map((label, index) => ({ id: `fallback-item-${index}`, label, category: sortingAnswer[index] ?? 'Sin categoría' }))
  const orderingSteps = Array.isArray(activity.answer) ? activity.answer : activity.options
  const choiceOptions = activity.options.map((label, index) => ({ id: `fallback-choice-${index}`, label, correct: label === activity.answer }))
  return {
    scenario: details.scenario ?? { situation: activity.prompt, stages: [{ id: 'fallback-stage', title: 'Decisión', prompt: activity.prompt, options: scenarioOptions }] },
    trueFalse: details.trueFalse ?? { statement: activity.prompt, correct: activity.answer === 'Verdadero', explanation: activity.feedback },
    matching: details.matching ?? { pairs: matchingPairs },
    sorting: details.sorting ?? { categories: Array.from(new Set(sortingAnswer)), items: sortingItems },
    ordering: details.ordering ?? { steps: orderingSteps },
    singleChoice: details.singleChoice ?? { options: choiceOptions },
  }
}

export function createInitialResponse(activity: Activity): ActivityResponse {
  if (activity.type === 'scenario') return { type: 'scenario', choices: {} }
  if (activity.type === 'matching') return { type: 'matching', pairs: {} }
  if (activity.type === 'sorting') return { type: 'sorting', assignments: {} }
  if (activity.type === 'ordering') return { type: 'ordering', order: shuffleItems(activityRuntime(activity).ordering.steps) }
  return { type: activity.type, value: '' }
}

export function isResponseComplete(activity: Activity, response: ActivityResponse): boolean {
  const runtime = activityRuntime(activity)
  if (response.type === 'scenario') return runtime.scenario.stages.length > 0 && runtime.scenario.stages.every((stage) => Boolean(response.choices[stage.id]))
  if (response.type === 'trueFalse' || response.type === 'singleChoice') return Boolean(response.value)
  if (response.type === 'matching') return runtime.matching.pairs.length > 0 && runtime.matching.pairs.every((pair) => Boolean(response.pairs[pair.left]))
  if (response.type === 'sorting') return runtime.sorting.items.length > 0 && runtime.sorting.items.every((item) => Boolean(response.assignments[item.id]))
  return response.order.length === runtime.ordering.steps.length && new Set(response.order).size === runtime.ordering.steps.length
}

export function compareActivityResponse(activity: Activity, response: ActivityResponse): boolean {
  if (!isResponseComplete(activity, response)) return false
  const runtime = activityRuntime(activity)
  if (response.type === 'scenario') return activity.type === 'scenario' && runtime.scenario.stages.every((stage) => stage.options.find((option) => option.id === response.choices[stage.id] || option.text === response.choices[stage.id])?.recommended === true)
  if (response.type === 'trueFalse') return activity.type === 'trueFalse' && response.value === (runtime.trueFalse.correct ? 'Verdadero' : 'Falso')
  if (response.type === 'singleChoice') return activity.type === 'singleChoice' && runtime.singleChoice.options.find((option) => option.id === response.value || option.label === response.value)?.correct === true
  if (response.type === 'matching') return activity.type === 'matching' && runtime.matching.pairs.every((pair) => response.pairs[pair.left] === pair.right)
  if (response.type === 'sorting') return activity.type === 'sorting' && runtime.sorting.items.every((item) => response.assignments[item.id] === item.category)
  if (response.type === 'ordering') return activity.type === 'ordering' && response.order.every((step, index) => step === runtime.ordering.steps[index])
  return false
}

export function serializeActivityResponse(response: ActivityResponse): string {
  if (response.type === 'scenario') return Object.entries(response.choices).map(([stage, choice]) => `${stage}: ${choice}`).join(' | ')
  if (response.type === 'trueFalse' || response.type === 'singleChoice') return response.value
  if (response.type === 'matching') return Object.entries(response.pairs).map(([left, right]) => `${left} → ${right}`).join(' | ')
  if (response.type === 'sorting') return Object.entries(response.assignments).map(([item, category]) => `${item} → ${category}`).join(' | ')
  return response.order.join(' → ')
}

export function evaluateActivityResponse(activity: Activity, response: ActivityResponse | undefined, scorePerQuestion: number): EvaluatedResponse {
  if (!response) return { response: '', status: 'omitted', correct: null, score: 0 }
  // Falso/verdadero, Selección única, Asociación, Clasificación, Ordenamiento y Escenario v1.2: una respuesta vacía es una omisión, nunca una respuesta incorrecta.
  if (response.type === 'trueFalse' && activity.type === 'trueFalse' && !response.value) return { response: '', status: 'omitted', correct: null, score: 0 }
  if (response.type === 'singleChoice' && activity.type === 'singleChoice' && !response.value) return { response: '', status: 'omitted', correct: null, score: 0 }
  if (response.type === 'matching' && activity.type === 'matching' && Object.values(response.pairs).every((value) => !value)) return { response: '', status: 'omitted', correct: null, score: 0 }
  if (response.type === 'sorting' && activity.type === 'sorting' && Object.values(response.assignments).every((value) => !value)) return { response: '', status: 'omitted', correct: null, score: 0 }
  if (response.type === 'ordering' && activity.type === 'ordering' && response.order.length === 0) return { response: '', status: 'omitted', correct: null, score: 0 }
  if (response.type === 'scenario' && activity.type === 'scenario' && Object.values(response.choices).every((value) => !value)) return { response: '', status: 'omitted', correct: null, score: 0 }
  const correct = compareActivityResponse(activity, response)
  return { response: serializeActivityResponse(response), status: 'answered', correct, score: correct ? scorePerQuestion : 0 }
}

function shuffleItems<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}
